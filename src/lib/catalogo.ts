import { BLACK_FRIDAY, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export type StatusItem = "disponivel" | "reservado" | "vendido" | "sob_consulta";

export interface Produto {
  codigo: string;
  slug: string;
  nome: string;
  variedade: string;
  tamanho_cm: number | null;
  categoria: string | null;
  tipo: "lote" | "exemplar_unico";
  descricao: string | null;
  preco: number | null;
  preco_promocional: number | null;
  promo_qtd_minima: number;
  quantidade: number | null;
  quantidade_minima: number;
  controla_estoque: boolean;
  imagens: string[];
  video_url: string | null;
  ordem: number;
  destaque: boolean;
  status: StatusItem;
  ficha: Record<string, unknown>;
}

export interface Categoria {
  slug: string;
  nome: string;
  descricao: string | null;
  ordem: number;
}

export interface Secao {
  categoria: Categoria;
  produtos: Produto[];
}

async function rest<T>(caminho: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example).");
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    // Atualiza sozinho a cada 60s: mudou o catálogo no banco, o site acompanha sem novo deploy.
    next: { revalidate: 60 },
  });
  // Erro de propósito: se falhar ao atualizar, a Vercel continua servindo a última versão boa.
  if (!r.ok) throw new Error(`Supabase respondeu ${r.status} em ${caminho}`);
  return r.json() as Promise<T>;
}

function normalizar(p: Record<string, unknown>): Produto {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const imagens = Array.isArray(p.imagens) && p.imagens.length
    ? (p.imagens as string[])
    : p.foto_url
    ? [p.foto_url as string]
    : [];
  return {
    codigo: String(p.codigo),
    slug: String(p.slug ?? String(p.codigo).toLowerCase()),
    nome: String(p.nome ?? p.variedade),
    variedade: String(p.variedade),
    tamanho_cm: num(p.tamanho_cm),
    categoria: (p.categoria as string) ?? null,
    tipo: p.tipo === "exemplar_unico" ? "exemplar_unico" : "lote",
    descricao: (p.descricao as string) ?? null,
    preco: num(p.preco),
    preco_promocional: num(p.preco_promocional),
    promo_qtd_minima: Number(p.promo_qtd_minima ?? 1),
    quantidade: num(p.quantidade),
    quantidade_minima: Number(p.quantidade_minima ?? 1),
    controla_estoque: Boolean(p.controla_estoque),
    imagens,
    video_url: (p.video_url as string) ?? null,
    ordem: Number(p.ordem ?? 100),
    destaque: Boolean(p.destaque),
    status: (p.status as StatusItem) ?? "disponivel",
    ficha: (p.ficha as Record<string, unknown>) ?? {},
  };
}

export async function listarProdutos(): Promise<Produto[]> {
  const linhas = await rest<Record<string, unknown>[]>("catalogo?select=*&ativo=eq.true&order=ordem.asc");
  return linhas.map(normalizar);
}

export async function buscarProduto(slug: string): Promise<Produto | null> {
  const linhas = await rest<Record<string, unknown>[]>(
    `catalogo?select=*&ativo=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return linhas[0] ? normalizar(linhas[0]) : null;
}

export async function listarSecoes(): Promise<Secao[]> {
  const [produtos, categorias] = await Promise.all([
    listarProdutos(),
    rest<Categoria[]>("catalogo_categorias?select=slug,nome,descricao,ordem&ativo=eq.true&order=ordem.asc"),
  ]);
  const secoes: Secao[] = categorias
    .map((c) => ({ categoria: c, produtos: produtos.filter((p) => p.categoria === c.slug) }))
    .filter((s) => s.produtos.length > 0);
  const semCategoria = produtos.filter((p) => !categorias.some((c) => c.slug === p.categoria));
  if (semCategoria.length) {
    secoes.push({ categoria: { slug: "outros", nome: "Outros", descricao: null, ordem: 999 }, produtos: semCategoria });
  }
  return secoes;
}

// ---------- preço ----------
export const temPromocao = (p: Produto) => p.preco_promocional !== null;
/** Promoção que só vale a partir de certa quantidade (ex.: "acima de 5 unidades"). */
export const promocaoPorQuantidade = (p: Produto) => temPromocao(p) && p.promo_qtd_minima > 1;

export function precoUnitario(p: Pick<Produto, "preco" | "preco_promocional" | "promo_qtd_minima">, qtd: number): number | null {
  if (p.preco_promocional !== null && qtd >= p.promo_qtd_minima) return p.preco_promocional;
  return p.preco;
}

export const disponivelParaPedido = (p: Produto) => p.status === "disponivel" && p.preco !== null;

/** Exemplar único (Nishikigoi): o card não mostra preço; o valor só aparece na página do peixe, depois do vídeo e da procedência. */
export const precoSoNaPagina = (p: Pick<Produto, "tipo">) => p.tipo === "exemplar_unico";

// ---------- kits ----------
/**
 * Kit = lote montado para viajar em UMA caixa. É um item comum do `catalogo` (tipo "lote", preço cheio = soma dos peixes,
 * preço promocional = preço do kit) com `ficha.kit`. Sem tamanho e sem faixa de propósito: o servidor trata item sem tamanho
 * como 1 caixa por unidade (frete.ts, `milesimosDeVolume(null)`), que é exatamente o que um kit ocupa.
 */
export interface KitInfo {
  /** Total de peixes do kit (vira a legenda "15 koi" na foto e "15 peixes" sob o nome). */
  quantidade: number | null;
  /** Tamanho dos peixes quando é um só (ex.: "10 a 12 cm"); kits mistos usam `composicao`. */
  tamanho: string | null;
  /** Composição dos kits mistos (ex.: "2 de 21 cm"). */
  composicao: string[];
  /** Brinde que acompanha o kit, sem preço (ex.: "2 kg de ração 46% de proteína"). */
  brinde: string | null;
}

export function kitDe(p: Pick<Produto, "ficha">): KitInfo | null {
  const k = p.ficha?.kit;
  if (!k || typeof k !== "object" || Array.isArray(k)) return null;
  const o = k as Record<string, unknown>;
  const composicao = Array.isArray(o.composicao) ? o.composicao.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  const brinde = typeof o.brinde === "string" && o.brinde.trim() ? o.brinde.trim() : null;
  const quantidade = typeof o.quantidade === "number" && Number.isFinite(o.quantidade) && o.quantidade > 0 ? Math.floor(o.quantidade) : null;
  const tamanho = typeof o.tamanho === "string" && o.tamanho.trim() ? o.tamanho.trim() : null;
  return { quantidade, tamanho, composicao, brinde };
}

/** "15 peixes" / "1 peixe". */
export const rotuloPeixes = (n: number) => `${n} ${n === 1 ? "peixe" : "peixes"}`;

/**
 * Valor com o cupom da campanha, só para MOSTRAR no kit ("Preço com cupom: ..."). Mesma conta do servidor (catalogo-api,
 * aplicarCupom): o desconto é arredondado uma vez, em centavos. Quem decide o desconto de verdade é sempre o servidor.
 */
export function comCupomBlackFriday(valor: number): number {
  const desconto = Math.round(valor * BLACK_FRIDAY.percentual) / 100;
  return Math.round((valor - desconto) * 100) / 100;
}
