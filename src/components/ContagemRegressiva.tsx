"use client";

import { useEffect, useState } from "react";
import { BLACK_FRIDAY } from "@/lib/config";

const FIM = Date.parse(BLACK_FRIDAY.fim);

const dois = (n: number) => String(n).padStart(2, "0");

/**
 * Contagem regressiva até o fim da campanha (30/11 23:59:59, horário de Brasília). Só calcula depois de montar no
 * navegador (o servidor não sabe a hora do visitante); o espaço fica reservado para não mexer o layout.
 */
export function ContagemRegressiva() {
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRestante(Math.max(0, FIM - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  if (restante !== null && restante <= 0) return null; // campanha encerrada: some

  const seg = restante === null ? null : Math.floor(restante / 1000);
  const partes: [string, string][] = [
    ["dias", seg === null ? "--" : dois(Math.floor(seg / 86400))],
    ["horas", seg === null ? "--" : dois(Math.floor((seg % 86400) / 3600))],
    ["min", seg === null ? "--" : dois(Math.floor((seg % 3600) / 60))],
    ["seg", seg === null ? "--" : dois(seg % 60)],
  ];

  return (
    <div className="contagem" role="timer" aria-label={`Tempo restante: até ${BLACK_FRIDAY.fimTextoLongo}`}>
      {partes.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <span className="num">{valor}</span>
          <span className="rot">{rotulo}</span>
        </div>
      ))}
    </div>
  );
}
