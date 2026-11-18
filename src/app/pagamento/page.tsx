import type { Metadata } from "next";
import { Suspense } from "react";
import { PagamentoClient } from "@/components/PagamentoClient";

export const metadata: Metadata = {
  title: "Pagamento do pedido",
  robots: { index: false, follow: false },
};

export default function PagamentoPage() {
  return (
    <Suspense fallback={null}>
      <PagamentoClient />
    </Suspense>
  );
}
