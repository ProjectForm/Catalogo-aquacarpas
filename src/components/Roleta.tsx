"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BLACK_FRIDAY } from "@/lib/config";
import { evento } from "@/lib/tracking";
import { useCart } from "./CartProvider";

/**
 * Roleta de desconto da Black Friday, aberta quando a pessoa entra no catálogo (uma vez por aparelho, até ganhar).
 * O resultado é sempre um destes dois, sorteado: "ganhou" o cupom da campanha (BLACK30) ou "tente de novo".
 * Depois de dois "tente de novo" seguidos o próximo giro é o prêmio, para ninguém ficar girando sem fim. As fatias de 15%,
 * 5% e "não ganhou nada" são só o desenho da roleta: nunca saem. O desconto de verdade continua sendo decidido pelo
 * servidor (função catalogo-api, cupom BLACK30); aqui só se guarda o código no carrinho.
 */

type Fase = "pronta" | "girando" | "tente" | "ganhou";

const CHAVE_GANHOU = "aq_roleta_v1"; // aparelho: ganhou, não abre mais
const CHAVE_FECHADA = "aq_roleta_fechada"; // aba: fechou sem ganhar, não abre de novo nesta visita
const NAO_ABRE_EM = ["/entrega", "/pagamento", "/obrigado", "/privacidade"];
const ATRASO_ABRIR_MS = 1100;
const MAX_TENTES_SEGUIDOS = 2;

interface Fatia {
  rotulo: string;
  sub: string;
  /** premio30 = vencedora; premio = enfeite; tente = "tente de novo"; nada = enfeite. */
  tipo: "premio30" | "premio" | "tente" | "nada";
}

// Sentido horário, a partir do topo. As fatias vencedoras (0 e 4) e as de "tente de novo" (1 e 5) são as únicas que saem.
const FATIAS: Fatia[] = [
  { rotulo: "30%", sub: "OFF", tipo: "premio30" },
  { rotulo: "Tente", sub: "de novo", tipo: "tente" },
  { rotulo: "15%", sub: "OFF", tipo: "premio" },
  { rotulo: "Não ganhou", sub: "nada", tipo: "nada" },
  { rotulo: "30%", sub: "OFF", tipo: "premio30" },
  { rotulo: "Tente", sub: "de novo", tipo: "tente" },
  { rotulo: "5%", sub: "OFF", tipo: "premio" },
  { rotulo: "Não ganhou", sub: "nada", tipo: "nada" },
];
const GRAUS = 360 / FATIAS.length;
const CENTRO = 150;
const RAIO = 140;

function pol(grau: number, r: number): [number, number] {
  const a = ((grau - 90) * Math.PI) / 180; // 0° = topo, sentido horário
  return [CENTRO + r * Math.cos(a), CENTRO + r * Math.sin(a)];
}

function caminhoFatia(i: number): string {
  const [x1, y1] = pol(i * GRAUS, RAIO);
  const [x2, y2] = pol((i + 1) * GRAUS, RAIO);
  return `M${CENTRO} ${CENTRO} L${x1.toFixed(2)} ${y1.toFixed(2)} A${RAIO} ${RAIO} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

function lerGanhou(): boolean {
  try {
    return localStorage.getItem(CHAVE_GANHOU) !== null;
  } catch {
    return false;
  }
}
function lerFechada(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_FECHADA) !== null;
  } catch {
    return false;
  }
}
function gravar(armazem: "local" | "sessao", chave: string, valor: string) {
  try {
    (armazem === "local" ? localStorage : sessionStorage).setItem(chave, valor);
  } catch {
    /* sem storage: a roleta pode voltar na próxima visita, sem prejuízo */
  }
}

function reduzMovimento(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Roleta() {
  const path = usePathname();
  const { bf, pronto, guardarCupom } = useCart();
  const [aberta, setAberta] = useState(false);
  const [fase, setFase] = useState<Fase>("pronta");
  const [rotacao, setRotacao] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const giros = useRef(0);
  const tentesSeguidos = useRef(0);
  const timerGiro = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Abre uma vez, um instante depois da página aparecer (nunca nas telas de compra).
  useEffect(() => {
    if (!pronto || !bf || aberta) return;
    if (NAO_ABRE_EM.some((p) => path.startsWith(p))) return;
    if (lerGanhou() || lerFechada()) return;
    const t = setTimeout(() => {
      if (NAO_ABRE_EM.some((p) => window.location.pathname.startsWith(p))) return;
      setFase("pronta");
      setAberta(true);
      evento("roleta", undefined, { dados: { acao: "aberta" } });
    }, ATRASO_ABRIR_MS);
    return () => clearTimeout(t);
  }, [pronto, bf, path, aberta]);

  const fechar = useCallback(
    (motivo: "x" | "escolher") => {
      if (motivo === "escolher") {
        evento("roleta", undefined, { dados: { acao: "escolher" } });
      } else {
        const ganhou = lerGanhou();
        evento("roleta", undefined, { dados: { acao: "fechou", resultado: ganhou ? "ganhou" : giros.current > 0 ? "tente" : "sem_girar" } });
        if (!ganhou) gravar("sessao", CHAVE_FECHADA, "1");
      }
      setAberta(false);
      if (motivo === "escolher" && window.location.pathname === "/") {
        document.getElementById("catalogo")?.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "start" });
      }
    },
    [],
  );

  // Enquanto aberta: trava a rolagem, esconde a faixa de cookies (aparece depois), Esc fecha e Tab fica dentro da janela.
  useEffect(() => {
    if (!aberta) return;
    const html = document.documentElement;
    const corpo = document.body;
    const overflowAntes = corpo.style.overflow;
    corpo.style.overflow = "hidden";
    html.setAttribute("data-roleta", "aberta");
    botaoRef.current?.focus({ preventScroll: true });
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar("x");
      } else if (e.key === "Tab") {
        const foco = Array.from(caixaRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
        if (foco.length === 0) return;
        const primeiro = foco[0];
        const ultimo = foco[foco.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || !caixaRef.current?.contains(ativo))) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && (ativo === ultimo || !caixaRef.current?.contains(ativo))) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    }
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      corpo.style.overflow = overflowAntes;
      html.removeAttribute("data-roleta");
    };
  }, [aberta, fechar]);

  useEffect(() => () => clearTimeout(timerGiro.current), []);

  function girar() {
    if (fase === "girando" || fase === "ganhou") return;
    const ganha = tentesSeguidos.current >= MAX_TENTES_SEGUIDOS || Math.random() < 0.5;
    const opcoes = ganha ? [0, 4] : [1, 5];
    const fatia = opcoes[Math.random() < 0.5 ? 0 : 1];
    const folga = (Math.random() - 0.5) * (GRAUS * 0.6); // não para colado na linha entre duas fatias
    const alvo = -(fatia * GRAUS + GRAUS / 2) + folga;
    const resto = (((alvo - rotacao) % 360) + 360) % 360;
    const rapido = reduzMovimento();
    const voltas = rapido ? 1 : 5 + Math.floor(Math.random() * 2);
    const ms = rapido ? 700 : 4800;
    giros.current += 1;
    setDuracao(ms);
    setRotacao(rotacao + voltas * 360 + resto);
    setFase("girando");
    clearTimeout(timerGiro.current);
    timerGiro.current = setTimeout(() => {
      if (ganha) {
        tentesSeguidos.current = 0;
        gravar("local", CHAVE_GANHOU, JSON.stringify({ cupom: BLACK_FRIDAY.cupom, t: Date.now() }));
        guardarCupom(BLACK_FRIDAY.cupom);
        setFase("ganhou");
      } else {
        tentesSeguidos.current += 1;
        setFase("tente");
      }
      try {
        navigator.vibrate?.(ganha ? [30, 40, 30] : 25);
      } catch {
        /* sem vibração */
      }
      evento("roleta", undefined, { dados: { acao: "giro", resultado: ganha ? "ganhou" : "tente", valor: giros.current } });
    }, ms + 120);
  }

  if (!aberta) return null;

  const ganhou = fase === "ganhou";
  const girando = fase === "girando";
  const titulo = ganhou ? `Você ganhou ${BLACK_FRIDAY.percentual}% de desconto` : fase === "tente" ? "Quase! Gire de novo" : "Gire e descubra o seu desconto";
  const mensagem = ganhou
    ? `O cupom ${BLACK_FRIDAY.cupom} já está guardado e entra sozinho no pedido. Vale até ${BLACK_FRIDAY.fimTexto}.`
    : girando
      ? "Girando..."
      : fase === "tente"
        ? "Não foi dessa vez, mas você pode girar quantas vezes precisar."
        : "Toque em girar para ver o desconto da Black Friday.";

  return (
    <div className="roleta-fundo">
      <div className="roleta" role="dialog" aria-modal="true" aria-labelledby="roleta-titulo" ref={caixaRef}>
        <button type="button" className="roleta-x" aria-label="Fechar" onClick={() => fechar(ganhou ? "escolher" : "x")}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="eyebrow">Black Friday</p>
        <h2 id="roleta-titulo" aria-live="polite">{titulo}</h2>

        <div className="roleta-palco">
          <svg className="roleta-ponteiro" viewBox="0 0 40 46" aria-hidden="true">
            <path d="M20 44 L6 14 A15 15 0 1 1 34 14 Z" fill="#e85a2c" stroke="#0e0e0e" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx="20" cy="14" r="4.6" fill="#0e0e0e" />
          </svg>
          <div className="roleta-disco" style={{ transform: `rotate(${rotacao}deg)`, transitionDuration: `${duracao}ms` }}>
            <svg viewBox="0 0 300 300" aria-hidden="true">
              <circle cx={CENTRO} cy={CENTRO} r="148" fill="#1d1d1d" stroke="#dcc088" strokeWidth="2" />
              {FATIAS.map((f, i) => (
                <path key={i} d={caminhoFatia(i)} className={`rf rf-${f.tipo}`} />
              ))}
              {FATIAS.map((f, i) => {
                const meio = i * GRAUS + GRAUS / 2;
                return (
                  <g key={`t${i}`} transform={`rotate(${meio - 90} ${CENTRO} ${CENTRO})`} className={`rt rt-${f.tipo}`}>
                    <text x={CENTRO + 124} y={CENTRO - (f.tipo === "premio30" || f.tipo === "premio" ? 3 : 4)} textAnchor="end" className="rt-a">
                      {f.rotulo}
                    </text>
                    <text x={CENTRO + 124} y={CENTRO + (f.tipo === "premio30" || f.tipo === "premio" ? 15 : 12)} textAnchor="end" className="rt-b">
                      {f.sub}
                    </text>
                  </g>
                );
              })}
              {Array.from({ length: 24 }, (_, i) => {
                const [x, y] = pol((i * 360) / 24, 143.5);
                return <circle key={i} cx={x} cy={y} r="1.9" fill="#dcc088" opacity={i % 2 ? 0.45 : 0.95} />;
              })}
            </svg>
          </div>
          <span className="roleta-miolo" aria-hidden="true" />
        </div>

        <p className="roleta-msg" role="status">{mensagem}</p>

        {ganhou ? (
          <button type="button" className="btn btn-claro btn-bloco" ref={botaoRef} onClick={() => fechar("escolher")}>
            Escolher meu peixe
          </button>
        ) : (
          <button type="button" className="btn btn-claro btn-bloco" ref={botaoRef} onClick={girar} disabled={girando}>
            {girando ? "Girando..." : fase === "tente" ? "Girar de novo" : "Girar"}
          </button>
        )}
      </div>
    </div>
  );
}
