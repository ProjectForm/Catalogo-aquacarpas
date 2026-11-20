"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Produto } from "@/lib/catalogo";
import { disponivelParaPedido } from "@/lib/catalogo";
import { useCart } from "./CartProvider";

const MAXIMO = 200;

/**
 * Quantidade no próprio card (e na página do peixe), logo depois de tocar em "Adicionar": - / número / +.
 * O número também aceita digitação (para quem quer 30 peixes sem tocar 30 vezes). No mínimo, o "-" tira o item do pedido.
 */
function Quantidade({ produto, quantidade }: { produto: Produto; quantidade: number }) {
  const { definirQuantidade, remover } = useCart();
  const minimo = Math.max(produto.quantidade_minima, 1);
  const [texto, setTexto] = useState(String(quantidade));
  useEffect(() => setTexto(String(quantidade)), [quantidade]);

  function confirmar() {
    const n = parseInt(texto, 10);
    if (!Number.isFinite(n) || n < 1) {
      setTexto(String(quantidade));
      return;
    }
    const final = Math.min(Math.max(n, minimo), MAXIMO);
    definirQuantidade(produto.codigo, final);
    setTexto(String(final));
  }

  const noMinimo = quantidade <= minimo;
  return (
    <div className="qtd-card" role="group" aria-label={`Quantidade de ${produto.nome}`}>
      <button
        type="button"
        aria-label={noMinimo ? "Remover do pedido" : "Diminuir quantidade"}
        onClick={() => (noMinimo ? remover(produto.codigo) : definirQuantidade(produto.codigo, quantidade - 1))}
      >
        −
      </button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label="Quantidade"
        value={texto}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button type="button" aria-label="Aumentar quantidade" onClick={() => definirQuantidade(produto.codigo, Math.min(quantidade + 1, MAXIMO))}>
        +
      </button>
    </div>
  );
}

export function AdicionarBotao({ produto, cheio = false }: { produto: Produto; cheio?: boolean }) {
  const { adicionar, itens } = useCart();
  const classeBloco = cheio ? " btn-bloco" : "";

  if (!disponivelParaPedido(produto)) {
    return (
      <Link href={`/p/${produto.slug}`} className={`btn btn-contorno${classeBloco}`}>
        {produto.status === "vendido" ? "Vendido" : produto.status === "reservado" ? "Reservado" : "Consultar"}
      </Link>
    );
  }

  const noPedido = itens.find((i) => i.codigo === produto.codigo);
  if (noPedido) {
    // Exemplar único: só existe um, então não há quantidade; vai direto para o pedido.
    if (produto.tipo === "exemplar_unico") {
      return (
        <Link href="/entrega" className={`btn btn-contorno${classeBloco}`}>
          {cheio ? "No pedido — finalizar" : <>No pedido<span className="so-largo"> — finalizar</span></>}
        </Link>
      );
    }
    return (
      <>
        <Quantidade produto={produto} quantidade={noPedido.quantidade} />
        {cheio ? (
          <Link href="/entrega" className="btn btn-primario btn-bloco">
            Finalizar pedido
          </Link>
        ) : null}
      </>
    );
  }

  return (
    <button type="button" className={`btn btn-primario${classeBloco}`} onClick={() => adicionar(produto)}>
      {cheio ? "Adicionar ao pedido" : <>Adicionar<span className="so-largo"> ao pedido</span></>}
    </button>
  );
}
