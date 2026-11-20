"use client";

import { useEffect, useRef } from "react";

/** Velocidade do nado pela tela (px por segundo) e tempo fora da tela antes de ela reaparecer pela header. */
const VELOCIDADE = 28;
const PAUSA_MS = 3500;
/** Largura / altura da imagem (public/carpa/orbita-v2.webp). */
const PROPORCAO = 256 / 102;

interface Pt {
  x: number;
  y: number;
}
interface Amostra extends Pt {
  ang: number;
}
interface Caixa {
  l: number;
  t: number;
  r: number;
  b: number;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function pontoBezier(p: Pt[], t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
    y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
  };
}
function derivadaBezier(p: Pt[], t: number): Pt {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p[1].x - p[0].x) + 6 * u * t * (p[2].x - p[1].x) + 3 * t * t * (p[3].x - p[2].x),
    y: 3 * u * u * (p[1].y - p[0].y) + 6 * u * t * (p[2].y - p[1].y) + 3 * t * t * (p[3].y - p[2].y),
  };
}
function amostrar(p: Pt[], n: number): Amostra[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const q = pontoBezier(p, t);
    const d = derivadaBezier(p, t);
    return { x: q.x, y: q.y, ang: Math.atan2(d.y, d.x) };
  });
}

/**
 * Quanto a carpa, ao longo da rota, invade as caixas de texto (soma dos quadrados da penetração, em px²; 0 = livre).
 * A carpa é tratada como uma cápsula (o corpo vira um segmento com a espessura como raio), que acompanha a inclinação
 * melhor que uma caixa reta, e deixa 4 px de folga do texto.
 */
function sobreposicao(amostras: Amostra[], compr: number, alt: number, caixas: Caixa[]): number {
  const meio = (compr * 0.86) / 2 - alt * 0.3; // meio comprimento do segmento (as pontas arredondadas fecham o resto)
  const raio = alt * 0.43 + 4;
  let total = 0;
  for (const a of amostras) {
    const dx = Math.cos(a.ang) * meio;
    const dy = Math.sin(a.ang) * meio;
    for (let k = -2; k <= 2; k++) {
      const px = a.x + (dx * k) / 2;
      const py = a.y + (dy * k) / 2;
      for (const b of caixas) {
        const cx = limitar(px, b.l, b.r);
        const cy = limitar(py, b.t, b.b);
        const d = Math.hypot(px - cx, py - cy);
        if (d < raio) total += (raio - d) * (raio - d);
      }
    }
  }
  return total;
}

/**
 * A carpa real do vídeo da Aquacarpas (public/carpa/orbita-v2.webp: WebP animado com transparência de verdade, só a
 * carpa) cruza o canto do topo sozinha, com tempo próprio (não depende da rolagem): nasce embaixo da header, desce nadando,
 * faz a curva para a direita com a cabeça sempre virada para onde vai, sai pela borda direita da tela, some alguns
 * segundos e volta a sair da header. A rota é uma curva de Bézier montada na hora a partir do layout real (título,
 * subtítulo, nota do Google e Instagram), escolhendo o caminho que não passa por cima de nenhum texto em qualquer largura
 * de tela. É tocada pela Web Animations API (compositor, sem JavaScript por quadro) e só roda enquanto está visível.
 * Com "reduzir movimento" fica parada (quadro do poster). Decorativa (aria-hidden), sem toque.
 */
export function CarpaNadando() {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    const coluna = img?.closest<HTMLElement>(".hero-texto");
    const hero = img?.closest<HTMLElement>(".hero-suave");
    if (!img || !coluna || !hero) return;

    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const podeAnimar = !reduzido && typeof img.animate === "function";
    let animacao: Animation | null = null;
    let visivel = true;
    let ativo = true; // falso depois do cleanup: promessas e observadores atrasados nao recriam a animacao
    let quadro = 0;

    const caixasDe = (seletores: string[], col: DOMRect): Caixa[] => {
      const caixas: Caixa[] = [];
      for (const sel of seletores) {
        hero.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          const b = r.getBoundingClientRect();
          if (b.width > 0 && b.height > 0) caixas.push({ l: b.left - col.left - 2, t: b.top - col.top - 2, r: b.right - col.left + 2, b: b.bottom - col.top + 2 });
        });
      }
      return caixas;
    };

    const montar = () => {
      animacao?.cancel();
      animacao = null;
      if (!ativo) return;
      const col = coluna.getBoundingClientRect();
      const topoHero = hero.getBoundingClientRect().top - col.top; // negativo: o hero começa acima da coluna
      const largTela = document.documentElement.clientWidth;
      const compr = Math.round(limitar(largTela * 0.185, 64, 90));
      const alt = compr / PROPORCAO;
      img.style.width = `${compr}px`;

      const texto = caixasDe([".hero-suave h1 .t-marca", ".hero-suave h1 .t-cat", ".hero-suave .subtitulo", ".hero-suave .avaliacao", ".hero-suave .insta"], col);
      const nota = hero.querySelector<HTMLElement>(".prova")?.getBoundingClientRect();
      const subtitulo = hero.querySelector<HTMLElement>(".subtitulo")?.getBoundingClientRect();
      if (!nota || !subtitulo || texto.length === 0) return;
      const notaT = nota.top - col.top;
      const notaB = nota.bottom - col.top;
      const subB = subtitulo.bottom - col.top;
      const tituloDir = Math.max(...texto.slice(0, 2).map((c) => c.r));

      const desktop = window.matchMedia("(min-width: 861px)").matches;
      const xFim = desktop ? col.width + 40 : largTela - col.left + compr / 2 + 10; // celular: some pela borda da tela
      const yTopo = topoHero - alt / 2 - 6; // começa acima do hero (escondida atrás da header)

      // Saídas preferidas: abaixo da linha da nota (como o Juan desenhou) e, se não couber, entre o subtítulo e a nota.
      // Testa vários pontos de partida (xs), inclinações do começo da descida (lean) e saídas, e fica com a rota que não
      // passa por cima de texto e mais se parece com o desenho: começa perto de 57% da largura e sai logo abaixo da nota.
      const saidas: [number, number][] = [
        [notaB + 14, 0],
        [(subB + notaT) / 2, 60],
        [(notaT + notaB) / 2, 120],
      ];
      const xPreferido = col.width * 0.57;
      let melhor: { p: Pt[]; custo: number } | null = null;
      for (const [ye, penalidade] of saidas) {
        for (let xs = tituloDir + 6; xs <= col.width - 16; xs += 6) {
          for (const lean of [0, 12, 24, 36, 48]) {
            const p = [
              { x: xs, y: yTopo },
              { x: xs + lean, y: yTopo + (ye - yTopo) * 0.62 },
              { x: xs + lean + (xFim - xs - lean) * 0.4, y: ye },
              { x: xFim, y: ye + 10 },
            ];
            const sobra = sobreposicao(amostrar(p, 80), compr, alt, texto);
            const custo = sobra * 1000 + penalidade + Math.pow(xs - xPreferido, 2) * 0.01 + lean * 0.4;
            if (!melhor || custo < melhor.custo) melhor = { p, custo };
          }
        }
      }
      if (!melhor) return;

      const pts = amostrar(melhor.p, 120);
      const acum: number[] = [0];
      for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const comprimento = acum[acum.length - 1];
      const moveMs = (comprimento / VELOCIDADE) * 1000;
      const total = moveMs + PAUSA_MS;
      const fim = moveMs / total;

      const frame = (i: number, opacidade: number): Keyframe => ({
        offset: (acum[i] / comprimento) * fim,
        transform: `translate(${(pts[i].x - compr / 2).toFixed(1)}px, ${(pts[i].y - alt / 2).toFixed(1)}px) rotate(${((pts[i].ang * 180) / Math.PI).toFixed(2)}deg)`,
        opacity: opacidade,
      });

      if (!podeAnimar) {
        // parada (reduzir movimento): fica no trecho em que a carpa já está descendo ao lado do título
        const i = Math.round(pts.length * 0.3);
        const q = frame(i, 1);
        img.style.transform = String(q.transform);
        img.style.opacity = "1";
        return;
      }

      const quadros: Keyframe[] = pts.map((_, i) => {
        const prog = acum[i] / comprimento;
        // no computador a carpa esmaece no fim (ali ao lado fica a foto); no celular sai pela borda da tela
        const o = desktop ? 1 - limitar((prog - 0.78) / 0.2, 0, 1) : 1;
        return frame(i, o);
      });
      const ultimo = pts.length - 1;
      quadros.push({ ...frame(ultimo, 0), offset: Math.min(fim + 0.0001, 0.9999) });
      quadros.push({ ...frame(0, 0), offset: 1 });
      img.style.opacity = "0";
      animacao = img.animate(quadros, { duration: total, iterations: Infinity, easing: "linear" });
      if (!visivel) animacao.pause();
    };

    const agendar = () => {
      if (!ativo) return;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(montar);
    };

    agendar();
    const ro = new ResizeObserver(agendar);
    ro.observe(coluna);
    coluna.querySelectorAll("h1, .subtitulo, .prova").forEach((el) => ro.observe(el));
    void document.fonts?.ready.then(agendar);

    // só anima enquanto o topo da página está na tela (economiza bateria)
    const obs =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entradas) => {
              for (const e of entradas) {
                visivel = e.isIntersecting;
                if (visivel) animacao?.play();
                else animacao?.pause();
              }
            },
            { threshold: 0 },
          );
    obs?.observe(hero);

    return () => {
      ativo = false;
      cancelAnimationFrame(quadro);
      ro.disconnect();
      obs?.disconnect();
      animacao?.cancel();
    };
  }, []);

  return (
    <picture aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet="/carpa/orbita-parada-v2.webp" />
      <img ref={imgRef} className="carpa-nada" src="/carpa/orbita-v2.webp" alt="" width={256} height={102} decoding="async" fetchPriority="low" />
    </picture>
  );
}
