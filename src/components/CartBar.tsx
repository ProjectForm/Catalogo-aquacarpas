"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brl } from "@/lib/format";
import { useCart } from "./CartProvider";

export function CartBar() {
  const { quantidadeTotal, total, pronto, cupom, bf } = useCart();
  const path = usePathname();
  if (!pronto || quantidadeTotal === 0 || path.startsWith("/entrega") || path.startsWith("/obrigado") || path.startsWith("/pagamento")) return null;
  const comCupom = bf && cupom !== null;
  return (
    <div className="barra-pedido" role="region" aria-label="Resumo do pedido">
      <div className="info">
        {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"}
        {comCupom ? <span className="com-cupom"> · com {cupom.codigo}</span> : " no pedido"}
        <b>{brl(comCupom ? cupom.total_final : total)}</b>
      </div>
      <Link href="/entrega" className="btn btn-primario">
        Finalizar pedido
      </Link>
    </div>
  );
}
