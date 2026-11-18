// Frete por caixas, igual ao site principal da Aquacarpas (src/lib/shipping.ts de lá):
//  - cada peixe ocupa "unidades de volume" conforme o tamanho; a caixa comporta 15 unidades;
//  - caixas = teto(volume total / 15); frete = caixas x valor da caixa no estado de destino;
//  - frete grátis a partir de um subtotal (aqui: o valor dos peixes já com o desconto do cupom).
// Lógica pura, sem dependências: roda no Deno (Supabase) e no Node (testes em logica.test.ts).

export interface RegrasFrete {
  capacidade_caixa: number; // unidades de volume por caixa (15)
  gratis_a_partir: number; // R$
  pedido_minimo_online: number; // R$ (sobre o preço de tabela, antes do cupom)
  custo_por_caixa: Record<string, number>; // UF -> R$ por caixa
  custo_padrao: number; // UF sem valor definido
}

/** "22-23" -> 22,5; "30" -> 30; 14 -> 14; sem informação -> null. */
export function tamanhoMedioCm(tamanho: unknown, faixa: unknown): number | null {
  if (typeof tamanho === "number" && tamanho > 0) return tamanho;
  if (typeof faixa === "string") {
    const nums = (faixa.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
    if (nums.length === 1) return nums[0];
    if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  }
  return null;
}

/**
 * Unidades de volume por peixe, em milésimos (evita erro de ponto flutuante: 1,875 vira 1875).
 * Faixas do site principal: 8-12 cm = 1; 12-15 = 1,5; 15-17 = 1,875; 18-21 = 3; 23-27 = 5; 28-32 = 7,5; 33+ = 15.
 * Tamanhos que caem entre duas faixas (ex.: 22,5 cm) ficam na faixa de CIMA, que é o lado seguro para os peixes.
 * Sem tamanho conhecido: 15 (um peixe por caixa), também o lado seguro.
 */
export function milesimosDeVolume(tamanhoCm: number | null): number {
  if (tamanhoCm === null) return 15000;
  if (tamanhoCm <= 12) return 1000;
  if (tamanhoCm <= 15) return 1500;
  if (tamanhoCm <= 17) return 1875;
  if (tamanhoCm <= 21) return 3000;
  if (tamanhoCm <= 27) return 5000;
  if (tamanhoCm <= 32) return 7500;
  return 15000;
}

export interface ItemFrete {
  tamanho_medio_cm: number | null;
  quantidade: number;
}

export function calcularCaixas(itens: ItemFrete[], capacidade = 15): number {
  const total = itens.reduce((s, i) => s + milesimosDeVolume(i.tamanho_medio_cm) * i.quantidade, 0);
  return total <= 0 ? 0 : Math.ceil(total / (capacidade * 1000));
}

export function custoPorCaixa(uf: string, regras: RegrasFrete): number {
  return regras.custo_por_caixa[uf.toUpperCase()] ?? regras.custo_padrao;
}

export interface ResultadoFrete {
  caixas: number;
  custo_caixa: number;
  frete: number; // 0 quando grátis
  gratis: boolean;
}

/** `subtotalFinal` = valor dos peixes já com o desconto do cupom (base do frete grátis). */
export function calcularFrete(itens: ItemFrete[], uf: string, subtotalFinal: number, regras: RegrasFrete): ResultadoFrete {
  const caixas = calcularCaixas(itens, regras.capacidade_caixa);
  const custo_caixa = custoPorCaixa(uf, regras);
  const gratis = subtotalFinal >= regras.gratis_a_partir;
  return { caixas, custo_caixa, frete: gratis ? 0 : Math.round(caixas * custo_caixa * 100) / 100, gratis };
}
