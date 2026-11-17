import { API_URL, SUPABASE_ANON_KEY } from "./config";

/** Resposta da ação "cupom" da função catalogo-api. O servidor decide; o navegador só mostra. */
export interface CupomCalculado {
  codigo: string;
  percentual: number;
  desconto: number;
  total_original: number;
  total_final: number;
  valido_ate: string;
}

export type ResultadoCupom =
  | { ok: true; dados: CupomCalculado }
  | { ok: false; erro: string; mensagem: string };

/** Pergunta ao servidor quanto o cupom desconta nos itens informados. Não grava nada e não avisa ninguém. */
export async function consultarCupom(codigo: string, itens: { codigo: string; quantidade: number }[]): Promise<ResultadoCupom> {
  if (!API_URL.startsWith("http")) {
    return { ok: false, erro: "config", mensagem: "O cupom não está disponível agora. Fale com a gente pelo WhatsApp." };
  }
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 12000);
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ acao: "cupom", cupom: codigo, itens }),
      signal: controle.signal,
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) {
      return {
        ok: true,
        dados: {
          codigo: String(j.codigo),
          percentual: Number(j.percentual),
          desconto: Number(j.desconto),
          total_original: Number(j.total_original),
          total_final: Number(j.total_final),
          valido_ate: String(j.valido_ate ?? ""),
        },
      };
    }
    return {
      ok: false,
      erro: String(j?.erro ?? "falha"),
      mensagem: String(j?.mensagem ?? "Não foi possível conferir o cupom agora. Tente novamente."),
    };
  } catch {
    return { ok: false, erro: "rede", mensagem: "Sem conexão com o servidor. Tente novamente em instantes." };
  } finally {
    clearTimeout(limite);
  }
}
