"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLACK_FRIDAY, blackFridayAtiva } from "@/lib/config";

/**
 * Faixa fina no topo de todas as páginas. O servidor decide se entra (`ativa`, recalculado a cada 60 s pela revalidação);
 * o navegador ainda confere o relógio para sumir sozinha se a página ficou aberta além do prazo.
 */
export function FaixaBlackFriday({ ativa }: { ativa: boolean }) {
  const [vigente, setVigente] = useState(ativa);

  useEffect(() => {
    const checar = () => setVigente(ativa && blackFridayAtiva());
    checar();
    const t = setInterval(checar, 30000);
    return () => clearInterval(t);
  }, [ativa]);

  if (!vigente) return null;
  return (
    <div className="faixa-bf" role="region" aria-label="Black Friday">
      <Link href="/#catalogo">{BLACK_FRIDAY.faixa}</Link>
    </div>
  );
}
