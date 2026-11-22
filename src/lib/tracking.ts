"use client";

// Rastreio próprio, leve e SEM dado pessoal nem cookie: id aleatório de sessão (some ao fechar a aba) + UTMs.
// Alimenta a tabela `eventos_site` pela função `catalogo-eventos` (funil: visita -> produto visto -> adicionou ao pedido ->
// cadastro -> WhatsApp, e também rolagem, cliques, tempo na página e em qual campo do formulário a pessoa parou) e diz de qual
// anúncio/post o cliente veio (contatos.origem / vendas.utm). Os mesmos eventos alimentam o Pixel da Meta e o Clarity
// (ver pixels.ts), que só existem se houver ID e consentimento.
import { EVENTOS_URL, SUPABASE_ANON_KEY } from "./config";
import { acompanhar } from "./pixels";
import type { Extra } from "./pixels";

export type { Extra } from "./pixels";

const CHAVE_SESSAO = "aq_sid";
const CHAVE_UTM = "aq_utm";

export type TipoEvento =
  | "pagina"
  | "produto_visto"
  | "add_pedido"
  | "clique_whatsapp"
  | "iniciou_cadastro"
  | "scroll"
  | "secao_vista"
  | "clique"
  | "saiu"
  | "campo"
  | "cep_ok"
  | "frete_calculado"
  | "pagamento_acao"
  | "compra_confirmada"
  | "roleta";
export type Utm = Partial<Record<"source" | "medium" | "campaign" | "content" | "term" | "ref", string>>;

function lerSessao(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarSessao(chave: string, valor: string) {
  try {
    sessionStorage.setItem(chave, valor);
  } catch {
    /* navegador bloqueou o storage: segue sem rastreio */
  }
}

export function sessaoId(): string {
  let s = lerSessao(CHAVE_SESSAO);
  if (!s) {
    s = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random();
    gravarSessao(CHAVE_SESSAO, s);
  }
  return s;
}

/** Guarda os parâmetros utm_* / ref da URL de entrada (o último vence). */
export function capturarUtm(): Utm {
  const params = new URLSearchParams(window.location.search);
  const novo: Utm = {};
  for (const k of ["source", "medium", "campaign", "content", "term"] as const) {
    const v = params.get(`utm_${k}`);
    if (v) novo[k] = v.slice(0, 100);
  }
  const ref = params.get("ref");
  if (ref) novo.ref = ref.slice(0, 100);
  if (Object.keys(novo).length) {
    gravarSessao(CHAVE_UTM, JSON.stringify(novo));
    return novo;
  }
  return utmAtual();
}

export function utmAtual(): Utm {
  try {
    const raw = lerSessao(CHAVE_UTM);
    return raw ? (JSON.parse(raw) as Utm) : {};
  } catch {
    return {};
  }
}

interface Item {
  tipo: TipoEvento;
  path: string;
  item_codigo?: string;
  dados?: Record<string, string | number | boolean>;
}

/** Eventos esperam ~1,5 s para seguir juntos numa chamada só (menos chamadas à função); estes saem na hora. */
const URGENTES = new Set<TipoEvento>(["add_pedido", "clique_whatsapp", "iniciou_cadastro", "compra_confirmada", "pagamento_acao", "saiu"]);
let fila: Item[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let ouvindo = false;

function referrerHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    return "";
  }
}

function enviar() {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  while (fila.length > 0) {
    const itens = fila.splice(0, 25);
    fetch(EVENTOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ acao: "eventos", sessao: sessaoId(), utm: utmAtual(), referrer: referrerHost(), itens }),
      keepalive: true,
    }).catch(() => {
      /* rastreio nunca pode atrapalhar a compra */
    });
  }
}

function ouvirSaida() {
  if (ouvindo) return;
  ouvindo = true;
  // Ao esconder a aba ou sair da página, descarrega o que estiver na fila (no celular "pagehide" nem sempre dispara).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enviar();
  });
  window.addEventListener("pagehide", enviar);
}

export function evento(tipo: TipoEvento, itemCodigo?: string, extra?: Extra) {
  if (!EVENTOS_URL.startsWith("http")) return;
  ouvirSaida();
  fila.push({ tipo, path: extra?.path ?? window.location.pathname, item_codigo: itemCodigo, dados: extra?.dados });
  if (URGENTES.has(tipo) || fila.length >= 20) enviar();
  else if (!timer) timer = setTimeout(enviar, 1500);
  acompanhar(tipo, itemCodigo, extra);
}
