"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturarUtm, evento } from "@/lib/tracking";

/** Registra a visita (e o produto visto, se houver) e guarda os UTMs da entrada. */
export function TrackView({ produto }: { produto?: string }) {
  const path = usePathname();
  useEffect(() => {
    capturarUtm();
    evento(produto ? "produto_visto" : "pagina", produto);
  }, [path, produto]);
  return null;
}
