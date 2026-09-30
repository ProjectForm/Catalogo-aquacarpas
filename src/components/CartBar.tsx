"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brl } from "@/lib/format";
import { useCart } from "./CartProvider";

export function CartBar() {
  const { quantidadeTotal, total, pronto } = useCart();
  const path = usePathname();
  if (!pronto || quantidadeTotal === 0 || path.startsWith("/entrega") || path.startsWith("/obrigado")) return null;
  return (
    <div className="barra-pedido" role="region" aria-label="Resumo do pedido">
      <div className="info">
        {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"} no pedido
        <b>{brl(total)}</b>
      </div>
      <Link href="/entrega" className="btn btn-primario">
        Finalizar pedido
      </Link>
    </div>
  );
}
