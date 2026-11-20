/**
 * A carpa real do vídeo da Aquacarpas nadando em círculos no canto do hero. É uma imagem WebP animada com
 * transparência de verdade (public/carpa/orbita-v2.webp, ~360 KB, só a carpa: sem marca d'água, sem reflexos e sem caixa
 * preta, já com o vai e volta (boomerangue) do nado), e o CSS (.orbita) a faz girar em círculo com a cabeça na tangente.
 * Sem JavaScript e sem depender de autoplay de vídeo (toca também com economia de bateria). Com "reduzir movimento" o
 * <picture> troca pelo quadro parado e a órbita não anima. Decorativa (aria-hidden) e sem toque.
 */
export function CarpaNadando() {
  return (
    <div className="orbita" aria-hidden="true">
      <div className="orbita-giro">
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcSet="/carpa/orbita-parada-v2.webp" />
          <img
            className="orbita-peixe"
            src="/carpa/orbita-v2.webp"
            alt=""
            width={256}
            height={102}
            decoding="async"
            fetchPriority="low"
          />
        </picture>
      </div>
    </div>
  );
}
