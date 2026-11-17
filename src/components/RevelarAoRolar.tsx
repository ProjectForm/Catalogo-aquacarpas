"use client";

import { useEffect } from "react";

/**
 * Entrada suave dos cards e títulos de seção ao rolar a página (só opacidade e deslocamento de 14 px: não mexe no
 * layout). Quem já está na tela ao abrir não é escondido; sem JavaScript ou com "reduzir movimento" nada some.
 * Só é montado durante a Black Friday.
 */
export function RevelarAoRolar() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const alvos = Array.from(document.querySelectorAll<HTMLElement>(".secao-cab, .cartao"));
    const abaixoDaDobra = alvos.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    if (abaixoDaDobra.length === 0) return;

    const timers: number[] = [];
    const obs = new IntersectionObserver(
      (entradas) => {
        let ordem = 0;
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          obs.unobserve(el);
          const atraso = Math.min(ordem++, 5) * 70; // cards da mesma fileira entram em sequência curta
          el.style.setProperty("--rv-atraso", `${atraso}ms`);
          el.classList.add("rv-vis");
          // Terminada a entrada, devolve o elemento ao CSS normal (hover do card etc.).
          timers.push(
            window.setTimeout(() => {
              el.classList.remove("rv-pre", "rv-vis");
              el.style.removeProperty("--rv-atraso");
            }, 900 + atraso),
          );
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    abaixoDaDobra.forEach((el) => {
      el.classList.add("rv-pre");
      obs.observe(el);
    });

    return () => {
      obs.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      abaixoDaDobra.forEach((el) => el.classList.remove("rv-pre", "rv-vis"));
    };
  }, []);

  return null;
}
