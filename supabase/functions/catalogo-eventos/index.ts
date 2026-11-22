// catalogo-eventos — recebe os eventos de navegação do catálogo (rastreio PRÓPRIO, anônimo) e grava em `eventos_site`.
//
// Cópia versionada da Edge Function que roda no Supabase (projeto vxrfyprtikznvklodqmx). Só vale depois de publicada lá
// (Supabase MCP `deploy_edge_function` ou `supabase functions deploy catalogo-eventos --no-verify-jwt`).
//
// É separada de `catalogo-api` de propósito: aquela cuida de pedido, cupom e pagamento; aqui o pior que pode acontecer é um
// evento a menos. Público (verify_jwt = false): quem chama é o navegador. Não há cookie nem dado pessoal: id de sessão aleatório
// (sessionStorage), UTMs e, em `dados`, detalhes pequenos (ex.: {"pct":50}, {"seg":42,"scroll":65}, {"campo":"cep"}).
// Nome, telefone, e-mail, CPF e endereço NUNCA entram aqui (o filtro só aceita uma lista fechada de chaves e valores curtos).
//
// POST { acao: "eventos", sessao, utm, referrer, itens: [{ tipo, path, item_codigo?, dados? }, ...] }   (até 25 por chamada)
// POST { acao: "evento", sessao, utm, referrer, tipo, path, item_codigo?, dados? }                      (um só)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

const EVENTOS = new Set([
  "pagina",
  "produto_visto",
  "add_pedido",
  "clique_whatsapp",
  "iniciou_cadastro",
  "scroll", // dados.pct: 25, 50, 75 ou 100
  "secao_vista", // dados.secao: slug da aba que apareceu na tela
  "clique", // dados.alvo: card, aba, hero_cta, hero_foto, avaliacoes, instagram...
  "saiu", // dados.seg (tempo visível na página) e dados.scroll (maior profundidade, em %)
  "campo", // dados.campo: primeiro foco em cada campo do cadastro (só o nome do campo)
  "cep_ok", // CEP completo digitado
  "frete_calculado", // dados.resultado: online, whatsapp, fora_area, retirada...
  "pagamento_acao", // dados.acao: pix_copiado, infinitepay, ja_paguei
  "compra_confirmada", // pagamento confirmado na tela
]);

function limpar(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  // deno-lint-ignore no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function limparUtm(u: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (u && typeof u === "object") {
    for (const k of ["source", "medium", "campaign", "content", "term", "ref"]) {
      const val = limpar((u as Record<string, unknown>)[k], 100);
      if (val) out[k] = val;
    }
  }
  return out;
}

/** Únicas chaves aceitas em `dados` (lista fechada: um nome, telefone ou e-mail enviado por engano é descartado). */
const CHAVES = new Set(["pct", "secao", "alvo", "seg", "scroll", "campo", "resultado", "acao", "valor", "itens", "online"]);

/** Só aceita objeto simples e pequeno: chaves da lista acima, valores curtos. Qualquer outra coisa vira null. */
function limparDados(v: unknown): Record<string, string | number | boolean> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const saida: Record<string, string | number | boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 8)) {
    if (!CHAVES.has(k)) continue;
    if (typeof val === "number" && Number.isFinite(val)) saida[k] = Math.round(val * 100) / 100;
    else if (typeof val === "boolean") saida[k] = val;
    else if (typeof val === "string") saida[k] = limpar(val, 40);
  }
  return Object.keys(saida).length ? saida : null;
}

interface Base {
  sessao: string | null;
  utm: Record<string, string>;
  referrer: string | null;
}

function linha(b: Record<string, unknown>, base: Base) {
  const tipo = limpar(b.tipo, 40);
  if (!EVENTOS.has(tipo)) return null;
  const codigo = limpar(b.item_codigo, 30);
  return {
    tipo,
    sessao: base.sessao,
    path: limpar(b.path, 200) || null,
    item_codigo: /^[A-Z0-9-]{2,30}$/i.test(codigo) ? codigo.toUpperCase() : null,
    utm: base.utm,
    referrer: base.referrer,
    dados: limparDados(b.dados),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, erro: "metodo" });
  if (Number(req.headers.get("content-length") ?? "0") > 20_000) return json(413, { ok: false, erro: "muito_grande" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, erro: "json_invalido" });
  }

  const base: Base = {
    sessao: limpar(body.sessao, 64) || null,
    utm: limparUtm(body.utm),
    referrer: limpar(body.referrer, 200) || null,
  };
  const brutos: Record<string, unknown>[] =
    body.acao === "eventos" && Array.isArray(body.itens) ? (body.itens as Record<string, unknown>[]).slice(0, 25) : body.acao === "evento" ? [body] : [];
  const linhas = brutos.map((i) => (i && typeof i === "object" ? linha(i, base) : null)).filter((l): l is NonNullable<ReturnType<typeof linha>> => l !== null);
  if (linhas.length === 0) return json(400, { ok: false, erro: "evento_invalido" });

  try {
    const { error } = await supabase.from("eventos_site").insert(linhas);
    if (error) console.error("catalogo-eventos: insert falhou:", error.message);
  } catch (e) {
    console.error("catalogo-eventos falhou:", e instanceof Error ? e.message : "erro desconhecido");
  }
  // O rastreio nunca pode atrapalhar a compra: responde ok mesmo se o insert falhar.
  return json(200, { ok: true, n: linhas.length });
});
