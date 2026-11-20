"use client";

import { useEffect, useRef } from "react";

/** Altura (px) da zona, contada a partir da base da primeira tela, em que a carpa nada. Depois dela, some. */
const ZONA = 1500;
/**
 * Quanto a carpa desce na página para cada px rolado. Um pouco mais que 1: ela desce mais depressa que o conteúdo,
 * então, na tela, vai ficando um pouco à frente de quem rola, como quem mostra o caminho para baixo.
 */
const RITMO = 1.2;
/** Largura de cada curva do percurso (px) e quanto ela serpenteia para os lados. */
const ONDA = 120;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Uma carpa vista de cima, em traço fino e monocromática, que sai de baixo do cabeçalho da lista (as abas) e nada para
 * baixo, em curvas suaves, pela grade de produtos enquanto a página rola. Ao rolar para cima ela dá meia-volta.
 * Não ocupa espaço no layout (zona de altura zero com a carpa em posição absoluta), só mexe em transform e opacidade,
 * usa um único requestAnimationFrame enquanto houver movimento e um listener de rolagem passivo.
 * Com "reduzir movimento" nem aparece. É decorativa (aria-hidden) e não recebe toque.
 */
export function NadoCarpa() {
  const zonaRef = useRef<HTMLDivElement>(null);
  const peixeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const zona = zonaRef.current;
    const peixe = peixeRef.current;
    if (!zona || !peixe) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let largura = zona.clientWidth;
    let compr = peixe.offsetHeight;
    let larg = peixe.offsetWidth;
    let atual = 0; // rolagem desenhada (px)
    let alvo = 0; // rolagem real (px)
    let giro = 0; // 0 = nadando para baixo, 1 = para cima (meia-volta suave)
    let quadro = 0;

    const pintar = () => {
      const percorrido = atual * RITMO; // quanto a carpa já desceu dentro da zona
      const topo = -compr + percorrido; // começa toda escondida acima da zona e vai saindo de baixo das abas
      const amplitude = Math.min(largura * 0.26, 150);
      const x = largura / 2 + amplitude * Math.sin(percorrido / ONDA);
      const inclinacao = -Math.atan((amplitude / ONDA) * Math.cos(percorrido / ONDA)) * (180 / Math.PI);
      peixe.style.transform = `translate3d(${(x - larg / 2).toFixed(1)}px, ${topo.toFixed(1)}px, 0) rotate(${(inclinacao + 180 * giro).toFixed(1)}deg)`;
      const entra = limitar((topo + compr) / 90, 0, 1);
      const sai = limitar((ZONA - 40 - topo) / 220, 0, 1);
      peixe.style.opacity = String((0.85 * entra * sai).toFixed(3));
    };

    const animar = () => {
      quadro = 0;
      const d = alvo - atual;
      const giroAlvo = d < -0.5 ? 1 : d > 0.5 ? 0 : Math.round(giro);
      atual += d * 0.12;
      giro += (giroAlvo - giro) * 0.14;
      if (Math.abs(d) < 0.3) atual = alvo;
      if (Math.abs(giroAlvo - giro) < 0.01) giro = giroAlvo;
      pintar();
      if (atual !== alvo || giro !== giroAlvo) quadro = requestAnimationFrame(animar);
    };

    const aoRolar = () => {
      alvo = Math.max(0, window.scrollY);
      if (!quadro) quadro = requestAnimationFrame(animar);
    };
    const aoRedimensionar = () => {
      largura = zona.clientWidth;
      compr = peixe.offsetHeight;
      larg = peixe.offsetWidth;
      pintar();
    };

    alvo = Math.max(0, window.scrollY);
    atual = alvo; // abriu a página já rolada (voltar, recarregar): começa no ponto certo
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
    <div className="nado" aria-hidden="true">
      <div ref={zonaRef} className="nado-zona">
        <div ref={peixeRef} className="nado-peixe">
          {/* carpa vista de cima, cabeça para baixo; traço de 1 px */}
          <svg viewBox="0 0 56 120" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M28 116C37 112 42 98 41 84C40 68 34 52 30 40L26 40C22 52 16 68 15 84C14 98 19 112 28 116Z" />
            <g className="koi-cauda">
              <path d="M30 40C34 30 38 18 35 6C32 12 29 14 28 15C27 14 24 12 21 6C18 18 22 30 26 40" />
            </g>
            <g className="koi-peitoral-d">
              <path d="M40 100C46 98 51 92 53 84C47 88 43 92 40 94" />
            </g>
            <g className="koi-peitoral-e">
              <path d="M16 100C10 98 5 92 3 84C9 88 13 92 16 94" />
            </g>
            <path d="M39 66C43 64 46 60 47 55C43 58 40 60 38 62" />
            <path d="M17 66C13 64 10 60 9 55C13 58 16 60 18 62" />
            <circle cx="35" cy="104" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="21" cy="104" r="1.3" fill="currentColor" stroke="none" />
            <path className="koi-mancha" d="M22 82C22 72 30 70 34 76C36 82 30 90 24 90Z" />
            <path className="koi-mancha" d="M24 58C24 52 30 50 32 54C32 60 28 64 24 62Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
