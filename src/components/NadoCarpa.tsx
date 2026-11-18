"use client";

import { useEffect, useRef } from "react";

/**
 * Uma carpa em traço fino, monocromática, que nada pela faixa enquanto a página rola: ao descer ela segue para a
 * direita, ao subir volta (virando de lado). Só mexe em transform e opacidade (nada de layout), com um único
 * requestAnimationFrame enquanto houver movimento e um listener de rolagem passivo. Com "reduzir movimento" fica parada.
 * É decorativa (aria-hidden).
 */
export function NadoCarpa() {
  const faixaRef = useRef<HTMLDivElement>(null);
  const peixeRef = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const faixa = faixaRef.current;
    const peixe = peixeRef.current;
    const corpo = corpoRef.current;
    if (!faixa || !peixe || !corpo) return;

    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let largura = faixa.clientWidth;
    let larguraPeixe = peixe.offsetWidth;
    let atual = 0; // posição desenhada (0 a 1)
    let alvo = 0; // posição pedida pela rolagem (0 a 1)
    let sentido = 1; // 1 = nadando para a direita, -1 = para a esquerda
    let quadro = 0;

    const medir = () => {
      largura = faixa.clientWidth;
      larguraPeixe = peixe.offsetWidth;
    };

    /** Entra na tela por baixo (0) e sai por cima (1). */
    const calcularAlvo = () => {
      const r = faixa.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      alvo = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
    };

    const pintar = () => {
      const curso = Math.max(0, largura - larguraPeixe);
      const fase = atual * Math.PI * 4; // duas ondulações ao longo do percurso
      const x = atual * curso;
      const y = Math.sin(fase) * 5;
      const inclinacao = Math.atan((5 * Math.PI * 4 * Math.cos(fase)) / Math.max(curso, 1)) * (180 / Math.PI) * 0.6;
      peixe.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${inclinacao.toFixed(2)}deg)`;
      corpo.style.transform = `scaleX(${sentido})`;
      // some suavemente nas pontas do percurso
      const borda = Math.min(atual, 1 - atual);
      peixe.style.opacity = String(Math.min(1, borda / 0.1) * 0.9);
    };

    if (reduzido) {
      atual = 0.5;
      pintar();
      return;
    }

    const animar = () => {
      quadro = 0;
      const d = alvo - atual;
      if (Math.abs(d) < 0.0004) {
        atual = alvo;
        pintar();
        return;
      }
      if (Math.abs(d) > 0.0009) sentido = d > 0 ? 1 : -1;
      atual += d * 0.1;
      pintar();
      quadro = requestAnimationFrame(animar);
    };

    const aoRolar = () => {
      calcularAlvo();
      if (!quadro) quadro = requestAnimationFrame(animar);
    };
    const aoRedimensionar = () => {
      medir();
      aoRolar();
    };

    calcularAlvo();
    atual = alvo; // começa já no ponto certo, sem correr desde a esquerda
    pintar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRedimensionar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  return (
    <div ref={faixaRef} className="nado" aria-hidden="true">
      <div ref={peixeRef} className="nado-peixe">
        <div ref={corpoRef} className="nado-corpo">
          <svg viewBox="0 0 160 56" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            {/* corpo */}
            <path d="M150 28C140 18 118 10 92 12 70 14 52 22 38 27 52 32 70 42 92 44 118 46 140 38 150 28Z" />
            {/* cauda */}
            <g className="koi-cauda">
              <path d="M38 27C28 22 18 14 6 6 10 18 12 24 10 28 12 32 10 38 6 50 18 42 28 32 38 27Z" />
            </g>
            {/* nadadeira dorsal e peitoral */}
            <path d="M96 12C90 6 76 5 66 8 74 10 80 12 84 14" />
            <g className="koi-peitoral">
              <path d="M118 34C110 42 100 46 92 50 102 50 112 46 122 38" />
            </g>
            {/* guelra, olho e manchas (kohaku) em traço bem leve */}
            <path d="M124 20C128 26 128 32 124 38" />
            <circle cx="138" cy="25" r="1.3" fill="currentColor" stroke="none" />
            <path className="koi-mancha" d="M98 18C86 17 76 22 72 28 80 31 92 31 102 27 106 23 104 19 98 18Z" />
            <path className="koi-mancha" d="M60 28C54 27 48 28 44 28 50 31 56 32 62 31Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
