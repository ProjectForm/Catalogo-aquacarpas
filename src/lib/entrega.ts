import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** Faixa de CEP em que não há entrega na residência (tabela `entrega_restricoes`, editada pelo Claude Code). */
export interface Restricao {
  cep_inicio: string;
  cep_fim: string;
  modo: string;
  observacao: string | null;
  cidade: string | null;
  uf: string | null;
}

export type TipoEntrega = "envio" | "transportadora" | "retirada";

export async function carregarRestricoes(): Promise<Restricao[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/entrega_restricoes?select=cep_inicio,cep_fim,modo,observacao,cidade,uf&ativo=eq.true`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (!r.ok) return [];
    return (await r.json()) as Restricao[];
  } catch {
    return []; // sem a lista, o cliente ainda pode escolher a transportadora; a função confere de novo no servidor
  }
}

/** CEP com 8 dígitos (strings de dígitos de mesmo tamanho comparam direto como texto). */
export function restricaoDoCep(cepDigitos: string, lista: Restricao[]): Restricao | null {
  if (cepDigitos.length !== 8) return null;
  return lista.find((r) => r.cep_inicio <= cepDigitos && cepDigitos <= r.cep_fim) ?? null;
}
