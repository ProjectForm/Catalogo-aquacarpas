"use client";

import { useState } from "react";

export function Galeria({ imagens, alt }: { imagens: string[]; alt: string }) {
  const [atual, setAtual] = useState(0);
  if (imagens.length === 0) return <div className="galeria"><div className="principal" /></div>;
  return (
    <div className="galeria">
      <div className="principal">
        <img src={imagens[atual]} alt={alt} decoding="async" />
      </div>
      {imagens.length > 1 ? (
        <div className="miniaturas">
          {imagens.map((src, i) => (
            <button key={src} type="button" aria-label={`Foto ${i + 1}`} aria-current={i === atual} onClick={() => setAtual(i)}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
