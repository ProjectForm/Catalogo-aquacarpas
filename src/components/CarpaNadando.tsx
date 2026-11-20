"use client";

import { useEffect, useRef } from "react";

/**
 * A carpa real do vídeo da Aquacarpas nadando em vai e volta (boomerangue) no espaço livre ao lado do título.
 * O arquivo (public/carpa/nadando-v1.mp4, ~90 KB) já é o recorte só da carpa, sem marca d'água nem reflexos, e o loop
 * já vem montado com desaceleração nas pontas, então basta `loop`. O fundo do vídeo é quase preto e o CSS usa
 * mix-blend-mode: lighten para a caixa sumir sobre a página.
 *
 * Só toca enquanto está na tela (economiza bateria) e não toca com "reduzir movimento" (fica o quadro parado do poster).
 * Se o navegador bloquear o autoplay (ex.: economia de bateria no iPhone), continua o quadro parado. Decorativo (aria-hidden).
 */
export function CarpaNadando() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // o React não escreve o atributo muted no HTML; o iOS exige muted para tocar sozinho
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tocar = () => {
      const p = v.play();
      if (p) p.catch(() => undefined);
    };
    if (typeof IntersectionObserver === "undefined") {
      tocar();
      return;
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) tocar();
          else v.pause();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(v);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="carpa-nada" aria-hidden="true">
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="auto"
        poster="/carpa/nadando-v1.webp"
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
      >
        <source src="/carpa/nadando-v1.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
