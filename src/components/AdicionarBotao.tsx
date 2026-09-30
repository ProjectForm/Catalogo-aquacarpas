"use client";

import Link from "next/link";
import type { Produto } from "@/lib/catalogo";
import { disponivelParaPedido } from "@/lib/catalogo";
import { useCart } from "./CartProvider";

export function AdicionarBotao({ produto, cheio = false }: { produto: Produto; cheio?: boolean }) {
  const { adicionar, temItem } = useCart();
  const classeBloco = cheio ? " btn-bloco" : "";

  if (!disponivelParaPedido(produto)) {
    return (
      <Link href={`/p/${produto.slug}`} className={`btn btn-contorno${classeBloco}`}>
        {produto.status === "vendido" ? "Vendido" : produto.status === "reservado" ? "Reservado" : "Consultar"}
      </Link>
    );
  }
  if (temItem(produto.codigo)) {
    return (
      <Link href="/entrega" className={`btn btn-contorno${classeBloco}`}>
        No pedido — finalizar
      </Link>
    );
  }
  return (
    <button type="button" className={`btn btn-primario${classeBloco}`} onClick={() => adicionar(produto)}>
      Adicionar ao pedido
    </button>
  );
}
