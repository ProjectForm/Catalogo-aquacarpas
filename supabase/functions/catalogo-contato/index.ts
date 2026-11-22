// catalogo-contato — guarda o contato (WhatsApp + nome opcional) que a pessoa deixa no aviso de saída do catálogo
// ("Deixe seu contato para receber promoções exclusivas"), COM consentimento, no mini CRM (tabela `contatos`).
//
// Cópia versionada da Edge Function que roda no Supabase (projeto vxrfyprtikznvklodqmx). Só vale depois de publicada lá
// (Supabase MCP `deploy_edge_function` ou `supabase functions deploy catalogo-contato --no-verify-jwt`).
//
// É separada de `catalogo-api` (pedido, cupom, pagamento) e de `catalogo-eventos` (rastreio anônimo) de propósito: aqui entra
// dado pessoal, então a função só faz uma coisa e nada mais.
//
// Público (verify_jwt = false): quem chama é o navegador do cliente. Contra abuso:
//  - isca antirrobô (campo `website`) e tempo mínimo entre abrir o aviso e enviar (`ms`): respondem "ok" sem gravar nada;
//  - telefone validado e normalizado (55 + DDD + número); o mesmo número nunca vira dois contatos;
//  - teto de contatos novos por janela de 10 minutos (contra enxurrada de números inventados);
//  - só grava se `consentimento === true` (o navegador só manda isso quando a pessoa toca no botão "Quero receber").
//
// POST { acao: "contato", nome?, telefone, consentimento: true, website: "", ms, gatilho, path, sessao, utm, carrinho }
//   -> { ok: true, novo: boolean }  ou  { ok: false, erro, mensagem }
//
// Quem já é contato (veio de um pedido, do WhatsApp...) só recebe o consentimento e a etiqueta `lead_catalogo`: não muda de
// etapa, de status nem de modo. Contato novo nasce em modo "humano" (o bot não abre conversa sozinho), etapa "novo".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Aviso interno por WhatsApp (CallMeBot), igual ao dos pedidos. A chave NUNCA fica no código: vem do secret CALLMEBOT_APIKEY.
const CALLMEBOT_APIKEY = Deno.env.get("CALLMEBOT_APIKEY") ?? "";
const CALLMEBOT_PHONE = Deno.env.get("CALLMEBOT_PHONE") || Deno.env.get("WHATSAPP_ATENDIMENTO") || "5517981516665";
const MAX_NOVOS_POR_JANELA = 40; // contatos novos nesta origem em 10 minutos
const TEMPO_MINIMO_MS = 1500; // abrir o aviso, digitar e enviar em menos que isso é robô
const TAG = "lead_catalogo";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

function erro(status: number, codigo: string, mensagem: string) {
  return json(status, { ok: false, erro: codigo, mensagem });
}

function limpar(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  // deno-lint-ignore no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function soDigitos(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/** Devolve o telefone em E.164 sem "+" (55 + DDD + número), inserindo o 9º dígito de celular se faltar. (Igual ao da catalogo-api.) */
function normalizarTelefone(raw: unknown): string | null {
  let d = soDigitos(raw).replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  let local = d.slice(4);
  if (local.length === 8 && /^[6-9]/.test(local)) local = "9" + local; // celular antigo sem o 9
  if (local.length !== 8 && local.length !== 9) return null;
  if (local.length === 9 && local[0] !== "9") return null;
  return "55" + d.slice(2, 4) + local;
}

/** O WhatsApp às vezes entrega o wa_id sem o 9º dígito; casamos com as duas formas. */
function variantesTelefone(p: string): string[] {
  const out = [p];
  const local = p.slice(4);
  if (local.length === 9 && local[0] === "9") out.push(p.slice(0, 4) + local.slice(1));
  if (local.length === 8 && /^[6-9]/.test(local)) out.push(p.slice(0, 4) + "9" + local);
  return out;
}

/** 5517981516665 -> (17) 98151-6665 */
function fmtTelefone(p: string): string {
  const local = p.slice(4);
  const ddd = p.slice(2, 4);
  return local.length === 9 ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
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

const MIDIA_PAGA = new Set(["cpc", "paid", "ads", "paid_social", "paidsocial", "ppc", "ctwa"]);

/** origem do contato: organico | anuncio | direto (mesma regra da catalogo-api) */
function classificarOrigem(utm: Record<string, string>): string {
  if (utm.medium && MIDIA_PAGA.has(utm.medium.toLowerCase())) return "anuncio";
  if (utm.source) return "organico";
  return "direto";
}

/** Nome só se parece nome: sem endereço de site ou e-mail (campo aberto, cola de tudo). */
function nomeLimpo(v: unknown): string {
  const n = limpar(v, 80);
  if (!n || /https?:|www\.|@|\.com\b/i.test(n)) return "";
  return n;
}

const GATILHOS = new Set(["mouse", "ocioso", "voltou", "botao", "outro"]);

/** Manda o aviso para o WhatsApp da equipe. Nunca derruba o cadastro e nunca registra a URL (tem a chave). */
async function avisarEquipe(texto: string): Promise<void> {
  if (!CALLMEBOT_APIKEY) {
    console.warn("CALLMEBOT_APIKEY ausente: aviso à equipe não enviado.");
    return;
  }
  try {
    const url = "https://api.callmebot.com/whatsapp.php" +
      `?phone=${encodeURIComponent(CALLMEBOT_PHONE)}&text=${encodeURIComponent(texto.slice(0, 800))}` +
      `&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const corpo = (await r.text()).replace(/\s+/g, " ").slice(0, 120);
    if (!r.ok) console.error(`CallMeBot respondeu ${r.status}: ${corpo}`);
    else if (/error|invalid/i.test(corpo)) console.error("CallMeBot recusou a mensagem.");
  } catch (e) {
    console.error("CallMeBot falhou:", e instanceof Error ? e.name : "erro desconhecido");
  }
}

async function guardarContato(b: Record<string, unknown>) {
  // isca antirrobô: pessoas não veem o campo. Responde "ok" sem gravar nada.
  if (limpar(b.website, 100)) return json(200, { ok: true, novo: false });
  if (b.consentimento !== true) return erro(422, "sem_consentimento", "Toque em \"Quero receber\" para autorizar o contato.");

  const telefone = normalizarTelefone(b.telefone);
  if (!telefone) return erro(422, "telefone_invalido", "Informe um WhatsApp válido, com DDD.");

  // Rápido demais para ser gente: finge sucesso (robô não aprende nada) e não grava.
  const ms = Number(b.ms);
  if (Number.isFinite(ms) && ms >= 0 && ms < TEMPO_MINIMO_MS) return json(200, { ok: true, novo: false });

  const nome = nomeLimpo(b.nome);
  const utm = limparUtm(b.utm);
  const origem = classificarOrigem(utm);
  const gatilhoBruto = limpar(b.gatilho, 20);
  const gatilho = GATILHOS.has(gatilhoBruto) ? gatilhoBruto : "outro";
  const path = limpar(b.path, 120);
  const carrinho = Math.max(0, Math.min(99, Math.round(Number(b.carrinho) || 0)));
  const agora = new Date().toISOString();
  const variantes = variantesTelefone(telefone);

  const { data: existentes, error: eBusca } = await supabase
    .from("contatos")
    .select("id, nome, telefone, consentimento_marketing, tags")
    .or(`telefone.in.(${variantes.join(",")}),wa_id.in.(${variantes.join(",")})`)
    .limit(1);
  if (eBusca) {
    console.error("catalogo-contato: busca falhou:", eBusca.message);
    return erro(500, "erro_contato", "Não foi possível guardar agora. Tente de novo em instantes.");
  }
  const existente = existentes?.[0];

  if (existente) {
    const upd: Record<string, unknown> = { ultima_interacao_em: agora };
    if (!existente.nome && nome) upd.nome = nome;
    if (!existente.telefone) upd.telefone = telefone;
    if (!existente.consentimento_marketing) {
      upd.consentimento_marketing = true;
      upd.consentimento_em = agora;
    }
    const tags: string[] = Array.isArray(existente.tags) ? existente.tags : [];
    if (!tags.includes(TAG)) upd.tags = [...tags, TAG];
    const { error } = await supabase.from("contatos").update(upd).eq("id", existente.id);
    if (error) {
      console.error("catalogo-contato: atualização falhou:", error.message);
      return erro(500, "erro_contato", "Não foi possível guardar agora. Tente de novo em instantes.");
    }
    return json(200, { ok: true, novo: false });
  }

  // Teto de contatos novos por janela (um bot que passa pela isca e pelo tempo não enche o CRM de números inventados).
  const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("contatos")
    .select("id", { count: "exact", head: true })
    .contains("tags", [TAG])
    .gte("primeiro_contato_em", desde);
  if ((count ?? 0) >= MAX_NOVOS_POR_JANELA) {
    return erro(429, "muitas_tentativas", "Muita gente deixando contato agora. Tente de novo em alguns minutos.");
  }

  const { error } = await supabase.from("contatos").insert({
    wa_id: telefone,
    telefone,
    nome: nome || null,
    origem,
    origem_detalhe: `catalogo_saida:${gatilho}${utm.source ? `:${utm.source}` : ""}${utm.campaign ? `/${utm.campaign}` : ""}`,
    utm_source: utm.source ?? null,
    utm_medium: utm.medium ?? null,
    utm_campaign: utm.campaign ?? null,
    utm_content: utm.content ?? null,
    status_lead: "novo",
    etapa: "novo",
    modo: "humano", // o bot não abre conversa sozinho com quem só deixou o contato
    consentimento_marketing: true,
    consentimento_em: agora,
    tags: [TAG],
    observacoes: `Deixou o contato no aviso de saída do catálogo${path ? ` (página ${path})` : ""}${carrinho ? `, com ${carrinho} ${carrinho === 1 ? "item" : "itens"} no pedido` : ""}.`,
    primeiro_contato_em: agora,
    ultima_interacao_em: agora,
  });
  if (error) {
    console.error("catalogo-contato: insert falhou:", error.message);
    return erro(500, "erro_contato", "Não foi possível guardar agora. Tente de novo em instantes.");
  }

  const aviso = avisarEquipe(
    [
      "Novo contato do catálogo (aviso de saída)",
      `${nome || "Sem nome"} - ${fmtTelefone(telefone)}`,
      `Veio de: ${origem}${utm.source ? ` (${utm.source})` : ""}`,
      path ? `Estava em: ${path}` : "",
      carrinho ? `Pedido com ${carrinho} ${carrinho === 1 ? "item" : "itens"}` : "",
      "Aceitou receber promoções pelo WhatsApp.",
    ].filter(Boolean).join("\n"),
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(aviso);
  else await aviso;

  return json(200, { ok: true, novo: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro(405, "metodo", "Método não permitido.");
  if (Number(req.headers.get("content-length") ?? "0") > 8_000) return erro(413, "muito_grande", "Pedido grande demais.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erro(400, "json_invalido", "Pedido inválido.");
  }
  if (body.acao !== "contato") return erro(400, "acao_invalida", "Ação não reconhecida.");

  try {
    return await guardarContato(body);
  } catch (e) {
    console.error("catalogo-contato falhou:", e instanceof Error ? e.message : "erro desconhecido");
    return erro(500, "erro_interno", "Não foi possível guardar agora. Tente de novo em instantes.");
  }
});
