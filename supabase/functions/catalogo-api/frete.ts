// Frete por caixas, igual ao site principal da Aquacarpas (src/lib/shipping.ts de lá):
//  - cada peixe ocupa "unidades de volume" conforme o tamanho; a caixa comporta 15 unidades;
//  - caixas = teto(volume total / 15); frete = caixas x valor da caixa no estado de destino;
//  - frete grátis a partir de um subtotal (aqui: o valor dos peixes já com o desconto do cupom).
// Lógica pura, sem dependências: roda no Deno (Supabase) e no Node (testes em logica.test.ts).

/**
 * Zona de frete: um conjunto de cidades com regras PRÓPRIAS (valor da caixa, frete grátis e pedido mínimo), que valem no
 * lugar da tabela por estado. Entra por lista de códigos IBGE (`municipios`) e/ou por raio a partir de São José do Rio
 * Preto (`raio_km`, em linha reta; a distância de cada município fica em municipios_atendimento.distancia_rp_km).
 */
export interface ZonaFrete {
  nome: string;
  municipios?: string[]; // códigos IBGE de 7 dígitos
  raio_km?: number;
  custo_por_caixa: number; // R$ por caixa
  gratis_a_partir: number; // R$ (valor dos peixes já com o cupom)
  pedido_minimo_online: number; // R$ (preço de tabela, antes do cupom)
}

export interface RegrasFrete {
  capacidade_caixa: number; // unidades de volume por caixa (15)
  gratis_a_partir: number; // R$ (cidades fora das zonas)
  pedido_minimo_online: number; // R$ (sobre o preço de tabela, antes do cupom; cidades fora das zonas)
  custo_por_caixa: Record<string, number>; // UF -> R$ por caixa
  custo_padrao: number; // UF sem valor definido
  zonas?: ZonaFrete[]; // opcional; lista por IBGE vence o raio; entre raios, o menor
}

/** Zona de frete da cidade, ou null (vale a tabela por estado). `distanciaKm` = distância até Rio Preto, se conhecida. */
export function escolherZona(ibge: string, distanciaKm: number | null, regras: RegrasFrete): ZonaFrete | null {
  const zonas = regras.zonas ?? [];
  const porLista = zonas.find((z) => z.municipios?.includes(ibge));
  if (porLista) return porLista;
  if (distanciaKm === null || !Number.isFinite(distanciaKm)) return null;
  const porRaio = zonas
    .filter((z) => typeof z.raio_km === "number")
    .sort((a, b) => (a.raio_km as number) - (b.raio_km as number))
    .find((z) => distanciaKm <= (z.raio_km as number));
  return porRaio ?? null;
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
  /**
   * Volume FIXO de cada unidade, em milésimos de unidade de volume (kits). Vence o tamanho. Um kit de 2 caixas tem 30000.
   * Sem isto, um item sem tamanho vale 15000 (1 caixa), que é o que os kits de 1 caixa ocupam.
   */
  volume_milesimos?: number | null;
}

/** Volume de UMA unidade do item, em milésimos: o fixo do kit, se houver, senão o da faixa de tamanho. */
export function volumeDoItem(i: ItemFrete): number {
  const v = i.volume_milesimos;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  return milesimosDeVolume(i.tamanho_medio_cm);
}

/**
 * Volume fixo de um kit, lido de `catalogo.ficha.kit.volume_unidades` (em unidades de volume, ex.: 30 = 2 caixas), em milésimos.
 * null = não é kit ou o valor não serve (então vale a regra do tamanho). Aceita de 0,5 a 300 unidades.
 */
export function volumeDeKit(ficha: unknown): number | null {
  if (!ficha || typeof ficha !== "object") return null;
  const kit = (ficha as Record<string, unknown>).kit;
  if (!kit || typeof kit !== "object") return null;
  const v = (kit as Record<string, unknown>).volume_unidades;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0.5 || v > 300) return null;
  return Math.round(v * 1000);
}

export function calcularCaixas(itens: ItemFrete[], capacidade = 15): number {
  const total = itens.reduce((s, i) => s + volumeDoItem(i) * i.quantidade, 0);
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

/**
 * `subtotalFinal` = valor dos peixes já com o desconto do cupom (base do frete grátis). Com `zona`, valem o valor da caixa e o
 * frete grátis dela; sem zona, a tabela por estado e o frete grátis geral.
 */
export function calcularFrete(
  itens: ItemFrete[],
  uf: string,
  subtotalFinal: number,
  regras: RegrasFrete,
  zona: ZonaFrete | null = null,
): ResultadoFrete {
  const caixas = calcularCaixas(itens, regras.capacidade_caixa);
  const custo_caixa = zona ? zona.custo_por_caixa : custoPorCaixa(uf, regras);
  const gratis = subtotalFinal >= (zona ? zona.gratis_a_partir : regras.gratis_a_partir);
  return { caixas, custo_caixa, frete: gratis ? 0 : Math.round(caixas * custo_caixa * 100) / 100, gratis };
}
