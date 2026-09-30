"use client";

// Rastreio leve e sem dado pessoal: id aleatório de sessão + UTMs. Alimenta a tabela `eventos_site`
// (funil: visita -> produto visto -> adicionou ao pedido -> clicou no WhatsApp -> enviou o pedido)
// e diz de qual anúncio/post o cliente veio (contatos.origem / vendas.utm).
import { API_URL, SUPABASE_ANON_KEY } from "./config";

const CHAVE_SESSAO = "aq_sid";
const CHAVE_UTM = "aq_utm";

export type TipoEvento = "pagina" | "produto_visto" | "add_pedido" | "clique_whatsapp" | "iniciou_cadastro";
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

export function evento(tipo: TipoEvento, itemCodigo?: string) {
  if (!API_URL.startsWith("http")) return;
  const corpo = {
    acao: "evento",
    tipo,
    sessao: sessaoId(),
    path: window.location.pathname,
    item_codigo: itemCodigo,
    utm: utmAtual(),
    referrer: document.referrer ? new URL(document.referrer).hostname : "",
  };
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(corpo),
    keepalive: true,
  }).catch(() => {
    /* rastreio nunca pode atrapalhar a compra */
  });
}
