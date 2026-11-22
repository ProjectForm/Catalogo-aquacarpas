"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturarUtm, evento } from "@/lib/tracking";

/** Registra a visita (e o produto visto, se houver) e guarda os UTMs da entrada. */
export function TrackView({ produto, preco, nome }: { produto?: string; preco?: number | null; nome?: string }) {
  const path = usePathname();
  useEffect(() => {
    capturarUtm();
    evento(produto ? "produto_visto" : "pagina", produto, produto ? { valor: preco ?? undefined, nome } : undefined);
  }, [path, produto, preco, nome]);
  return null;
}
