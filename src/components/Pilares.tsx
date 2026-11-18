import type { ReactNode } from "react";

/** Ícones em traço fino de 1,25 px, herdam a cor do texto (monocromáticos). */
function Icone({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ITENS = [
  {
    titulo: "Entrega em até 3 dias úteis",
    texto: "Transporte com até 72 h de sobrevivência garantida.",
    icone: (
      <Icone>
        <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
        <path d="M3 7.5 12 12l9-4.5M12 12v9" />
      </Icone>
    ),
  },
  {
    titulo: "Pagamento seguro",
    texto: "Pix ou cartão, pela InfinitePay.",
    icone: (
      <Icone>
        <rect x="5" y="10.5" width="14" height="10" rx="2" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </Icone>
    ),
  },
  {
    titulo: "Garantia de envio",
    texto: "Se o peixe não chegar bem, reposição ou reembolso.",
    icone: (
      <Icone>
        <path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6z" />
        <path d="m8.8 12 2.4 2.4 4.2-4.6" />
      </Icone>
    ),
  },
] as const;

/** Três pilares de confiança da primeira tela: entrega, pagamento e garantia. Texto curto, sem cor. */
export function Pilares() {
  return (
    <ul className="pilares" aria-label="Como funciona a compra">
      {ITENS.map((p) => (
        <li key={p.titulo} className="pilar">
          {p.icone}
          <div>
            <strong>{p.titulo}</strong>
            <span>{p.texto}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
