"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Produto } from "@/lib/catalogo";
import { precoUnitario } from "@/lib/catalogo";
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
  adicionar: (p: Produto, qtd?: number) => void;
  definirQuantidade: (codigo: string, qtd: number) => void;
  remover: (codigo: string) => void;
  limpar: () => void;
  temItem: (codigo: string) => boolean;
}

const Ctx = createContext<CartCtx | null>(null);
const CHAVE = "aq_cart_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) setItens(JSON.parse(raw) as ItemPedido[]);
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
  const limpar = useCallback(() => setItens([]), []);
  const temItem = useCallback((codigo: string) => itens.some((i) => i.codigo === codigo), [itens]);

  const valor = useMemo<CartCtx>(() => {
    const quantidadeTotal = itens.reduce((s, i) => s + i.quantidade, 0);
    const total = itens.reduce((s, i) => s + (precoUnitario(i, i.quantidade) ?? 0) * i.quantidade, 0);
    return { itens, pronto, quantidadeTotal, total, adicionar, definirQuantidade, remover, limpar, temItem };
  }, [itens, pronto, adicionar, definirQuantidade, remover, limpar, temItem]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fora do CartProvider");
  return c;
}
