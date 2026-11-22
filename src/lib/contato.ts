import { CONTATO_URL, SUPABASE_ANON_KEY } from "./config";
import { sessaoId, utmAtual } from "./tracking";

/**
 * Contato deixado no aviso de saída ("Deixe seu contato para receber promoções exclusivas"). Vai para a função
 * catalogo-contato, que guarda no mini CRM (tabela `contatos`) com a marca de consentimento. O nome e o WhatsApp só viajam
 * aqui, nunca para o rastreio anônimo (eventos_site) nem para o Clarity (o aviso é mascarado).
 */

export type GatilhoSaida = "mouse" | "ocioso" | "voltou";

/** Só os dígitos do telefone brasileiro, até 11 (tira o +55 se vier colado ou do preenchimento automático). */
export function digitosTelefone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

/** (17) 98151-6665 enquanto a pessoa digita. */
export function formatarTelefone(v: string): string {
  const d = digitosTelefone(v);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** DDD válido e 10 ou 11 dígitos (celular de 11 começa em 9). O servidor confere de novo. */
export function telefoneValido(v: string): boolean {
  const d = digitosTelefone(v);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  return d.length === 10 || d[2] === "9";
}

export interface EnvioContato {
  nome: string;
  telefone: string;
  /** Isca antirrobô: pessoas não veem o campo, então sempre vai vazio. */
  website: string;
  /** Milissegundos entre abrir o aviso e enviar (o servidor descarta o que é rápido demais para ser gente). */
  ms: number;
  gatilho: GatilhoSaida;
  path: string;
  /** Quantos itens a pessoa tem no pedido agora. */
  carrinho: number;
}

export type RespostaContato = { ok: true } | { ok: false; mensagem: string };

export async function enviarContato(d: EnvioContato): Promise<RespostaContato> {
  if (!CONTATO_URL.startsWith("http")) {
    return { ok: false, mensagem: "Serviço indisponível no momento. Fale com a gente pelo WhatsApp." };
  }
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 12000);
  try {
    const r = await fetch(CONTATO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        acao: "contato",
        nome: d.nome.trim(),
        telefone: d.telefone,
        consentimento: true, // só chega aqui depois do toque em "Quero receber promoções", sob o texto de autorização
        website: d.website,
        ms: d.ms,
        gatilho: d.gatilho,
        path: d.path,
        carrinho: d.carrinho,
        sessao: sessaoId(),
        utm: utmAtual(),
      }),
      signal: controle.signal,
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return { ok: true };
    return { ok: false, mensagem: String(j?.mensagem ?? "Não foi possível guardar agora. Tente de novo em instantes.") };
  } catch {
    return { ok: false, mensagem: "Sem conexão com o servidor. Tente de novo em instantes." };
  } finally {
    clearTimeout(timer);
  }
}
