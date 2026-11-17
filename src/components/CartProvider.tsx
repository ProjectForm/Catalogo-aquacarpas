"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Produto } from "@/lib/catalogo";
import { precoUnitario } from "@/lib/catalogo";
import { blackFridayAtiva, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { consultarCupom } from "@/lib/cupom";
import type { CupomCalculado } from "@/lib/cupom";
import { evento } from "@/lib/tracking";

export interface ItemPedido {
  codigo: string;
  slug: string;
  nome: string;
  imagem: string | null;
  tipo: Produto["tipo"];
  preco: number | null;
  preco_promocional: number | null;
  promo_qtd_minima: number;
  quantidade_minima: number;
  quantidade: number;
}

interface CartCtx {
  itens: ItemPedido[];
  pronto: boolean;
  quantidadeTotal: number;
  total: number;
  /** Campanha Black Friday vigente (só vale depois que o carrinho carregou no navegador). */
  bf: boolean;
  /** Código do cupom guardado no carrinho (ex.: BLACK30), se houver. */
  cupomCodigo: string | null;
  /** Cálculo do servidor para os itens atuais; null se não há cupom ou se o cálculo ainda está sendo refeito. */
  cupom: CupomCalculado | null;
  verificandoCupom: boolean;
  mensagemCupom: string | null;
  /** Total que será cobrado pelos peixes (com o desconto do cupom quando o servidor já confirmou). */
  totalFinal: number;
  aplicarCupom: (codigo: string) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
  removerCupom: () => void;
  adicionar: (p: Produto, qtd?: number) => void;
  definirQuantidade: (codigo: string, qtd: number) => void;
  remover: (codigo: string) => void;
  limpar: () => void;
  temItem: (codigo: string) => boolean;
}

interface Calculo {
  assinatura: string;
  codigo: string;
  dados: CupomCalculado;
}

const Ctx = createContext<CartCtx | null>(null);
const CHAVE = "aq_cart_v1";
const CHAVE_CUPOM = "aq_cupom_v1"; // guarda só o código; os valores vêm sempre do servidor

/** Identifica "quais itens e quantidades" para saber se o cálculo do cupom ainda vale. */
const assinaturaDe = (itens: ItemPedido[]) =>
  itens.map((i) => `${i.codigo}:${i.quantidade}`).sort().join("|");

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [pronto, setPronto] = useState(false);
  const [cupomCodigo, setCupomCodigo] = useState<string | null>(null);
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [verificandoCupom, setVerificandoCupom] = useState(false);
  const [mensagemCupom, setMensagemCupom] = useState<string | null>(null);

  // Referências para o efeito de recálculo ler o valor mais recente sem entrar nas dependências.
  const itensRef = useRef<ItemPedido[]>([]);
  const calculoRef = useRef<Calculo | null>(null);
  itensRef.current = itens;
  calculoRef.current = calculo;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) setItens(JSON.parse(raw) as ItemPedido[]);
      const cup = localStorage.getItem(CHAVE_CUPOM);
      if (cup && blackFridayAtiva() && /^[A-Z0-9-]{3,30}$/.test(cup)) setCupomCodigo(cup);
      else if (cup) localStorage.removeItem(CHAVE_CUPOM); // campanha encerrada: esquece o cupom
    } catch {
      /* storage indisponível: começa vazio */
    }
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch {
      /* ignora */
    }
  }, [itens, pronto]);

  useEffect(() => {
    if (!pronto) return;
    try {
      if (cupomCodigo) localStorage.setItem(CHAVE_CUPOM, cupomCodigo);
      else localStorage.removeItem(CHAVE_CUPOM);
    } catch {
      /* ignora */
    }
  }, [cupomCodigo, pronto]);

  // Preços do carrinho guardado no navegador podem estar velhos (o catálogo muda no banco sem deploy).
  // Na primeira carga, confere os preços atuais para o total mostrado ser o mesmo que o servidor vai cobrar.
  const precosSincronizados = useRef(false);
  useEffect(() => {
    if (!pronto || precosSincronizados.current || itensRef.current.length === 0) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    precosSincronizados.current = true;
    const codigos = itensRef.current.map((i) => i.codigo).filter((c) => /^[A-Za-z0-9-]{2,30}$/.test(c));
    if (codigos.length === 0) return;
    fetch(
      `${SUPABASE_URL}/rest/v1/catalogo?select=codigo,preco,preco_promocional,promo_qtd_minima&ativo=eq.true&codigo=in.(${codigos.join(",")})`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((linhas: { codigo: string; preco: number | string | null; preco_promocional: number | string | null; promo_qtd_minima: number | null }[]) => {
        if (!Array.isArray(linhas) || linhas.length === 0) return;
        const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
        setItens((atual) =>
          atual.map((i) => {
            const n = linhas.find((l) => l.codigo === i.codigo);
            return n ? { ...i, preco: num(n.preco), preco_promocional: num(n.preco_promocional), promo_qtd_minima: Number(n.promo_qtd_minima ?? 1) } : i;
          }),
        );
      })
      .catch(() => {
        /* sem rede: o servidor recalcula tudo no pedido de qualquer forma */
      });
  }, [pronto]);

  const adicionar = useCallback((p: Produto, qtd?: number) => {
    const inicial = Math.max(p.quantidade_minima, 1);
    setItens((atual) => {
      const existente = atual.find((i) => i.codigo === p.codigo);
      if (existente) {
        if (p.tipo === "exemplar_unico") return atual;
        return atual.map((i) => (i.codigo === p.codigo ? { ...i, quantidade: Math.min(i.quantidade + (qtd ?? 1), 200) } : i));
      }
      return [
        ...atual,
        {
          codigo: p.codigo,
          slug: p.slug,
          nome: p.nome,
          imagem: p.imagens[0] ?? null,
          tipo: p.tipo,
          preco: p.preco,
          preco_promocional: p.preco_promocional,
          promo_qtd_minima: p.promo_qtd_minima,
          quantidade_minima: p.quantidade_minima,
          quantidade: p.tipo === "exemplar_unico" ? 1 : Math.max(qtd ?? 1, inicial),
        },
      ];
    });
    evento("add_pedido", p.codigo);
  }, []);

  const definirQuantidade = useCallback((codigo: string, qtd: number) => {
    setItens((atual) =>
      atual.map((i) => (i.codigo === codigo && i.tipo !== "exemplar_unico" ? { ...i, quantidade: Math.min(Math.max(qtd, 1), 200) } : i)),
    );
  }, []);

  const remover = useCallback((codigo: string) => setItens((atual) => atual.filter((i) => i.codigo !== codigo)), []);

  const removerCupom = useCallback(() => {
    setCupomCodigo(null);
    setCalculo(null);
    setMensagemCupom(null);
  }, []);

  const limpar = useCallback(() => {
    setItens([]);
    removerCupom();
  }, [removerCupom]);

  const temItem = useCallback((codigo: string) => itens.some((i) => i.codigo === codigo), [itens]);

  const bf = pronto && blackFridayAtiva();
  const assinatura = useMemo(() => assinaturaDe(itens), [itens]);

  // Aplica o cupom pedindo ao servidor. Só guarda o código se o servidor aceitar.
  const aplicarCupom = useCallback(
    async (codigo: string) => {
      const cod = codigo.trim().toUpperCase();
      if (!cod) return { ok: false as const, mensagem: "Digite o código do cupom." };
      const atuais = itensRef.current;
      setVerificandoCupom(true);
      setMensagemCupom(null);
      const r = await consultarCupom(cod, atuais.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })));
      setVerificandoCupom(false);
      if (!r.ok) return { ok: false as const, mensagem: r.mensagem };
      setCupomCodigo(r.dados.codigo);
      setCalculo({ assinatura: assinaturaDe(atuais), codigo: r.dados.codigo, dados: r.dados });
      return { ok: true as const };
    },
    [],
  );

  // Itens ou quantidades mudaram com um cupom no carrinho: refaz o cálculo no servidor.
  useEffect(() => {
    if (!pronto || !cupomCodigo) return;
    if (!bf) {
      setCupomCodigo(null);
      setCalculo(null);
      return;
    }
    if (itensRef.current.length === 0) {
      setCalculo(null);
      return;
    }
    const atual = calculoRef.current;
    if (atual && atual.assinatura === assinatura && atual.codigo === cupomCodigo) return; // já está calculado
    let cancelado = false;
    const t = setTimeout(async () => {
      const itensAgora = itensRef.current;
      setVerificandoCupom(true);
      const r = await consultarCupom(cupomCodigo, itensAgora.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })));
      if (cancelado) return;
      setVerificandoCupom(false);
      if (r.ok) {
        setCalculo({ assinatura: assinaturaDe(itensAgora), codigo: cupomCodigo, dados: r.dados });
        setMensagemCupom(null);
      } else {
        setCalculo(null);
        setMensagemCupom(r.mensagem);
        // Cupom inválido ou expirado: sai do carrinho. Outros erros (ex.: item indisponível) mantêm o código.
        if (r.erro === "cupom_invalido" || r.erro === "cupom_expirado") setCupomCodigo(null);
      }
    }, 350);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [pronto, bf, cupomCodigo, assinatura]);

  const valor = useMemo<CartCtx>(() => {
    const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);
    const total = itens.reduce((s, i) => s + (precoUnitario(i, i.quantidade) ?? 0) * i.quantidade, 0);
    const cupom =
      calculo && cupomCodigo && calculo.codigo === cupomCodigo && calculo.assinatura === assinatura ? calculo.dados : null;
    return {
      itens, pronto, quantidadeTotal, total, bf, cupomCodigo, cupom, verificandoCupom, mensagemCupom,
      totalFinal: cupom ? cupom.total_final : total,
      aplicarCupom, removerCupom, adicionar, definirQuantidade, remover, limpar, temItem,
    };
  }, [itens, pronto, bf, cupomCodigo, calculo, assinatura, verificandoCupom, mensagemCupom, aplicarCupom, removerCupom, adicionar, definirQuantidade, remover, limpar, temItem]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
}
