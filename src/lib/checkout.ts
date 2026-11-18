import { API_URL, SUPABASE_ANON_KEY } from "./config";

/**
 * Chamadas do checkout à função catalogo-api (frete, status do pedido, pagamento). O servidor calcula tudo e decide
 * o que vale; o navegador só mostra o que volta. Erros viram mensagens amigáveis.
 */

export interface OrcamentoFrete {
  subtotal: number;
  desconto: number;
  cupom: string | null;
  cupom_erro: string | null;
  subtotal_final: number;
  destino: {
    situacao: "entrega" | "polo" | "fora" | "desconhecido";
    cidade: string;
    uf: string;
    polo: { nome: string; uf: string } | null;
  } | null;
  frete: { valor: number; gratis: boolean; caixas: number } | null;
  total_pagar: number;
  pedido_minimo: number;
  gratis_a_partir: number;
  falta_para_gratis: number | null;
  abaixo_minimo: boolean;
  online: { disponivel: boolean; motivo: string | null };
}

export interface StatusPedido {
  numero: number;
  status: string;
  pago: boolean;
  pagamento_online: boolean;
  expirado: boolean;
  reservado_ate: string | null;
  tem_exemplar_unico: boolean;
  entrega_tipo: "envio" | "transportadora" | "retirada";
  cidade: string | null;
  uf: string | null;
  polo_cidade: string | null;
  cupom: string | null;
  desconto: number | null;
  frete: number | null;
  frete_gratis: boolean | null;
  caixas: number | null;
  total_pagar: number | null;
  itens: { nome: string; quantidade: number; subtotal: number }[];
  metodos: { pix: boolean; infinitepay: boolean };
  pix_copia_cola: string | null;
  infinitepay_url: string | null;
}

export type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string; mensagem: string };

async function chamar<T>(corpo: Record<string, unknown>, limiteMs = 15000): Promise<Resposta<T>> {
  if (!API_URL.startsWith("http")) {
    return { ok: false, erro: "config", mensagem: "Serviço indisponível no momento. Fale com a gente pelo WhatsApp." };
  }
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return { ok: true, dados: j as T };
    return {
      ok: false,
      erro: String(j?.erro ?? "falha"),
      mensagem: String(j?.mensagem ?? "Não foi possível concluir agora. Tente novamente ou fale com a gente pelo WhatsApp."),
    };
  } catch {
    return { ok: false, erro: "rede", mensagem: "Sem conexão com o servidor. Tente novamente em instantes." };
  } finally {
    clearTimeout(timer);
  }
}

export const consultarFrete = (p: {
  itens: { codigo: string; quantidade: number }[];
  cupom?: string | null;
  cep: string;
  cidade: string;
  uf: string;
  tipo: string;
}) => chamar<OrcamentoFrete>({ acao: "frete", ...p, cupom: p.cupom ?? undefined });

export const statusPedido = (numero: number, token: string) => chamar<StatusPedido>({ acao: "pedido_status", numero, token });

export const iniciarPagamento = (numero: number, token: string, metodo: "pix" | "infinitepay") =>
  chamar<{ pix_copia_cola?: string; url?: string; pago?: boolean }>({ acao: "pagamento", numero, token, metodo }, 25000);

export const conferirPagamento = (numero: number, token: string, transaction_nsu: string, slug: string) =>
  chamar<{ pago: boolean }>({ acao: "pagamento_conferir", numero, token, transaction_nsu, slug }, 20000);

export const avisarPagamento = (numero: number, token: string) => chamar<{ pago?: boolean }>({ acao: "avisar_pagamento", numero, token });
