"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BLACK_FRIDAY } from "@/lib/config";
import { evento } from "@/lib/tracking";
import { useCart } from "./CartProvider";

/**
 * Roleta de desconto da Black Friday, aberta quando a pessoa entra no catálogo. Abre UMA vez por aparelho: no instante em
 * que abre já fica gravada uma marca no aparelho (armazenamento do navegador + um cookie próprio), então recarregar a
 * página, fechar ou abrir outra aba não a traz de volta.
 *
 * O resultado de cada giro é sorteado entre dois: o cupom da campanha (BLACK30, a única fatia de 30%) ou "+1 giro grátis".
 * Depois de dois "+1 giro grátis" seguidos o próximo giro é o prêmio, para ninguém ficar girando sem fim. As fatias de
 * 15% e 5% são só o desenho da roleta: nunca saem. O resultado é decidido e gravado no clique, antes da animação, para não
 * se perder se a pessoa recarregar no meio do giro. O desconto de verdade continua sendo decidido pelo servidor (função
 * catalogo-api, cupom BLACK30); aqui só se guarda o código no carrinho.
 */

type Fase = "pronta" | "girando" | "gratis" | "ganhou";
type Situacao = "sem_girar" | "gratis" | "ganhou";

/** Marca gravada no aparelho. Só um número aleatório, datas e o resultado: nada que identifique a pessoa. */
interface Marca {
  id: string;
  t: number;
  giros: number;
  resultado: "aberta" | Exclude<Situacao, "sem_girar">;
  cupom?: string;
}

const CHAVE = "aq_roleta_v2"; // aparelho (armazenamento do navegador): a roleta já foi mostrada
const CHAVE_V1 = "aq_roleta_v1"; // versão anterior: quem já tinha ganhado continua sem ver de novo
const COOKIE = "aq_roleta"; // mesma marca em cookie próprio (primeiro sinal que sobra se o armazenamento for limpo)
const UM_ANO_S = 60 * 60 * 24 * 365;
const NAO_ABRE_EM = ["/entrega", "/pagamento", "/obrigado", "/privacidade"];
const ATRASO_ABRIR_MS = 1100;
const MAX_GRATIS_SEGUIDOS = 2;

interface Fatia {
  /** premio30 = a vencedora; premio = enfeite (15% e 5%); gratis = "+1 giro grátis". */
  tipo: "premio30" | "premio" | "gratis";
  /** Número grande (só para os prêmios). */
  num?: string;
  /** Tamanho do número, em unidades do desenho. */
  tam: number;
}

// Sentido horário, a partir do topo. O prêmio (0) e os "+1 giro grátis" (1, 3 e 5) são as únicas fatias que saem.
const FATIAS: Fatia[] = [
  { tipo: "premio30", num: String(BLACK_FRIDAY.percentual), tam: 23 },
  { tipo: "gratis", tam: 26 },
  { tipo: "premio", num: "15", tam: 31 },
  { tipo: "gratis", tam: 26 },
  { tipo: "premio", num: "5", tam: 36 },
  { tipo: "gratis", tam: 26 },
];
const FATIA_PREMIO = 0;
const FATIAS_GRATIS = [1, 3, 5];
const GRAUS = 360 / FATIAS.length;
const CENTRO = 150;
const RAIO = 140;
const TEXTO_X = CENTRO + 90; // o texto fica centralizado nesta distância do miolo
const LINHA_B = 11; // espaço da segunda linha (OFF / GRÁTIS)

function pol(grau: number, r: number): [number, number] {
  const a = ((grau - 90) * Math.PI) / 180; // 0° = topo, sentido horário
  return [CENTRO + r * Math.cos(a), CENTRO + r * Math.sin(a)];
}

function caminhoFatia(i: number): string {
  const [x1, y1] = pol(i * GRAUS, RAIO);
  const [x2, y2] = pol((i + 1) * GRAUS, RAIO);
  return `M${CENTRO} ${CENTRO} L${x1.toFixed(2)} ${y1.toFixed(2)} A${RAIO} ${RAIO} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/** Já foi mostrada neste aparelho? Olha o armazenamento (novo e antigo) e o cookie. */
function jaMostrada(): boolean {
  try {
    if (localStorage.getItem(CHAVE) !== null || localStorage.getItem(CHAVE_V1) !== null) return true;
  } catch {
    /* sem armazenamento: cai no cookie */
  }
  try {
    return document.cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE}=`));
  } catch {
    return false;
  }
}

function gravarMarca(m: Marca) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(m));
  } catch {
    /* sem armazenamento: o cookie abaixo ainda segura */
  }
  try {
    const seguro = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=${m.id}; max-age=${UM_ANO_S}; path=/; SameSite=Lax${seguro}`;
  } catch {
    /* sem cookie: a roleta pode voltar na próxima visita, sem prejuízo */
  }
}

function novoId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* sem crypto.randomUUID */
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
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
  const jaAbriu = useRef(false); // vale mesmo se o navegador não deixar gravar nada: não reabre ao trocar de página
  const marca = useRef<Marca | null>(null);
  const situacao = useRef<Situacao>("sem_girar");
  const giros = useRef(0);
  const gratisSeguidos = useRef(0);
  const timerGiro = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const premioRef = useRef<HTMLDivElement>(null);
  const premioBotaoRef = useRef<HTMLButtonElement>(null);

  // Abre uma única vez, um instante depois da página aparecer (nunca nas telas de compra). A marca é gravada ao abrir.
  useEffect(() => {
    if (!pronto || !bf || aberta || jaAbriu.current) return;
    if (NAO_ABRE_EM.some((p) => path.startsWith(p))) return;
    if (jaMostrada()) return;
    const t = setTimeout(() => {
      if (jaAbriu.current || NAO_ABRE_EM.some((p) => window.location.pathname.startsWith(p))) return;
      if (jaMostrada()) return; // outra aba pode ter aberto nesse meio-tempo
      jaAbriu.current = true;
      marca.current = { id: novoId(), t: Date.now(), giros: 0, resultado: "aberta" };
      gravarMarca(marca.current);
      setFase("pronta");
      setAberta(true);
      evento("roleta", undefined, { dados: { acao: "aberta" } });
    }, ATRASO_ABRIR_MS);
    return () => clearTimeout(t);
  }, [pronto, bf, path, aberta]);

  const fechar = useCallback((motivo: "x" | "escolher") => {
    if (motivo === "escolher") {
      evento("roleta", undefined, { dados: { acao: "escolher" } });
    } else {
      evento("roleta", undefined, { dados: { acao: "fechou", resultado: situacao.current } });
    }
    setAberta(false);
    if (motivo === "escolher" && window.location.pathname === "/") {
      document.getElementById("catalogo")?.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "start" });
    }
  }, []);

  // Enquanto aberta: trava a rolagem, esconde a faixa de cookies (aparece depois), Esc fecha e Tab fica dentro da janela
  // que estiver na frente (a roleta ou, depois de ganhar, o pop do prêmio).
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
        const janela = premioRef.current ?? caixaRef.current;
        const foco = Array.from(janela?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
        if (foco.length === 0) return;
        const primeiro = foco[0];
        const ultimo = foco[foco.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || !janela?.contains(ativo))) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && (ativo === ultimo || !janela?.contains(ativo))) {
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

  // O foco acompanha a tela: botão do pop do prêmio ao ganhar, botão de girar de novo quando sobra um giro grátis.
  useEffect(() => {
    if (fase === "ganhou") premioBotaoRef.current?.focus({ preventScroll: true });
    else if (fase === "gratis") botaoRef.current?.focus({ preventScroll: true });
  }, [fase]);

  useEffect(() => () => clearTimeout(timerGiro.current), []);

  function girar() {
    if (fase === "girando" || fase === "ganhou") return;
    const ganha = gratisSeguidos.current >= MAX_GRATIS_SEGUIDOS || Math.random() < 0.5;
    const fatia = ganha ? FATIA_PREMIO : FATIAS_GRATIS[Math.floor(Math.random() * FATIAS_GRATIS.length)];
    const folga = (Math.random() - 0.5) * (GRAUS * 0.6); // não para colado na linha entre duas fatias
    const alvo = -(fatia * GRAUS + GRAUS / 2) + folga;
    const resto = (((alvo - rotacao) % 360) + 360) % 360;
    const rapido = reduzMovimento();
    const voltas = rapido ? 1 : 5 + Math.floor(Math.random() * 2);
    const ms = rapido ? 700 : 4800;
    giros.current += 1;
    situacao.current = ganha ? "ganhou" : "gratis";
    gratisSeguidos.current = ganha ? 0 : gratisSeguidos.current + 1;
    // O resultado vale a partir do clique: grava a marca e guarda o cupom já, para não se perder se a página for recarregada
    // no meio do giro. A tela só mostra o resultado quando a roleta para.
    if (marca.current) {
      marca.current = { ...marca.current, giros: giros.current, resultado: situacao.current, cupom: ganha ? BLACK_FRIDAY.cupom : undefined };
      gravarMarca(marca.current);
    }
    if (ganha) guardarCupom(BLACK_FRIDAY.cupom);
    setDuracao(ms);
    setRotacao(rotacao + voltas * 360 + resto);
    setFase("girando");
    clearTimeout(timerGiro.current);
    timerGiro.current = setTimeout(() => {
      setFase(ganha ? "ganhou" : "gratis");
      try {
        navigator.vibrate?.(ganha ? [30, 40, 30] : 25);
      } catch {
        /* sem vibração */
      }
      evento("roleta", undefined, { dados: { acao: "giro", resultado: ganha ? "ganhou" : "gratis", valor: giros.current } });
    }, ms + 120);
  }

  if (!aberta) return null;

  const ganhou = fase === "ganhou";
  const girando = fase === "girando";
  const titulo = ganhou
    ? "Parabéns!"
    : girando
      ? "Girando..."
      : fase === "gratis"
        ? "Você ganhou mais um giro" // sem "+1": a serifa do título desenha o 1 como um I
        : "Gire e descubra o seu desconto";
  const mensagem = girando
    ? "Boa sorte!"
    : fase === "gratis"
      ? "Gire de novo, o seu desconto está logo ali."
      : "Toque em girar para ver o desconto da Black Friday.";

  return (
    <div className="roleta-fundo">
      <div
        className={`roleta${ganhou ? " recuada" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="roleta-titulo"
        aria-hidden={ganhou ? true : undefined}
        inert={ganhou}
        ref={caixaRef}
      >
        <button type="button" className="roleta-x" aria-label="Fechar" onClick={() => fechar("x")}>
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
                // Duas linhas centradas na linha do meio da fatia: o número (ou "+1 giro") em cima, OFF / GRÁTIS embaixo.
                const alturaA = f.tam * 0.7;
                const yA = CENTRO - (alturaA + LINHA_B) / 2 + alturaA;
                return (
                  <g key={`t${i}`} transform={`rotate(${meio - 90} ${CENTRO} ${CENTRO})`} className={`rt rt-${f.tipo}`}>
                    <text x={TEXTO_X} y={yA} textAnchor="middle" style={{ fontSize: f.tam }}>
                      {f.tipo === "gratis" ? (
                        <>
                          <tspan className="rt-n">+1</tspan>
                          <tspan className="rt-g"> giro</tspan>
                        </>
                      ) : (
                        <>
                          <tspan className="rt-n">{f.num}</tspan>
                          <tspan className="rt-p">%</tspan>
                        </>
                      )}
                    </text>
                    <text x={TEXTO_X} y={yA + LINHA_B + 2} textAnchor="middle" className="rt-b">
                      {f.tipo === "gratis" ? "GRÁTIS" : "OFF"}
                    </text>
                  </g>
                );
              })}
              {Array.from({ length: 18 }, (_, i) => {
                const [x, y] = pol((i * 360) / 18, 143.5);
                const divisa = i % 3 === 0; // uma bolinha maior em cada divisa entre fatias
                return <circle key={i} cx={x} cy={y} r={divisa ? 2.8 : 1.7} fill="#dcc088" opacity={divisa ? 1 : 0.5} />;
              })}
            </svg>
          </div>
          <span className="roleta-miolo" aria-hidden="true" />
        </div>

        <p className="roleta-msg" role="status">{mensagem}</p>

        <button type="button" className="btn btn-claro btn-bloco" ref={botaoRef} onClick={girar} disabled={girando}>
          {girando ? "Girando..." : fase === "gratis" ? "Usar meu giro grátis" : "Girar"}
        </button>
      </div>

      {ganhou ? (
        <div className="premio" role="dialog" aria-modal="true" aria-labelledby="premio-titulo" ref={premioRef}>
          <button type="button" className="roleta-x" aria-label="Fechar" onClick={() => fechar("escolher")}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <p className="eyebrow">Você ganhou</p>
          <h2 id="premio-titulo" className="premio-valor">
            <b>{BLACK_FRIDAY.percentual}</b>
            <i>%</i>
            <span>de desconto</span>
          </h2>
          <div className="premio-cupom">
            <small>Seu cupom</small>
            <strong>{BLACK_FRIDAY.cupom}</strong>
          </div>
          <p className="premio-msg">
            Já está guardado: ele entra sozinho no seu pedido e o desconto aparece no carrinho. Vale até {BLACK_FRIDAY.fimTexto}.
          </p>
          <button type="button" className="btn btn-claro btn-bloco" ref={premioBotaoRef} onClick={() => fechar("escolher")}>
            Escolher meu peixe
          </button>
        </div>
      ) : null}
    </div>
  );
}
