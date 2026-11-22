import { GOOGLE, SITE } from "@/lib/config";

/** Estrela em traço cheio (24x24). */
const ESTRELA = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

function CincoEstrelas() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
          <path d={ESTRELA} />
        </svg>
      ))}
    </>
  );
}

/**
 * Estrelas da nota: a camada de baixo é a fileira apagada e a de cima, com a largura cortada na nota (4,8 de 5),
 * mostra as estrelas preenchidas (dourado suave). A última estrela fica 80% cheia.
 */
function Estrelas() {
  const cheias = Math.floor(GOOGLE.nota);
  const fracao = Math.round((GOOGLE.nota - cheias) * 100) / 100;
  return (
    <span className="estrelas" role="img" aria-label={`Nota ${GOOGLE.notaTexto} de 5`}>
      <span className="estrelas-fundo">
        <CincoEstrelas />
      </span>
      <span className="estrelas-cheio" style={{ width: `calc(${cheias} * (var(--e) + var(--g)) + ${fracao} * var(--e))` }}>
        <CincoEstrelas />
      </span>
    </span>
  );
}

function IconeInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

/**
 * Nota do Google (com link para as avaliações) e o Instagram, lado a lado, em tons neutros e dourado suave nas estrelas.
 * No celular o texto da nota encurta ("4,8 · 26 avaliações") para caber tudo numa linha só.
 */
export function ProvaSocial() {
  const link = (
    <a href={GOOGLE.url} target="_blank" rel="noopener noreferrer" data-rastro="avaliacoes">
      {GOOGLE.total} avaliações
    </a>
  );
  return (
    <div className="prova">
      <p className="avaliacao">
        <Estrelas />
        <span className="so-largo">Nota {GOOGLE.notaTexto} em {link} no Google</span>
        <span className="so-estreito">{GOOGLE.notaTexto} · {link}</span>
      </p>
      <a className="insta" href={SITE.instagramUrl} target="_blank" rel="noopener noreferrer" data-rastro="instagram" aria-label={`Instagram @${SITE.instagram}`}>
        <IconeInstagram />
        <span>@{SITE.instagram}</span>
      </a>
    </div>
  );
}
