// catalogo-api — recebe pedidos / cadastros de envio do catálogo online, calcula cupons e registra eventos de funil.
//
// Esta é uma CÓPIA VERSIONADA da Edge Function que roda no Supabase (projeto vxrfyprtikznvklodqmx). O código só vale
// quando é publicado lá (Supabase MCP `deploy_edge_function` ou `supabase functions deploy catalogo-api --no-verify-jwt`).
// Nenhum segredo fica aqui: as chaves vêm das variáveis de ambiente da função (secrets).
//
// Público (verify_jwt = false): quem chama é o navegador do cliente. Por isso:
//  - o preço e o desconto são SEMPRE recalculados aqui a partir das tabelas `catalogo` e `cupons` (nunca confia no navegador);
//  - CPF/CNPJ nunca vai para log;
//  - honeypot + limite de pedidos por telefone/hora contra abuso;
//  - a venda nasce com status `aguardando_pagamento` (ou `cadastro_recebido`, sem itens). Confirmar
//    pagamento e reservar o peixe continua sendo decisão humana (Juan/pai).
//
// POST { acao: "pedido" | "cupom" | "evento", ... }  — ver tipos abaixo.
//  - "cupom": só CALCULA o desconto (não grava nada e não avisa ninguém). Devolve
//    { ok, codigo, percentual, desconto, total_original, total_final, valido_ate } ou um erro amigável.
//  - "pedido": aceita `cupom` (opcional). O desconto incide sobre o total que seria cobrado (já com promoção por item).
//
// Checkout online (frete, Pix e InfinitePay):
//  - "frete": calcula frete por caixas (frete.ts), confere se a cidade é atendida (tabela municipios_atendimento) e diz se o
//    pagamento online está disponível. Não grava nada.
//  - "pedido" com `checkout: true`: além do que já fazia, calcula o frete NO SERVIDOR, grava valor_total (peixes com desconto +
//    frete), reserva os exemplares únicos por alguns minutos e gera o Pix "copia e cola" com o valor exato (pix.ts).
//  - "pedido_status" / "pagamento" / "pagamento_conferir" / "avisar_pagamento": usados pela página /pagamento. O cliente
//    só acessa o PRÓPRIO pedido, pelo número + token secreto (vendas.token_publico).
//  - POST ?hook=infinitepay: webhook da InfinitePay (não é assinado, por isso a confirmação SEMPRE passa por payment_check).
//  - Pagamento confirmado (status 'pago' / pago_em): o gatilho vendas_baixa_estoque marca exemplar único como 'vendido'.
//  - Configuração (frete, chave Pix, handle da InfinitePay, liga/desliga) fica na tabela config_loja, nunca no código.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calcularFrete, escolherZona, tamanhoMedioCm, volumeDeKit } from "./frete.ts";
import type { RegrasFrete, ResultadoFrete, ZonaFrete } from "./frete.ts";
import { gerarPix } from "./pix.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Número de atendimento (mesmo do Kyte e de conhecimento/negocio.md). Sobrescrevível por secret.
const WHATSAPP_ATENDIMENTO = Deno.env.get("WHATSAPP_ATENDIMENTO") || "5517981516665";
// Aviso interno por WhatsApp via CallMeBot (serviço não oficial; só envia para o número que ativou a chave lá).
// A chave NUNCA fica no código: vem do secret CALLMEBOT_APIKEY (Supabase > Edge Functions > Secrets).
const CALLMEBOT_APIKEY = Deno.env.get("CALLMEBOT_APIKEY") ?? "";
const CALLMEBOT_PHONE = Deno.env.get("CALLMEBOT_PHONE") || WHATSAPP_ATENDIMENTO;
const MAX_PEDIDOS_POR_HORA = 3;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function erro(status: number, codigo: string, mensagem: string) {
  return json(status, { ok: false, erro: codigo, mensagem });
}

// ---------- aviso à equipe ----------
/** Manda o resumo do pedido para o WhatsApp da equipe. Nunca derruba o pedido e nunca registra a URL (tem a chave). */
async function avisarEquipe(texto: string): Promise<void> {
  if (!CALLMEBOT_APIKEY) {
    console.warn("CALLMEBOT_APIKEY ausente: aviso à equipe não enviado.");
    return;
  }
  try {
    const url = "https://api.callmebot.com/whatsapp.php" +
      `?phone=${encodeURIComponent(CALLMEBOT_PHONE)}&text=${encodeURIComponent(texto.slice(0, 1500))}` +
      `&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const corpo = (await r.text()).replace(/\s+/g, " ").slice(0, 120);
    if (!r.ok) console.error(`CallMeBot respondeu ${r.status}: ${corpo}`);
    else if (/error|invalid/i.test(corpo)) console.error("CallMeBot recusou a mensagem.");
    else console.log("Aviso CallMeBot enviado.");
  } catch (e) {
    console.error("CallMeBot falhou:", e instanceof Error ? e.name : "erro desconhecido");
  }
}

// ---------- utilidades ----------
function limpar(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  // deno-lint-ignore no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function soDigitos(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/** Devolve o telefone em E.164 sem "+" (55 + DDD + número), inserindo o 9º dígito de celular se faltar. */
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

function validarCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function validarCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(cnpj.slice(0, 12)) === Number(cnpj[12]) && calc(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 14000000 -> 14000-000 */
function fmtCep(cep: string): string {
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/** 5517981516665 -> (17) 98151-6665 */
function fmtTelefone(p: string): string {
  const local = p.slice(4);
  const ddd = p.slice(2, 4);
  return local.length === 9 ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
}

const UF = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
);

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

/** origem do contato: organico | anuncio | indicacao | direto */
function classificarOrigem(utm: Record<string, string>, temIndicacao: boolean): string {
  if (temIndicacao) return "indicacao";
  if (utm.medium && MIDIA_PAGA.has(utm.medium.toLowerCase())) return "anuncio";
  if (utm.source) return "organico";
  return "direto";
}

// ---------- eventos de funil ----------
const EVENTOS = new Set([
  "pagina",
  "produto_visto",
  "add_pedido",
  "clique_whatsapp",
  "iniciou_cadastro",
]);

async function registrarEvento(b: Record<string, unknown>) {
  const tipo = limpar(b.tipo, 40);
  if (!EVENTOS.has(tipo)) return erro(400, "evento_invalido", "Evento não reconhecido.");
  const codigo = limpar(b.item_codigo, 30);
  await supabase.from("eventos_site").insert({
    tipo,
    sessao: limpar(b.sessao, 64) || null,
    path: limpar(b.path, 200) || null,
    item_codigo: /^[A-Z0-9-]{2,30}$/i.test(codigo) ? codigo.toUpperCase() : null,
    utm: limparUtm(b.utm),
    referrer: limpar(b.referrer, 200) || null,
  });
  return json(200, { ok: true });
}

// ---------- itens e preços (compartilhado entre `cupom` e `pedido`) ----------
interface Linha {
  codigo: string;
  nome: string;
  variedade: string;
  tipo: string; // "lote" | "exemplar_unico"
  tamanho_cm: number | null;
  tamanho_medio_cm: number | null; // tamanho_cm ou a média da faixa (ficha.faixa_cm); base do cálculo de caixas
  volume_milesimos: number | null; // kits: volume fixo por unidade (ficha.kit.volume_unidades); vence o tamanho
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  promocao_aplicada: boolean;
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

/** Lê `itens` do corpo (até 20, quantidades de 1 a 200). Devolve o mapa codigo -> quantidade ou a resposta de erro. */
function lerItens(bruto: unknown): { pedidos: Map<string, number> } | { resp: Response } {
  const itensIn = Array.isArray(bruto) ? bruto.slice(0, 20) : [];
  const pedidos = new Map<string, number>();
  for (const it of itensIn) {
    const codigo = limpar((it as Record<string, unknown>)?.codigo, 30).toUpperCase();
    const qtd = Math.floor(Number((it as Record<string, unknown>)?.quantidade));
    if (!/^[A-Z0-9-]{2,30}$/.test(codigo) || !Number.isFinite(qtd) || qtd < 1 || qtd > 200) {
      return { resp: erro(422, "item_invalido", "Há um item inválido no pedido.") };
    }
    pedidos.set(codigo, (pedidos.get(codigo) ?? 0) + qtd);
  }
  return { pedidos };
}

/** Recalcula cada linha a partir da tabela `catalogo` (disponibilidade, estoque, quantidade mínima e promoção). */
async function calcularLinhas(pedidos: Map<string, number>): Promise<{ linhas: Linha[] } | { resp: Response }> {
  const linhas: Linha[] = [];
  if (pedidos.size === 0) return { linhas };
  const { data: produtos, error: eProd } = await supabase
    .from("catalogo")
    .select("*")
    .in("codigo", [...pedidos.keys()])
    .eq("ativo", true);
  if (eProd) return { resp: erro(500, "erro_catalogo", "Não foi possível consultar o catálogo agora.") };

  for (const [codigo, qtdPedida] of pedidos) {
    const p = (produtos ?? []).find((x) => x.codigo === codigo);
    const indisponivel = !p || p.status === "vendido" || p.status === "reservado" ||
      (p.controla_estoque && (p.quantidade ?? 0) < 1);
    if (indisponivel) {
      return { resp: erro(409, "item_indisponivel", `O item ${p?.nome ?? codigo} não está mais disponível.`) };
    }
    const qtd = p.tipo === "exemplar_unico" ? 1 : qtdPedida;
    if (qtd < (p.quantidade_minima ?? 1)) {
      return { resp: erro(422, "quantidade_minima", `${p.nome}: quantidade mínima de ${p.quantidade_minima}.`) };
    }
    if (p.controla_estoque && p.quantidade != null && qtd > p.quantidade) {
      return { resp: erro(409, "sem_estoque", `${p.nome}: só temos ${p.quantidade} unidade(s).`) };
    }
    const cheio = Number(p.preco ?? 0);
    const promo = p.preco_promocional != null ? Number(p.preco_promocional) : null;
    const aplicaPromo = promo != null && qtd >= (p.promo_qtd_minima ?? 1);
    const unit = aplicaPromo ? promo! : cheio;
    if (!(unit > 0)) return { resp: erro(422, "sem_preco", `${p.nome}: consulte o preço pelo WhatsApp.`) };
    linhas.push({
      codigo,
      nome: p.nome ?? p.variedade,
      variedade: p.variedade,
      tipo: p.tipo === "exemplar_unico" ? "exemplar_unico" : "lote",
      tamanho_cm: p.tamanho_cm ?? null,
      tamanho_medio_cm: tamanhoMedioCm(p.tamanho_cm, p.ficha?.faixa_cm),
      volume_milesimos: volumeDeKit(p.ficha),
      quantidade: qtd,
      preco_unitario: unit,
      subtotal: arred2(unit * qtd),
      promocao_aplicada: aplicaPromo,
    });
  }
  return { linhas };
}

// ---------- cupom ----------
interface CupomAplicado {
  codigo: string;
  percentual: number;
  valido_ate: string;
  total_original: number;
  desconto: number;
  total_final: number;
}

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Confere o cupom no banco (tabela `cupons`, só acessível por esta função) e calcula o desconto sobre `totalOriginal`.
 * A palavra final é sempre daqui: o navegador só mostra o que o servidor devolve.
 */
async function aplicarCupom(bruto: unknown, totalOriginal: number): Promise<{ cupom: CupomAplicado } | { resp: Response }> {
  const codigo = limpar(bruto, 30).toUpperCase();
  const invalido = { resp: erro(422, "cupom_invalido", "Cupom inválido. Confira o código e tente novamente.") };
  if (!/^[A-Z0-9-]{3,30}$/.test(codigo)) return invalido;

  const { data: c, error: eC } = await supabase
    .from("cupons")
    .select("codigo, percentual, valido_de, valido_ate, ativo")
    .eq("codigo", codigo)
    .maybeSingle();
  if (eC) return { resp: erro(500, "erro_cupom", "Não foi possível conferir o cupom agora. Tente novamente em instantes.") };
  if (!c || !c.ativo) return invalido;

  const agora = Date.now();
  if (c.valido_de && agora < Date.parse(c.valido_de)) {
    return { resp: erro(422, "cupom_invalido", "Este cupom ainda não está valendo.") };
  }
  if (agora > Date.parse(c.valido_ate)) {
    return { resp: erro(422, "cupom_expirado", `Este cupom expirou em ${dataBR(c.valido_ate)}.`) };
  }

  const percentual = Number(c.percentual);
  const desconto = Math.round(totalOriginal * percentual) / 100; // centavos, arredondado uma única vez sobre o total
  return {
    cupom: {
      codigo: c.codigo,
      percentual,
      valido_ate: c.valido_ate,
      total_original: arred2(totalOriginal),
      desconto: arred2(desconto),
      total_final: arred2(totalOriginal - desconto),
    },
  };
}

/** acao "cupom": só calcula. Não grava nada e não avisa ninguém. */
async function calcularCupom(b: Record<string, unknown>) {
  const lidos = lerItens(b.itens);
  if ("resp" in lidos) return lidos.resp;
  if (lidos.pedidos.size === 0) {
    return erro(422, "sem_itens", "Adicione ao menos um peixe ao pedido para usar o cupom.");
  }
  const calc = await calcularLinhas(lidos.pedidos);
  if ("resp" in calc) return calc.resp;
  const totalOriginal = arred2(calc.linhas.reduce((s, l) => s + l.subtotal, 0));

  const r = await aplicarCupom(b.cupom, totalOriginal);
  if ("resp" in r) return r.resp;
  return json(200, { ok: true, ...r.cupom });
}

// ---------- configuração da loja (tabela config_loja) ----------
interface Config {
  frete: RegrasFrete;
  pagamento: {
    checkout_online_ativo: boolean;
    reserva_minutos: number;
    pix: { chave: string | null; nome: string | null; cidade: string | null };
    infinitepay: { handle: string | null };
  };
  site: { url: string };
  teste: { marcador: string };
}

async function carregarConfig(): Promise<Config> {
  const { data, error } = await supabase.from("config_loja").select("chave, valor");
  if (error || !data) throw new Error("config_loja indisponível");
  // deno-lint-ignore no-explicit-any
  const m: Record<string, any> = Object.fromEntries(data.map((r) => [r.chave, r.valor]));
  return {
    frete: m.frete as RegrasFrete,
    pagamento: {
      checkout_online_ativo: m.pagamento?.checkout_online_ativo === true,
      reserva_minutos: Number(m.pagamento?.reserva_minutos) > 0 ? Number(m.pagamento.reserva_minutos) : 60,
      pix: { chave: m.pagamento?.pix?.chave ?? null, nome: m.pagamento?.pix?.nome ?? null, cidade: m.pagamento?.pix?.cidade ?? null },
      infinitepay: { handle: m.pagamento?.infinitepay?.handle ?? null },
    },
    site: { url: String(m.site?.url ?? "https://catalogo-aquacarpas.vercel.app").replace(/\/$/, "") },
    teste: { marcador: String(m.teste?.marcador ?? "") },
  };
}

const pixPronto = (c: Config) => Boolean(c.pagamento.pix.chave && c.pagamento.pix.nome && c.pagamento.pix.cidade);
const infinitePayPronto = (c: Config) => Boolean(c.pagamento.infinitepay.handle);
/** Checkout online só abre se estiver ligado E houver ao menos uma forma de pagar configurada. */
const checkoutDisponivel = (c: Config) => c.pagamento.checkout_online_ativo && (pixPronto(c) || infinitePayPronto(c));

// ---------- destino: cidade atendida, retirada em cidade-polo ou fora da área ----------
interface Destino {
  situacao: "entrega" | "polo" | "fora" | "desconhecido";
  cidade: string;
  uf: string;
  polo?: { nome: string; uf: string; ibge: string };
  /** Zona de frete da cidade (local ou raio de Rio Preto): valor da caixa, frete grátis e mínimo próprios. null = tabela por estado. */
  zona?: ZonaFrete | null;
}

const UFS_ATENDIDAS = new Set(["SP", "MG", "PR", "MS"]);
const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Descobre a cidade pelo CEP (ViaCEP, consultado aqui no servidor) e confere em municipios_atendimento:
 *  - "entrega": município numa zona de frete (Rio Preto/Mirassol ou raio de 135 km de Rio Preto) OU com mais de 200 mil
 *    habitantes (SP, MG, PR, MS) -> entrega em casa; a zona, quando existe, traz as regras de frete dela;
 *  - "polo": município menor e fora das zonas -> retirada na cidade atendida mais próxima (polo);
 *  - "fora": CEP de outro estado -> sem checkout online (a equipe combina);
 *  - "desconhecido": CEP inválido ou município não reconhecido.
 * Se o ViaCEP falhar, usa a cidade e o estado informados no formulário.
 */
async function resolverDestino(cep: string, cidadeIn: string, ufIn: string, regras: RegrasFrete): Promise<Destino> {
  let cidade = cidadeIn;
  let uf = ufIn.toUpperCase();
  let ibge = "";
  if (cep.length !== 8) return { situacao: "desconhecido", cidade, uf };
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const j = await r.json();
      if (!j.erro) {
        ibge = String(j.ibge ?? "");
        cidade = String(j.localidade || cidade);
        uf = String(j.uf || uf).toUpperCase();
      }
    }
  } catch {
    /* ViaCEP fora do ar: segue com o que o cliente informou */
  }
  const colunas = "ibge, nome, uf, atendido, polo_ibge, distancia_rp_km";
  let linha: {
    ibge: string;
    nome: string;
    uf: string;
    atendido: boolean;
    polo_ibge: string | null;
    distancia_rp_km: number | string | null;
  } | null = null;
  if (ibge) {
    const { data } = await supabase.from("municipios_atendimento").select(colunas).eq("ibge", ibge).maybeSingle();
    linha = data;
  }
  if (!linha && cidade && uf) {
    const { data } = await supabase.from("municipios_atendimento").select(colunas).eq("uf", uf).eq("nome_busca", semAcento(cidade)).limit(1);
    linha = data?.[0] ?? null;
  }
  if (!linha) {
    // Estado fora de SP/MG/PR/MS (a tabela só tem esses): sem entrega online. Dentro deles, nome não reconhecido.
    return { situacao: uf && !UFS_ATENDIDAS.has(uf) ? "fora" : "desconhecido", cidade, uf };
  }
  // Zona de frete (Rio Preto/Mirassol ou raio de Rio Preto): entrega em casa com as regras da zona, mesmo em cidade pequena.
  const zona = escolherZona(linha.ibge, linha.distancia_rp_km === null ? null : Number(linha.distancia_rp_km), regras);
  if (zona) return { situacao: "entrega", cidade: linha.nome, uf: linha.uf, zona };
  if (linha.atendido) return { situacao: "entrega", cidade: linha.nome, uf: linha.uf, zona: null };
  if (linha.polo_ibge) {
    const { data: polo } = await supabase.from("municipios_atendimento").select("ibge, nome, uf").eq("ibge", linha.polo_ibge).maybeSingle();
    if (polo) return { situacao: "polo", cidade: linha.nome, uf: linha.uf, polo };
  }
  return { situacao: "desconhecido", cidade: linha.nome, uf: linha.uf };
}

/**
 * Frete do pedido. null = "a combinar com a equipe" (retirada no local, abaixo do pedido mínimo, cidade fora da área ou
 * não reconhecida). O pedido mínimo olha o preço de tabela (antes do cupom); o frete grátis olha o valor já com o cupom.
 * Cidade numa zona de frete usa o valor da caixa, o frete grátis e o mínimo da zona; as demais, a tabela por estado.
 * Devolve também o mínimo e o frete grátis que valem para este destino (a tela mostra esses números).
 */
function orcamentoFrete(
  linhas: Linha[],
  subtotalFinal: number,
  subtotalTabela: number,
  tipoEntrega: string,
  destino: Destino | null,
  cfg: Config,
): { frete: ResultadoFrete | null; abaixoMinimo: boolean; minimo: number; gratisAPartir: number } {
  const zona = destino?.zona ?? null;
  const minimo = zona ? zona.pedido_minimo_online : cfg.frete.pedido_minimo_online;
  const gratisAPartir = zona ? zona.gratis_a_partir : cfg.frete.gratis_a_partir;
  if (tipoEntrega === "retirada") return { frete: null, abaixoMinimo: false, minimo, gratisAPartir };
  const abaixoMinimo = subtotalTabela < minimo;
  if (abaixoMinimo || !destino || (destino.situacao !== "entrega" && destino.situacao !== "polo")) {
    return { frete: null, abaixoMinimo, minimo, gratisAPartir };
  }
  const ufFrete = destino.situacao === "polo" && destino.polo ? destino.polo.uf : destino.uf;
  return { frete: calcularFrete(linhas, ufFrete, subtotalFinal, cfg.frete, zona), abaixoMinimo, minimo, gratisAPartir };
}

/** acao "frete": só calcula (não grava nada). Usada pelo resumo do pedido assim que o CEP é digitado. */
async function calcularFreteAcao(b: Record<string, unknown>) {
  const lidos = lerItens(b.itens);
  if ("resp" in lidos) return lidos.resp;
  if (lidos.pedidos.size === 0) return erro(422, "sem_itens", "Adicione ao menos um peixe ao pedido.");
  const calc = await calcularLinhas(lidos.pedidos);
  if ("resp" in calc) return calc.resp;
  const cfg = await carregarConfig();
  const subtotal = arred2(calc.linhas.reduce((s, l) => s + l.subtotal, 0));

  let cupom: CupomAplicado | null = null;
  let cupomErro: string | null = null;
  if (limpar(b.cupom, 30)) {
    const r = await aplicarCupom(b.cupom, subtotal);
    if ("resp" in r) cupomErro = String((await r.resp.json()).mensagem ?? "Cupom inválido.");
    else cupom = r.cupom;
  }
  const subtotalFinal = cupom?.total_final ?? subtotal;

  const tipoIn = limpar(b.tipo, 15);
  const tipo = tipoIn === "retirada" ? "retirada" : tipoIn === "transportadora" ? "transportadora" : "envio";
  const destino = tipo === "retirada" ? null : await resolverDestino(soDigitos(b.cep), limpar(b.cidade, 80), limpar(b.uf, 2), cfg.frete);
  const { frete, abaixoMinimo, minimo, gratisAPartir } = orcamentoFrete(calc.linhas, subtotalFinal, subtotal, tipo, destino, cfg);
  const totalPagar = arred2(subtotalFinal + (frete?.frete ?? 0));

  let motivo: string | null = null;
  if (!checkoutDisponivel(cfg)) motivo = "desligado";
  else if (tipo !== "retirada") {
    if (!destino || destino.situacao === "desconhecido") motivo = "sem_cep";
    else if (destino.situacao === "fora") motivo = "fora_area";
    else if (abaixoMinimo) motivo = "abaixo_minimo";
  }
  return json(200, {
    ok: true,
    subtotal,
    desconto: cupom?.desconto ?? 0,
    cupom: cupom?.codigo ?? null,
    cupom_erro: cupomErro,
    subtotal_final: subtotalFinal,
    destino: destino
      ? { situacao: destino.situacao, cidade: destino.cidade, uf: destino.uf, polo: destino.polo ? { nome: destino.polo.nome, uf: destino.polo.uf } : null }
      : null,
    frete: frete ? { valor: frete.frete, gratis: frete.gratis, caixas: frete.caixas } : null,
    total_pagar: totalPagar,
    zona: destino?.zona?.nome ?? null,
    pedido_minimo: minimo,
    gratis_a_partir: gratisAPartir,
    falta_para_gratis: frete && !frete.gratis ? arred2(Math.max(0, gratisAPartir - subtotalFinal)) : null,
    abaixo_minimo: abaixoMinimo,
    online: { disponivel: motivo === null, motivo },
  });
}

// ---------- pagamento: Pix, InfinitePay, status e confirmação ----------
function montarPix(cfg: Config, numero: number, valor: number): string | null {
  const p = cfg.pagamento.pix;
  if (!p.chave || !p.nome || !p.cidade) return null;
  try {
    return gerarPix({ chave: p.chave, nome: p.nome, cidade: p.cidade, valor, txid: `AQ${numero}` });
  } catch (e) {
    console.error("Pix não gerado:", e instanceof Error ? e.message : "erro");
    return null;
  }
}

/** O schema da resposta da InfinitePay não é documentado: pega a primeira URL https (preferindo o domínio dela). */
function extrairUrl(j: unknown): string | null {
  const achados: string[] = [];
  const visita = (v: unknown, nivel: number) => {
    if (nivel > 3) return;
    if (typeof v === "string") {
      if (/^https:\/\/\S+$/.test(v)) achados.push(v);
    } else if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) visita(x, nivel + 1);
    }
  };
  visita(j, 0);
  return achados.find((u) => /infinitepay/i.test(u)) ?? achados[0] ?? null;
}

interface VendaPag {
  numero: number;
  token_publico: string;
  valor_total: number | string;
  nome_completo: string | null;
  telefone: string | null;
  email: string | null;
}

/** Cria o link de checkout da InfinitePay (cartão e Pix) para o valor total do pedido. Devolve null se falhar. */
async function criarLinkInfinitePay(cfg: Config, v: VendaPag): Promise<string | null> {
  const handle = (cfg.pagamento.infinitepay.handle ?? "").replace(/^\$/, "").trim();
  if (!handle) return null;
  const base = {
    handle,
    order_nsu: `AQ-${v.numero}`,
    items: [{ quantity: 1, price: Math.round(Number(v.valor_total) * 100), description: `Pedido Aquacarpas nº ${v.numero}` }],
    redirect_url: `${cfg.site.url}/obrigado?n=${v.numero}&t=${v.token_publico}`,
    customer: {
      name: String(v.nome_completo ?? "Cliente").slice(0, 100),
      ...(v.email ? { email: v.email } : {}),
      ...(v.telefone ? { phone_number: `+${v.telefone}` } : {}),
    },
  };
  const hook = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/catalogo-api?hook=infinitepay`;
  // A documentação mostra o webhook como objeto e, em outro trecho, como webhook_url: tenta o documentado e, se a
  // API recusar o formato, a variante simples. (O retorno do cliente à loja também confere o pagamento, ver pagamento_conferir.)
  const variantes = [{ ...base, webhook: { url: hook, events: ["paid"] } }, { ...base, webhook_url: hook }];
  for (const corpo of variantes) {
    try {
      const r = await fetch("https://api.checkout.infinitepay.io/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(10000),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.success !== false) {
        const url = extrairUrl(j);
        if (url) return url;
      }
      console.error("InfinitePay /links:", r.status, typeof j?.error === "string" ? j.error : "sem detalhe");
      if (r.status !== 400 && r.status !== 422) return null; // só tenta a outra forma se for erro de formato
    } catch (e) {
      console.error("InfinitePay /links falhou:", e instanceof Error ? e.name : "erro");
      return null;
    }
  }
  return null;
}

type ResultadoPagamento = "pago" | "pendente" | "divergente";

/**
 * Confirma na InfinitePay (payment_check) e, se estiver pago no valor certo, marca a venda como paga. O gatilho do banco
 * dá baixa no estoque (exemplar único vira "vendido"). Chamada pelo webhook e pelo retorno do cliente à loja.
 */
async function confirmarInfinitePay(
  cfg: Config,
  venda: { id: string; numero: number; valor_total: number | string; status: string; itens: unknown; observacoes: string | null },
  transactionNsu: string,
  slug: string,
): Promise<ResultadoPagamento> {
  if (venda.status === "pago") return "pago";
  if (venda.status !== "aguardando_pagamento") return "pendente";
  const handle = (cfg.pagamento.infinitepay.handle ?? "").replace(/^\$/, "").trim();
  if (!handle) return "pendente";
  let j: Record<string, unknown> | null = null;
  try {
    const r = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, order_nsu: `AQ-${venda.numero}`, transaction_nsu: transactionNsu, slug }),
      signal: AbortSignal.timeout(8000),
    });
    j = await r.json().catch(() => null);
  } catch {
    return "pendente";
  }
  if (!j || j.success !== true || j.paid !== true) return "pendente";

  // `amount` é o valor original do pedido; `paid_amount` pode incluir juros do cartão, então não se compara com ele.
  const esperado = Math.round(Number(venda.valor_total) * 100);
  if (Number(j.amount) !== esperado) {
    console.error(`Pedido ${venda.numero}: valor pago diverge do esperado.`);
    await avisarEquipe(`ATENCAO: o pagamento InfinitePay do pedido nº ${venda.numero} chegou com valor diferente do pedido. Conferir na InfinitePay antes de enviar.`);
    return "divergente";
  }

  // Exemplar único já vendido a outro cliente enquanto este pagava (reserva expirada): o dinheiro entrou, a equipe resolve.
  const codigosUnicos = (Array.isArray(venda.itens) ? venda.itens : [])
    .filter((l: Record<string, unknown>) => l.tipo === "exemplar_unico")
    .map((l: Record<string, unknown>) => String(l.codigo));
  let conflito = "";
  if (codigosUnicos.length > 0) {
    const { data: vendidos } = await supabase.from("catalogo").select("nome").in("codigo", codigosUnicos).eq("status", "vendido");
    if (vendidos && vendidos.length > 0) conflito = vendidos.map((x) => x.nome).join(", ");
  }

  const metodo = j.capture_method === "pix" ? "infinitepay_pix" : "infinitepay_cartao";
  const nota = conflito ? [venda.observacoes, `CONFLITO DE ESTOQUE: ${conflito} já constava como vendido. Estornar ou substituir.`].filter(Boolean).join(" | ") : venda.observacoes;
  const { data: atualizadas } = await supabase
    .from("vendas")
    .update({
      status: "pago",
      pago_em: new Date().toISOString(),
      pagamento_metodo: metodo,
      pagamento_ref: `AQ-${venda.numero}`,
      infinitepay_transaction_nsu: transactionNsu,
      observacoes: nota,
    })
    .eq("id", venda.id)
    .eq("status", "aguardando_pagamento")
    .select("id");
  if (atualizadas && atualizadas.length > 0) {
    const forma = j.capture_method === "pix" ? "Pix" : "cartão";
    await avisarEquipe(
      `Pagamento confirmado (InfinitePay, ${forma}) do pedido nº ${venda.numero}: ${brl(esperado / 100)}.` +
        (conflito ? `\nATENCAO: ${conflito} já constava como vendido. Resolver com o cliente (estorno ou outro peixe).` : ""),
    );
  }
  return "pago";
}

/** Acha o pedido do cliente pelo número + token secreto. Nunca devolve CPF nem dados de outros pedidos. */
async function buscarVendaDoCliente(b: Record<string, unknown>) {
  const numero = Math.floor(Number(b.numero));
  const token = limpar(b.token, 40);
  if (!Number.isFinite(numero) || numero < 1 || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await supabase.from("vendas").select("*").eq("numero", numero).eq("token_publico", token).maybeSingle();
  return data;
}

async function statusDoPedido(b: Record<string, unknown>) {
  const v = await buscarVendaDoCliente(b);
  if (!v) return erro(404, "pedido_nao_encontrado", "Pedido não encontrado. Confira o link que recebeu.");
  const cfg = await carregarConfig();
  const itens = (Array.isArray(v.itens) ? v.itens : []) as Linha[];
  const pago = v.status === "pago" || v.pago_em != null;
  const expirado = !pago && v.status === "aguardando_pagamento" && v.reservado_ate != null && Date.parse(v.reservado_ate) < Date.now();
  return json(200, {
    ok: true,
    numero: v.numero,
    status: v.status,
    pago,
    pagamento_online: v.reservado_ate != null,
    expirado,
    reservado_ate: v.reservado_ate,
    tem_exemplar_unico: itens.some((l) => l.tipo === "exemplar_unico"),
    entrega_tipo: v.entrega_tipo,
    cidade: v.cidade,
    uf: v.uf,
    polo_cidade: v.polo_cidade,
    cupom: v.cupom,
    desconto: v.desconto != null ? Number(v.desconto) : null,
    frete: v.frete != null ? Number(v.frete) : null,
    frete_gratis: v.frete_gratis,
    caixas: v.caixas,
    total_pagar: v.valor_total != null ? Number(v.valor_total) : null,
    itens: itens.map((l) => ({ nome: l.nome, quantidade: l.quantidade, subtotal: l.subtotal })),
    metodos: { pix: Boolean(v.pix_copia_cola), infinitepay: infinitePayPronto(cfg) },
    pix_copia_cola: pago || expirado ? null : v.pix_copia_cola,
    infinitepay_url: pago || expirado ? null : v.infinitepay_url,
  });
}

/** acao "pagamento": entrega o Pix (já gerado no pedido) ou cria o link da InfinitePay. */
async function iniciarPagamento(b: Record<string, unknown>) {
  const v = await buscarVendaDoCliente(b);
  if (!v) return erro(404, "pedido_nao_encontrado", "Pedido não encontrado. Confira o link que recebeu.");
  if (v.status === "pago") return json(200, { ok: true, pago: true });
  if (v.status !== "aguardando_pagamento" || v.reservado_ate == null) {
    return erro(409, "pagamento_indisponivel", "Este pedido não está aberto para pagamento online. Fale com a gente pelo WhatsApp.");
  }
  if (Date.parse(v.reservado_ate) < Date.now()) {
    return erro(410, "reserva_expirada", "O prazo para pagar este pedido terminou. Fale com a gente pelo WhatsApp ou refaça o pedido.");
  }
  const cfg = await carregarConfig();
  const metodo = limpar(b.metodo, 15);
  if (metodo === "pix") {
    if (!v.pix_copia_cola) return erro(409, "pix_indisponivel", "O Pix não está disponível agora. Tente a InfinitePay ou fale pelo WhatsApp.");
    if (!v.pagamento_metodo) await supabase.from("vendas").update({ pagamento_metodo: "pix" }).eq("id", v.id);
    return json(200, { ok: true, pix_copia_cola: v.pix_copia_cola });
  }
  if (metodo === "infinitepay") {
    if (v.infinitepay_url) return json(200, { ok: true, url: v.infinitepay_url });
    const url = await criarLinkInfinitePay(cfg, v);
    if (!url) return erro(502, "infinitepay_indisponivel", "Não foi possível abrir o pagamento pela InfinitePay agora. Use o Pix ou tente de novo em instantes.");
    await supabase.from("vendas").update({ infinitepay_url: url, pagamento_ref: `AQ-${v.numero}` }).eq("id", v.id);
    return json(200, { ok: true, url });
  }
  return erro(400, "metodo_invalido", "Forma de pagamento não reconhecida.");
}

/** acao "pagamento_conferir": o cliente voltou da InfinitePay; confere o pagamento sem depender do webhook. */
async function conferirPagamento(b: Record<string, unknown>) {
  const v = await buscarVendaDoCliente(b);
  if (!v) return erro(404, "pedido_nao_encontrado", "Pedido não encontrado.");
  if (v.status === "pago") return json(200, { ok: true, pago: true });
  const transactionNsu = limpar(b.transaction_nsu, 80);
  const slug = limpar(b.slug, 80);
  if (!transactionNsu || !slug) return json(200, { ok: true, pago: false });
  const cfg = await carregarConfig();
  const r = await confirmarInfinitePay(cfg, v, transactionNsu, slug);
  return json(200, { ok: true, pago: r === "pago" });
}

/** acao "avisar_pagamento": o cliente diz que pagou o Pix. Só avisa a equipe (no máximo uma vez a cada 10 minutos). */
async function avisarPagamentoCliente(b: Record<string, unknown>) {
  const v = await buscarVendaDoCliente(b);
  if (!v) return erro(404, "pedido_nao_encontrado", "Pedido não encontrado.");
  if (v.status === "pago") return json(200, { ok: true, pago: true });
  const ultimo = v.aviso_pagamento_em ? Date.parse(v.aviso_pagamento_em) : 0;
  if (Date.now() - ultimo > 10 * 60 * 1000) {
    await supabase.from("vendas").update({ aviso_pagamento_em: new Date().toISOString() }).eq("id", v.id);
    const cfg = await carregarConfig();
    if (!(cfg.teste.marcador && String(v.observacoes ?? "").includes(cfg.teste.marcador))) {
      await avisarEquipe(
        `O cliente informou que pagou o pedido nº ${v.numero} (${brl(Number(v.valor_total))}) por Pix. Conferir no banco e confirmar o pagamento no sistema.`,
      );
    }
  }
  return json(200, { ok: true });
}

/** Webhook da InfinitePay. Sem assinatura: nada é aceito sem passar pelo payment_check. */
async function webhookInfinitePay(body: Record<string, unknown>) {
  const m = /^AQ-(\d{1,9})$/.exec(limpar(body.order_nsu, 40));
  const transactionNsu = limpar(body.transaction_nsu, 80);
  const slug = limpar(body.invoice_slug ?? body.slug, 80);
  if (!m || !transactionNsu || !slug) return erro(400, "webhook_invalido", "Dados incompletos.");
  const { data: venda } = await supabase
    .from("vendas")
    .select("id, numero, valor_total, status, itens, observacoes")
    .eq("numero", Number(m[1]))
    .maybeSingle();
  if (!venda) return erro(400, "pedido_desconhecido", "Pedido não encontrado.");
  const cfg = await carregarConfig();
  const r = await confirmarInfinitePay(cfg, venda, transactionNsu, slug);
  return r === "pago" ? json(200, { ok: true }) : erro(400, "nao_confirmado", "Pagamento não confirmado.");
}

// ---------- pedido / cadastro de envio ----------
async function criarPedido(b: Record<string, unknown>) {
  // honeypot: robôs preenchem, pessoas não veem o campo. Responde "ok" sem gravar nada.
  if (limpar(b.website, 100)) return json(200, { ok: true, numero: 0, whatsapp_url: null });

  if (b.consentimento !== true) {
    return erro(422, "sem_consentimento", "É preciso concordar com o uso dos dados para entrega para continuar.");
  }

  const cliente = (b.cliente ?? {}) as Record<string, unknown>;
  const entrega = (b.entrega ?? {}) as Record<string, unknown>;

  const nome = limpar(cliente.nome, 120);
  if (nome.split(" ").filter((p) => p.length > 0).length < 2) {
    return erro(422, "nome_invalido", "Informe o nome completo.");
  }
  const telefone = normalizarTelefone(cliente.telefone);
  if (!telefone) return erro(422, "telefone_invalido", "Informe um WhatsApp válido, com DDD.");

  const email = limpar(cliente.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return erro(422, "email_invalido", "O e-mail informado não parece válido.");
  }

  // CPF/CNPJ é obrigatório (decisão do Juan, 2026-09-30): nota fiscal e cadastro de envio.
  const doc = soDigitos(cliente.cpf_cnpj);
  if (!doc) return erro(422, "documento_obrigatorio", "Informe o CPF ou CNPJ: ele é necessário para a nota fiscal e o envio.");
  const docOk = (doc.length === 11 && validarCpf(doc)) || (doc.length === 14 && validarCnpj(doc));
  if (!docOk) return erro(422, "documento_invalido", "CPF ou CNPJ inválido. Confira os números.");

  const pedidoTipo = limpar(entrega.tipo, 15);
  let tipoEntrega: "envio" | "transportadora" | "retirada" = pedidoTipo === "retirada"
    ? "retirada"
    : pedidoTipo === "transportadora"
    ? "transportadora"
    : "envio";
  const cep = soDigitos(entrega.cep);
  const rua = limpar(entrega.rua, 150);
  const numeroEnd = limpar(entrega.numero, 20);
  const complemento = limpar(entrega.complemento, 80);
  const bairro = limpar(entrega.bairro, 80);
  const cidade = limpar(entrega.cidade, 80);
  const uf = limpar(entrega.uf, 2).toUpperCase();
  const referencia = limpar(entrega.referencia, 150);

  // CEP sem entrega na residência (tabela entrega_restricoes): vira retirada na transportadora, mesmo que o
  // navegador tenha mandado "envio".
  let avisoRestricao = "";
  if (tipoEntrega === "envio" && cep.length === 8) {
    const { data: faixas } = await supabase
      .from("entrega_restricoes")
      .select("observacao")
      .eq("ativo", true)
      .lte("cep_inicio", cep)
      .gte("cep_fim", cep)
      .limit(1);
    if (faixas && faixas.length > 0) {
      tipoEntrega = "transportadora";
      avisoRestricao = "CEP sem entrega na residência: convertido para retirada na transportadora." +
        (faixas[0].observacao ? ` (${faixas[0].observacao})` : "");
    }
  }

  if (tipoEntrega === "envio") {
    if (cep.length !== 8) return erro(422, "cep_invalido", "Informe o CEP com 8 dígitos.");
    if (!rua || !numeroEnd || !bairro || !cidade) {
      return erro(422, "endereco_incompleto", "Preencha rua, número, bairro e cidade.");
    }
    if (!UF.has(uf)) return erro(422, "uf_invalida", "Selecione o estado.");
  } else if (tipoEntrega === "transportadora") {
    // Na retirada em transportadora só precisamos do CEP, da cidade e do estado para indicar a unidade mais próxima.
    if (cep.length !== 8) return erro(422, "cep_invalido", "Informe o CEP com 8 dígitos.");
    if (!cidade) return erro(422, "endereco_incompleto", "Informe a cidade.");
    if (!UF.has(uf)) return erro(422, "uf_invalida", "Selecione o estado.");
  }

  // ---- itens (opcional: sem itens = "cadastro para envio" de quem combinou a compra pelo WhatsApp)
  const lidos = lerItens(b.itens);
  if ("resp" in lidos) return lidos.resp;
  const calc = await calcularLinhas(lidos.pedidos);
  if ("resp" in calc) return calc.resp;
  const linhas = calc.linhas;
  const total = arred2(linhas.reduce((s, l) => s + l.subtotal, 0)); // total de tabela (já com promoção por item)
  const soCadastro = linhas.length === 0;

  // ---- cupom (opcional; sem itens não há o que descontar). Cupom inválido/expirado recusa o pedido: o cliente
  // esperava o desconto e decide se segue sem ele.
  let cupom: CupomAplicado | null = null;
  if (!soCadastro && limpar(b.cupom, 30)) {
    const r = await aplicarCupom(b.cupom, total);
    if ("resp" in r) return r.resp;
    cupom = r.cupom;
  }
  const desconto = cupom?.desconto ?? 0;
  const totalFinal = cupom?.total_final ?? total;

  // ---- frete e destino (cidade atendida, retirada em cidade-polo, caixas). Retirada no local, abaixo do pedido mínimo,
  // cidade fora da área ou não reconhecida: o frete segue "a combinar" pela equipe, como antes.
  const cfg = await carregarConfig();
  let destino: Destino | null = null;
  let poloCidade: string | null = null;
  if (!soCadastro && tipoEntrega !== "retirada") {
    destino = await resolverDestino(cep, cidade, uf, cfg.frete);
    if (destino.situacao === "polo" && destino.polo) {
      poloCidade = `${destino.polo.nome}/${destino.polo.uf}`;
      if (tipoEntrega === "envio") {
        tipoEntrega = "transportadora"; // sem entrega em casa nesta cidade: retirada na cidade-polo
        avisoRestricao = [avisoRestricao, `Cidade sem entrega em casa: retirada em ${poloCidade}.`].filter(Boolean).join(" ");
      }
    }
  }
  const orcamento = soCadastro
    ? { frete: null as ResultadoFrete | null }
    : orcamentoFrete(linhas, totalFinal, total, tipoEntrega, destino, cfg);
  const frete = orcamento.frete;
  const totalPagar = arred2(totalFinal + (frete?.frete ?? 0));
  // Pagamento online: o navegador pede (`checkout`), mas quem decide é o servidor (ligado, forma de pagar configurada e frete calculado).
  const pagamentoOnline = b.checkout === true && !soCadastro && checkoutDisponivel(cfg) && (tipoEntrega === "retirada" || frete !== null);

  // ---- limite de pedidos por telefone/hora
  const variantes = variantesTelefone(telefone);
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("vendas")
    .select("id", { count: "exact", head: true })
    .in("telefone", variantes)
    .gte("criado_em", desde);
  if ((count ?? 0) >= MAX_PEDIDOS_POR_HORA) {
    return erro(429, "muitas_tentativas", "Recebemos vários pedidos deste número na última hora. Fale com a gente pelo WhatsApp.");
  }

  // ---- exemplar único reservado por outro cliente que está pagando agora (a própria pessoa pode refazer o pedido)
  for (const l of linhas.filter((x) => x.tipo === "exemplar_unico")) {
    // Filtro jsonb "contém" escrito como JSON puro: .contains() com array de objetos vira sintaxe de array do Postgres e
    // não casa nada (o teste de ponta a ponta pegou isso).
    const { data: reservas, error: eRes } = await supabase
      .from("vendas")
      .select("telefone")
      .eq("status", "aguardando_pagamento")
      .gt("reservado_ate", new Date().toISOString())
      .filter("itens", "cs", JSON.stringify([{ codigo: l.codigo }]))
      .limit(5);
    if (eRes) console.error("Consulta de reservas falhou:", eRes.message);
    if ((reservas ?? []).some((r) => !variantes.includes(String(r.telefone)))) {
      return erro(409, "item_reservado", `${l.nome} está reservado para outro cliente neste momento. Tente de novo em alguns minutos.`);
    }
  }

  // ---- indicação
  const codIndRaw = limpar(b.codigo_indicacao, 30).toUpperCase();
  const codInd = /^[A-Z0-9-]{4,30}$/.test(codIndRaw) ? codIndRaw : "";
  let indicacaoId: string | null = null;
  if (codInd) {
    const { data: ind } = await supabase
      .from("indicacoes")
      .select("id, expira_em, status")
      .eq("codigo", codInd)
      .maybeSingle();
    if (ind && (!ind.expira_em || new Date(ind.expira_em) > new Date()) && ind.status === "enviada") {
      indicacaoId = ind.id;
    }
  }

  // ---- contato (casa por telefone nas duas formas: com e sem o 9º dígito)
  const utm = limparUtm(b.utm);
  const origem = classificarOrigem(utm, !!indicacaoId);
  const agora = new Date().toISOString();
  const marketing = b.marketing_opt_in === true;

  const { data: existentes } = await supabase
    .from("contatos")
    .select("*")
    .or(`telefone.in.(${variantes.join(",")}),wa_id.in.(${variantes.join(",")})`)
    .limit(1);
  let contato = existentes?.[0];

  if (contato) {
    const upd: Record<string, unknown> = { ultima_interacao_em: agora };
    if (!contato.nome) upd.nome = nome;
    if (!contato.telefone) upd.telefone = telefone;
    if (!contato.email && email) upd.email = email;
    if (!contato.cidade && cidade) upd.cidade = cidade;
    if (!contato.cep && cep) upd.cep = cep;
    if (!contato.origem) upd.origem = origem;
    if (marketing && !contato.consentimento_marketing) {
      upd.consentimento_marketing = true;
      upd.consentimento_em = agora;
    }
    if (contato.status_lead !== "cliente") upd.status_lead = soCadastro ? contato.status_lead ?? "novo" : "qualificado";
    await supabase.from("contatos").update(upd).eq("id", contato.id);
  } else {
    const { data: novo, error: eC } = await supabase
      .from("contatos")
      .insert({
        wa_id: telefone,
        telefone,
        nome,
        email: email || null,
        cidade: cidade || null,
        cep: cep || null,
        origem,
        origem_detalhe: `catalogo_app${utm.source ? `:${utm.source}` : ""}${utm.campaign ? `/${utm.campaign}` : ""}`,
        utm_source: utm.source ?? null,
        utm_medium: utm.medium ?? null,
        utm_campaign: utm.campaign ?? null,
        utm_content: utm.content ?? null,
        status_lead: soCadastro ? "novo" : "qualificado",
        consentimento_marketing: marketing,
        consentimento_em: marketing ? agora : null,
        primeiro_contato_em: agora,
        ultima_interacao_em: agora,
        etapa: soCadastro ? "novo" : "aguardando_humano",
        modo: "humano", // quem veio do site já está no fluxo de fechamento humano; o bot não abre conversa sozinho
      })
      .select("*")
      .single();
    if (eC || !novo) return erro(500, "erro_contato", "Não foi possível registrar seus dados agora. Tente pelo WhatsApp.");
    contato = novo;
  }

  // ---- venda
  const enderecoCompleto = [
    rua ? `${rua}${numeroEnd ? `, ${numeroEnd}` : ""}` : "",
    complemento,
    bairro,
    cidade ? `${cidade}${uf ? `/${uf}` : ""}` : "",
    cep ? `CEP ${fmtCep(cep)}` : "",
  ].filter(Boolean).join(" - ");
  const enderecoTexto = tipoEntrega === "retirada"
    ? "Retirada no local"
    : tipoEntrega === "transportadora"
    ? `Retirada na transportadora mais próxima do CEP ${fmtCep(cep)} (${cidade}/${uf})${enderecoCompleto && rua ? ` - endereço informado: ${enderecoCompleto}` : ""}`
    : enderecoCompleto;

  const obs = [
    limpar(b.observacoes, 500),
    avisoRestricao,
    codInd && !indicacaoId ? `Código de indicação informado (não localizado ou expirado): ${codInd}` : "",
  ].filter(Boolean).join(" | ");

  const { data: venda, error: eV } = await supabase
    .from("vendas")
    .insert({
      contato_id: contato.id,
      nome_completo: nome,
      endereco: enderecoTexto,
      cpf: doc || null,
      itens: linhas,
      valor_total: soCadastro ? null : totalPagar, // total a pagar: peixes já com o desconto do cupom + frete (quando calculado)
      cupom: cupom ? cupom.codigo : null,
      desconto: cupom ? desconto : null,
      frete: frete ? frete.frete : null,
      caixas: frete ? frete.caixas : null,
      frete_gratis: frete ? frete.gratis : null,
      polo_cidade: poloCidade,
      reservado_ate: pagamentoOnline ? new Date(Date.now() + cfg.pagamento.reserva_minutos * 60 * 1000).toISOString() : null,
      status: soCadastro ? "cadastro_recebido" : "aguardando_pagamento",
      origem: "catalogo_app",
      origem_pedido: soCadastro ? "cadastro_envio" : "catalogo_app",
      indicacao_codigo: indicacaoId ? codInd : null,
      telefone,
      email: email || null,
      entrega_tipo: tipoEntrega,
      endereco_detalhe: tipoEntrega !== "retirada"
        ? { cep, rua, numero: numeroEnd, complemento, bairro, cidade, uf, referencia }
        : null,
      cidade: cidade || null,
      uf: uf || null,
      cep: cep || null,
      observacoes: obs || null,
      consentimento_em: agora,
      utm,
    })
    .select("id, numero, token_publico")
    .single();
  if (eV || !venda) return erro(500, "erro_pedido", "Não foi possível registrar o pedido agora. Tente pelo WhatsApp.");

  // Pix "copia e cola" com o valor exato e o número do pedido como identificador (aparece no extrato de alguns bancos).
  let pixCopiaCola: string | null = null;
  if (pagamentoOnline) {
    pixCopiaCola = montarPix(cfg, venda.numero, totalPagar);
    if (pixCopiaCola) await supabase.from("vendas").update({ pix_copia_cola: pixCopiaCola }).eq("id", venda.id);
  }
  // Pedido de teste (marcador secreto em config_loja): não manda aviso à equipe.
  const ehTeste = Boolean(cfg.teste.marcador) && obs.includes(cfg.teste.marcador);

  if (indicacaoId) {
    await supabase
      .from("indicacoes")
      .update({ indicado_contato_id: contato.id, indicado_nome: nome, indicado_telefone: telefone })
      .eq("id", indicacaoId)
      .is("indicado_contato_id", null);
  }

  // Trecho de texto reaproveitado no resumo da equipe e nas mensagens (só aparece quando há cupom).
  const textoDesconto = cupom
    ? `Subtotal: ${brl(total)}\nCupom ${cupom.codigo} (${cupom.percentual}%): -${brl(desconto)}\n`
    : "";

  if (!soCadastro) {
    // Cai na mesma fila de atendimento humano que o bot usa (tabela `handoffs`).
    await supabase.from("handoffs").insert({
      contato_id: contato.id,
      motivo: "pronto_para_fechar",
      resumo: `Pedido nº ${venda.numero} pelo catálogo online: ` +
        linhas.map((l) => `${l.quantidade}x ${l.nome}`).join(", ") +
        (cupom ? `. Cupom ${cupom.codigo} (${cupom.percentual}%): desconto de ${brl(desconto)} sobre ${brl(total)}` : "") +
        `. Total ${brl(totalPagar)}` +
        (frete ? ` (frete ${frete.gratis ? "grátis" : brl(frete.frete)})` : " (frete a combinar)") +
        (pagamentoOnline ? ". Pagamento online: aguardando" : "") +
        ". " +
        (tipoEntrega === "transportadora"
          ? poloCidade
            ? `Retirada em ${poloCidade} (cidade mais próxima de ${cidade}/${uf}): definir o local.`
            : `Retirada na transportadora (CEP ${fmtCep(cep)}, ${cidade}/${uf}): definir qual.`
          : tipoEntrega === "retirada"
          ? "Retirada no local."
          : `Entrega em ${cidade}/${uf}.`),
    });
  }

  await supabase.from("eventos_site").insert({
    tipo: "pedido_enviado",
    sessao: limpar(b.sessao, 64) || null,
    path: "/entrega",
    utm,
    referrer: limpar(b.referrer, 200) || null,
  });

  // ---- link do WhatsApp com a mensagem pronta (o CPF/CNPJ fica só no CRM, nunca vai na mensagem)
  const primeiroNome = nome.split(" ")[0];
  const recebimento = tipoEntrega === "retirada"
    ? "Retirada no local (São José do Rio Preto)"
    : tipoEntrega === "transportadora"
    ? poloCidade
      ? `Retirada em ${poloCidade} (cidade mais próxima de ${cidade}/${uf}). Local: a confirmar.`
      : `Retirada na transportadora mais próxima do CEP ${fmtCep(cep)} (${cidade}/${uf}). Qual transportadora: a confirmar.`
    : "Entrega no endereço";
  // Fechamento dos valores: com frete calculado mostra frete e total do pedido; sem, mantém "frete a combinar".
  const linhaFrete = frete === null
    ? ""
    : frete.gratis
    ? "Frete: grátis\n"
    : `Frete: ${brl(frete.frete)} (${frete.caixas} ${frete.caixas === 1 ? "caixa" : "caixas"})\n`;
  const fechamento = frete === null
    ? `Total dos peixes: ${brl(totalFinal)} (frete a combinar).`
    : `Total dos peixes: ${brl(totalFinal)}\n${linhaFrete}Total do pedido: ${brl(totalPagar)}.`;
  const blocoCliente = [
    `Nome: ${nome}`,
    `WhatsApp: ${fmtTelefone(telefone)}`,
    email ? `E-mail: ${email}` : "",
    `Recebimento: ${recebimento}`,
    tipoEntrega === "retirada" ? "" : `Endereço: ${enderecoCompleto || `CEP ${fmtCep(cep)} - ${cidade}/${uf}`}`,
    referencia ? `Referência: ${referencia}` : "",
    obs ? `Observações: ${obs}` : "",
  ].filter(Boolean).join("\n");
  const texto = soCadastro
    ? `Olá! Aqui é ${primeiroNome}. Enviei meus dados de entrega pelo site da Aquacarpas (cadastro nº ${venda.numero}).\n\n${blocoCliente}\n\nPodemos seguir com o meu pedido?`
    : `Olá! Aqui é ${primeiroNome}. Fiz o pedido nº ${venda.numero} pelo catálogo da Aquacarpas.\n\nPeixes:\n` +
      linhas.map((l) => `- ${l.quantidade}x ${l.nome} (${brl(l.subtotal)})`).join("\n") +
      `\n${textoDesconto}${fechamento}\n\n${blocoCliente}\n\n` +
      (pagamentoOnline ? "Vou pagar pelo catálogo. Qualquer dúvida sobre o envio, falo por aqui." : "Quero combinar o pagamento e o envio.");

  // ---- aviso para a equipe (sem o CPF/CNPJ); roda em segundo plano para não atrasar a resposta ao cliente
  const aviso = [
    `${soCadastro ? "Novo cadastro de envio" : "Novo pedido"} nº ${venda.numero} (catálogo online)`,
    ...(soCadastro
      ? []
      : [
        "",
        ...linhas.map((l) => `${l.quantidade}x ${l.nome} (${brl(l.subtotal)})`),
        (cupom ? `Cupom ${cupom.codigo} (${cupom.percentual}%): -${brl(desconto)} sobre ${brl(total)}\n` : "") + fechamento,
        pagamentoOnline ? "Pagamento online: aguardando (avisamos de novo quando for confirmado)." : "",
      ]),
    "",
    blocoCliente,
  ].join("\n");
  if (!ehTeste) {
    const envio = avisarEquipe(aviso);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(envio);
    else await envio;
  }

  return json(200, {
    ok: true,
    numero: venda.numero,
    tipo: soCadastro ? "cadastro" : "pedido",
    entrega_tipo: tipoEntrega,
    convertido_para_transportadora: avisoRestricao !== "",
    // `total` continua sendo o valor cobrado (agora o total final); os campos novos detalham o cupom.
    total: soCadastro ? null : totalFinal,
    total_original: soCadastro ? null : total,
    total_final: soCadastro ? null : totalFinal,
    desconto: soCadastro ? null : desconto,
    cupom: cupom ? cupom.codigo : null,
    percentual: cupom ? cupom.percentual : null,
    // Checkout: frete calculado no servidor, forma de pagamento e chave do link /pagamento (número + token).
    modo_pagamento: pagamentoOnline ? "online" : "whatsapp",
    token: pagamentoOnline ? venda.token_publico : null,
    frete: frete ? frete.frete : null,
    frete_gratis: frete ? frete.gratis : null,
    caixas: frete ? frete.caixas : null,
    polo_cidade: poloCidade,
    total_pagar: soCadastro ? null : totalPagar,
    itens: linhas.map((l) => ({ codigo: l.codigo, nome: l.nome, quantidade: l.quantidade, subtotal: l.subtotal })),
    whatsapp_url: `https://wa.me/${WHATSAPP_ATENDIMENTO}?text=${encodeURIComponent(texto)}`,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro(405, "metodo", "Método não permitido.");

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 20_000) return erro(413, "muito_grande", "Requisição grande demais.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erro(400, "json_invalido", "Requisição inválida.");
  }

  try {
    if (new URL(req.url).searchParams.get("hook") === "infinitepay") return await webhookInfinitePay(body);
    if (body.acao === "evento") return await registrarEvento(body);
    if (body.acao === "cupom") return await calcularCupom(body);
    if (body.acao === "frete") return await calcularFreteAcao(body);
    if (body.acao === "pedido") return await criarPedido(body);
    if (body.acao === "pedido_status") return await statusDoPedido(body);
    if (body.acao === "pagamento") return await iniciarPagamento(body);
    if (body.acao === "pagamento_conferir") return await conferirPagamento(body);
    if (body.acao === "avisar_pagamento") return await avisarPagamentoCliente(body);
    return erro(400, "acao_invalida", "Ação não reconhecida.");
  } catch (e) {
    // Nunca logar o corpo da requisição: pode conter CPF e endereço.
    console.error("catalogo-api falhou:", e instanceof Error ? e.message : "erro desconhecido");
    return erro(500, "erro_interno", "Algo deu errado. Tente novamente ou fale pelo WhatsApp.");
  }
});
