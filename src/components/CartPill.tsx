"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

export function CartPill() {
  const { quantidadeTotal, pronto } = useCart();
  return (
    <Link href="/entrega" className="pill-pedido" aria-label={`Meu pedido, ${pronto ? quantidadeTotal : 0} itens`}>
      Meu pedido
      {pronto && quantidadeTotal > 0 ? <b>{quantidadeTotal}</b> : null}
    </Link>
  );
}
