"use client";

// Medição de terceiros: Pixel da Meta (anúncios) e Microsoft Clarity (gravações e mapas de calor anônimos).
// Só carrega com os IDs preenchidos em config.ts (PIXELS) E, se `consentimentoObrigatorio` estiver ligado, depois do
// "Aceitar" da faixa de cookies. Nunca recebe nome, telefone, e-mail, CPF ou endereço: só página, produto, valor e eventos.
import { PIXELS } from "./config";

export interface Extra {
  /** Detalhes pequenos que também vão para o rastreio próprio (lista de chaves fechada no servidor). */
  dados?: Record<string, string | number | boolean>;
  /** Valor em reais (preço do peixe, total do pedido). */
  valor?: number;
  nome?: string;
  /** Caminho da página a que o evento pertence (padrão: a página atual). */
  path?: string;
}

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

const CHAVE = "aq_consent_v1";
export type Escolha = "sim" | "nao";

export const terceirosConfigurados = () => Boolean(PIXELS.meta || PIXELS.clarity);

export function lerEscolha(): Escolha | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as { v?: string } | null;
    return v?.v === "sim" || v?.v === "nao" ? v.v : null;
  } catch {
    return null;
  }
}

export function gravarEscolha(e: Escolha) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ v: e, t: Date.now() }));
  } catch {
    /* sem storage: a faixa volta na próxima visita */
  }
}

/** Pode carregar? (sem consentimento obrigatório, basta ter ID; com ele, só depois do "Aceitar"). */
export const podeCarregar = () => terceirosConfigurados() && (!PIXELS.consentimentoObrigatorio || lerEscolha() === "sim");

let carregado = false;
let metaPronto = false;
let clarityPronto = false;
let ultimoPath = "";
let viewPendente: { codigo: string; valor?: number; nome?: string } | null = null;

let metaIniciado = false;

/**
 * Coloca o código base do Pixel da Meta na página no modo oficial de consentimento: `consent revoke` ANTES do `init`.
 * Assim o Pixel fica instalado (a Meta, o Pixel Helper e o "Verificar URL" do Gerenciador de Eventos o enxergam), mas travado:
 * não grava cookie nem envia evento nenhum até o `consent grant`, que só acontece no "Aceitar". Quem recusa não carrega nada.
 */
function iniciarMeta(id: string) {
  if (metaIniciado) return;
  metaIniciado = true;
  if (!window.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else (n.queue as unknown[]).push(args);
    } as Fbq;
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  window.fbq("consent", "revoke");
  // Sem eventos automáticos de botão/microdados: só os eventos que nós mandamos (nada de campo de formulário).
  window.fbq("set", "autoConfig", false, id);
  window.fbq("init", id);
}

/**
 * Instala o Pixel da Meta travado (sem consentimento ainda). Não faz nada se a pessoa já recusou ou se não há ID.
 * Chamado em toda visita para o Pixel ser detectável; nenhum evento sai daqui.
 */
export function prepararMeta() {
  if (!PIXELS.meta || lerEscolha() === "nao") return;
  try {
    iniciarMeta(PIXELS.meta);
  } catch {
    /* o rastreio nunca pode atrapalhar a compra */
  }
}

function iniciarClarity(id: string, utm: Record<string, string>) {
  if (!window.clarity) {
    const c = function (...args: unknown[]) {
      (c.q = c.q || []).push(args);
    } as NonNullable<Window["clarity"]>;
    window.clarity = c;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  }
  clarityPronto = true;
  // Etiquetas para filtrar as gravações por anúncio/origem.
  if (utm.source) window.clarity?.("set", "origem", utm.source);
  if (utm.medium) window.clarity?.("set", "meio", utm.medium);
  if (utm.campaign) window.clarity?.("set", "campanha", utm.campaign);
}

/** Carrega os scripts uma vez (idempotente). Chame depois do consentimento. */
export function carregarTerceiros(utm: Record<string, string>) {
  if (carregado || !podeCarregar()) return;
  carregado = true;
  try {
    if (PIXELS.meta) {
      iniciarMeta(PIXELS.meta); // não faz nada se o Pixel já foi instalado travado por prepararMeta()
      window.fbq?.("consent", "grant"); // o "Aceitar" destrava: a partir daqui os eventos saem e o cookie da Meta é gravado
      metaPronto = true;
      ultimoPath = location.pathname;
      window.fbq?.("track", "PageView");
      if (viewPendente) {
        window.fbq?.("track", "ViewContent", conteudo(viewPendente.codigo, viewPendente.valor, viewPendente.nome));
        viewPendente = null;
      }
    }
    if (PIXELS.clarity) iniciarClarity(PIXELS.clarity, utm);
  } catch {
    /* o rastreio nunca pode atrapalhar a compra */
  }
}

/** Para de carregar e limpa a escolha anterior (quem recusa depois de ter aceito: recarregar derruba os scripts). */
export function descarregar() {
  carregado = false;
  metaPronto = false;
  metaIniciado = false;
  clarityPronto = false;
}

function conteudo(codigo: string, valor?: number, nome?: string) {
  const o: Record<string, unknown> = { content_ids: [codigo], content_type: "product", currency: "BRL" };
  if (typeof valor === "number" && valor > 0) o.value = valor;
  if (nome) o.content_name = nome.slice(0, 100);
  return o;
}

const CLARITY_EVENTOS = new Set(["add_pedido", "iniciou_cadastro", "clique_whatsapp", "frete_calculado", "pagamento_acao", "compra_confirmada"]);

/** Repassa os eventos do rastreio próprio para os pixels (se carregados). */
export function acompanhar(tipo: string, codigo?: string, extra?: Extra) {
  try {
    if (tipo === "produto_visto" && codigo && !metaPronto) viewPendente = { codigo, valor: extra?.valor, nome: extra?.nome };
    if (metaPronto && window.fbq) {
      if (tipo === "pagina" || tipo === "produto_visto") {
        if (location.pathname !== ultimoPath) {
          ultimoPath = location.pathname;
          window.fbq("track", "PageView"); // navegação interna (o site não recarrega a página)
        }
        if (tipo === "produto_visto" && codigo) window.fbq("track", "ViewContent", conteudo(codigo, extra?.valor, extra?.nome));
      } else if (tipo === "add_pedido" && codigo) {
        window.fbq("track", "AddToCart", conteudo(codigo, extra?.valor, extra?.nome));
      } else if (tipo === "iniciou_cadastro") {
        window.fbq("track", "InitiateCheckout", typeof extra?.valor === "number" && extra.valor > 0 ? { value: extra.valor, currency: "BRL" } : {});
      } else if (tipo === "clique_whatsapp") {
        window.fbq("track", "Contact");
      }
    }
    if (clarityPronto && window.clarity && CLARITY_EVENTOS.has(tipo)) window.clarity("event", tipo);
  } catch {
    /* ignora */
  }
}

/** Cadastro/pedido enviado (a pessoa chegou à tela "Recebemos o seu pedido"): "Lead" na Meta, uma vez por pedido. */
export function registrarLead(numero: number, valor?: number | null) {
  if (!metaPronto && !clarityPronto) return;
  const chave = `aq_lead_${numero}`;
  try {
    if (localStorage.getItem(chave)) return;
    localStorage.setItem(chave, "1");
  } catch {
    /* sem storage: segue */
  }
  try {
    if (metaPronto) window.fbq?.("track", "Lead", typeof valor === "number" && valor > 0 ? { value: valor, currency: "BRL" } : {}, { eventID: `lead-${numero}` });
    if (clarityPronto) window.clarity?.("event", "lead");
  } catch {
    /* ignora */
  }
}

/** Pagamento confirmado: "Purchase" na Meta, uma vez por pedido (eventID também serve para deduplicar com a API de Conversões). */
export function registrarCompra(numero: number, valor: number) {
  const chave = `aq_compra_${numero}`;
  try {
    if (localStorage.getItem(chave)) return false;
    localStorage.setItem(chave, "1");
  } catch {
    /* sem storage: segue */
  }
  try {
    if (metaPronto) window.fbq?.("track", "Purchase", { value: valor, currency: "BRL" }, { eventID: `compra-${numero}` });
    if (clarityPronto) window.clarity?.("event", "compra");
  } catch {
    /* ignora */
  }
  return true;
}
