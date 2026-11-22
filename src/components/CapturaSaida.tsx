"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BLACK_FRIDAY, blackFridayAtiva } from "@/lib/config";
import { enviarContato, formatarTelefone, telefoneValido } from "@/lib/contato";
import type { GatilhoSaida } from "@/lib/contato";
import { evento } from "@/lib/tracking";
import { useCart } from "./CartProvider";

/**
 * Aviso de saída: "Deixe seu contato para receber promoções exclusivas". Aparece UMA vez por visita, quando a pessoa dá sinal
 * de que vai embora, e guarda o WhatsApp (com consentimento) no mini CRM pela função catalogo-contato.
 *
 * O que conta como "vai embora" (não existe evento de "saindo do site" que funcione em todo aparelho):
 *  - computador: o mouse sai pela borda de cima da janela (rumo à barra de endereço, às abas ou ao X);
 *  - celular: a pessoa para de mexer na tela por um tempo, ou volta ao site depois de ter ido para outro app (o caso de quem
 *    abriu o catálogo pelo Instagram, saiu e voltou). Ao fechar o navegador do Instagram não dá tempo de mostrar nada.
 * Em todos os casos só depois de a pessoa ter ficado alguns segundos no site (visitas relâmpago não são interrompidas).
 *
 * Nunca abre: nas telas de compra, enquanto a roleta está na tela, com a pessoa digitando em algum campo, para quem já deixou o
 * contato, nem por 7 dias para quem fechou. Quem fecha ou envia não é incomodado de novo. A marca fica só no aparelho.
 */

const CHAVE = "aq_lead_v1"; // aparelho: { v: "enviado" | "dispensado", t }
const CHAVE_SESSAO = "aq_lead_sessao"; // já abriu nesta visita
const NAO_ABRE_EM = ["/entrega", "/pagamento", "/obrigado", "/privacidade"];
const ESPERA_APOS_FECHAR_MS = 7 * 24 * 60 * 60 * 1000;
/** Tempo mínimo de visita (com a página visível) antes de cada gatilho poder abrir o aviso. */
const MINIMO_NO_SITE_MS: Record<GatilhoSaida, number> = { mouse: 6000, ocioso: 12000, voltou: 8000 };
const OCIOSO_TOQUE_MS = 30000;
const OCIOSO_MOUSE_MS = 60000;
const AUSENTE_MINIMO_MS = 3000; // quanto tempo longe do site conta como "foi para outro app"

type Fase = "form" | "ok";

function lerMarca(): { v: "enviado" | "dispensado"; t: number } | null {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as { v?: string; t?: number } | null;
    if ((m?.v === "enviado" || m?.v === "dispensado") && typeof m.t === "number") return { v: m.v, t: m.t };
  } catch {
    /* sem armazenamento */
  }
  return null;
}

function gravarMarca(v: "enviado" | "dispensado") {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ v, t: Date.now() }));
  } catch {
    /* sem armazenamento: vale só nesta visita (o ref abaixo) */
  }
}

/** Já deixou o contato, fechou há pouco ou já abriu nesta visita? */
function bloqueado(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return true;
  } catch {
    /* sem armazenamento */
  }
  const m = lerMarca();
  if (!m) return false;
  return m.v === "enviado" || Date.now() - m.t < ESPERA_APOS_FECHAR_MS;
}

export function CapturaSaida() {
  const path = usePathname();
  const { itens } = useCart();
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<Fase>("form");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [website, setWebsite] = useState(""); // isca antirrobô
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const jaAbriu = useRef(false); // vale mesmo se o navegador não deixar gravar nada
  const gatilho = useRef<GatilhoSaida>("mouse");
  const abertoEm = useRef(0);
  const qtdItens = useRef(0);
  const caixaRef = useRef<HTMLDivElement>(null);
  const telRef = useRef<HTMLInputElement>(null);
  qtdItens.current = itens.length;

  // Os gatilhos. Um efeito só, montado uma vez: ouvintes passivos e leves, e nada roda se o aviso já não pode abrir.
  useEffect(() => {
    if (jaAbriu.current || bloqueado()) return;
    const toque = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
    let acumulado = 0; // ms com a página visível
    let desde: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let escondidoEm: number | null = null;
    let timerOcioso: ReturnType<typeof setTimeout> | undefined;
    let timerVoltou: ReturnType<typeof setTimeout> | undefined;
    let ultimoReinicio = 0;
    const tempoNoSite = () => acumulado + (desde !== null ? performance.now() - desde : 0);

    /** true = não precisa mais tentar (abriu ou ficou bloqueado de vez); false = ainda não era a hora. */
    const tentar = (g: GatilhoSaida): boolean => {
      if (jaAbriu.current || bloqueado()) return true;
      if (tempoNoSite() < MINIMO_NO_SITE_MS[g]) return false;
      if (NAO_ABRE_EM.some((p) => window.location.pathname.startsWith(p))) return false;
      if (document.visibilityState !== "visible") return false;
      if (document.documentElement.hasAttribute("data-roleta")) return false; // a roleta tem a vez dela
      const ativo = document.activeElement;
      if (ativo instanceof HTMLInputElement || ativo instanceof HTMLTextAreaElement || ativo instanceof HTMLSelectElement) return false;
      jaAbriu.current = true;
      gatilho.current = g;
      abertoEm.current = performance.now();
      try {
        sessionStorage.setItem(CHAVE_SESSAO, "1");
      } catch {
        /* o ref já impede de abrir de novo nesta visita */
      }
      setFase("form");
      setErro("");
      setAberto(true);
      evento("contato_saida", undefined, { dados: { acao: "aberto", gatilho: g } });
      return true;
    };

    const armarOcioso = () => {
      clearTimeout(timerOcioso);
      timerOcioso = setTimeout(() => {
        if (!tentar("ocioso")) armarOcioso(); // ainda não era a hora: espera mais um ciclo
      }, toque ? OCIOSO_TOQUE_MS : OCIOSO_MOUSE_MS);
    };
    // Qualquer movimento da pessoa recomeça a contagem (no máximo uma vez por segundo, para não pesar com o mouse).
    const mexeu = () => {
      const agora = Date.now();
      if (agora - ultimoReinicio < 1000) return;
      ultimoReinicio = agora;
      armarOcioso();
    };

    // Computador: o mouse saiu pela borda de cima da janela.
    const aoSairDeCima = (e: MouseEvent) => {
      if (e.relatedTarget === null && e.clientY <= 0) tentar("mouse");
    };

    // Celular: voltou para o site depois de ter ido para outro app (ou outra aba).
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") {
        if (desde !== null) acumulado += performance.now() - desde;
        desde = null;
        escondidoEm = Date.now();
        clearTimeout(timerVoltou);
      } else {
        if (desde === null) desde = performance.now();
        const ficouFora = escondidoEm !== null ? Date.now() - escondidoEm : 0;
        escondidoEm = null;
        armarOcioso();
        if (toque && ficouFora >= AUSENTE_MINIMO_MS) {
          clearTimeout(timerVoltou);
          timerVoltou = setTimeout(() => tentar("voltou"), 700); // dá um instante para a página reaparecer
        }
      }
    };

    const eventosMexer: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
    for (const e of eventosMexer) window.addEventListener(e, mexeu, { passive: true });
    if (!toque) document.documentElement.addEventListener("mouseout", aoSairDeCima);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    armarOcioso();

    return () => {
      clearTimeout(timerOcioso);
      clearTimeout(timerVoltou);
      for (const e of eventosMexer) window.removeEventListener(e, mexeu);
      document.documentElement.removeEventListener("mouseout", aoSairDeCima);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, []);

  // Trocou de página com o aviso aberto (ex.: tocou em "Privacidade"): fecha sem contar como recusa.
  useEffect(() => {
    setAberto(false);
  }, [path]);

  const fechar = useCallback(() => {
    if (fase === "form") {
      gravarMarca("dispensado");
      evento("contato_saida", undefined, { dados: { acao: "dispensou", gatilho: gatilho.current } });
    }
    setAberto(false);
  }, [fase]);

  // Enquanto aberto: trava a rolagem, Esc fecha e Tab fica dentro da janela.
  useEffect(() => {
    if (!aberto) return;
    const corpo = document.body;
    const overflowAntes = corpo.style.overflow;
    corpo.style.overflow = "hidden";
    caixaRef.current?.focus({ preventScroll: true }); // foco na janela, não num campo: no celular o teclado não salta sozinho
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
      } else if (e.key === "Tab") {
        const foco = Array.from(caixaRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([tabindex='-1']), a[href]") ?? []);
        if (foco.length === 0) return;
        const primeiro = foco[0];
        const ultimo = foco[foco.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || ativo === caixaRef.current)) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && ativo === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    }
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      corpo.style.overflow = overflowAntes;
    };
  }, [aberto, fechar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!telefoneValido(tel)) {
      setErro("Informe um WhatsApp válido, com DDD.");
      telRef.current?.focus();
      return;
    }
    setEnviando(true);
    setErro("");
    const r = await enviarContato({
      nome,
      telefone: tel,
      website,
      ms: Math.round(performance.now() - abertoEm.current),
      gatilho: gatilho.current,
      path: window.location.pathname,
      carrinho: qtdItens.current,
    });
    setEnviando(false);
    if (r.ok) {
      gravarMarca("enviado");
      setFase("ok");
      evento("contato_saida", undefined, { dados: { acao: "enviou", gatilho: gatilho.current } }); // sem nome nem telefone: só que enviou
    } else {
      setErro(r.mensagem);
      evento("contato_saida", undefined, { dados: { acao: "erro", gatilho: gatilho.current } });
    }
  }

  if (!aberto) return null;

  const temPedido = itens.length > 0;
  const campanha = blackFridayAtiva();

  return (
    <div
      className="saida-fundo"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="saida"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saida-titulo"
        tabIndex={-1}
        ref={caixaRef}
        data-clarity-mask="true"
      >
        <button type="button" className="roleta-x" aria-label="Fechar" onClick={fechar}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {fase === "ok" ? (
          <div role="status">
            <p className="eyebrow">Tudo certo</p>
            <h2 id="saida-titulo">Contato guardado</h2>
            <p className="sub">
              Você vai receber as ofertas e os peixes novos pelo WhatsApp. Para parar de receber, é só avisar na própria conversa.
              {campanha ? ` O cupom ${BLACK_FRIDAY.cupom} continua valendo até ${BLACK_FRIDAY.fimTexto}.` : ""}
            </p>
            <button type="button" className="btn btn-claro btn-bloco" onClick={() => setAberto(false)}>
              Continuar vendo os peixes
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            <div className="honey" aria-hidden="true">
              <label>
                Não preencha este campo
                <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            <p className="eyebrow">Antes de ir</p>
            <h2 id="saida-titulo">{temPedido ? "Guardamos o seu pedido" : "Receba promoções exclusivas"}</h2>
            <p className="sub">
              {temPedido
                ? "Deixe seu WhatsApp para a gente te avisar das ofertas e dos peixes novos. Poucas mensagens, só o que vale a pena."
                : "Deixe seu WhatsApp e receba ofertas e peixes novos antes de todo mundo. Poucas mensagens, só o que vale a pena."}
            </p>

            <div className="campo">
              <label htmlFor="saida-nome">
                Seu nome <span className="opcional">(opcional)</span>
              </label>
              <input id="saida-nome" name="nome" type="text" autoComplete="given-name" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="saida-tel">Seu WhatsApp</label>
              <input
                id="saida-tel"
                name="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(17) 90000-0000"
                maxLength={16}
                value={tel}
                ref={telRef}
                onChange={(e) => {
                  setTel(formatarTelefone(e.target.value));
                  if (erro) setErro("");
                }}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? "saida-erro" : undefined}
              />
            </div>

            {erro ? (
              <p id="saida-erro" className="erro-form" role="alert">
                {erro}
              </p>
            ) : null}

            <button type="submit" className="btn btn-claro btn-bloco" disabled={enviando}>
              {enviando ? "Enviando..." : "Quero receber promoções"}
            </button>
            <p className="saida-legal">
              Ao tocar em &quot;Quero receber promoções&quot;, você autoriza a Aquacarpas a falar com você pelo WhatsApp sobre ofertas e
              novidades. Para sair, é só pedir. <Link href="/privacidade">Privacidade</Link>
            </p>
            <button type="button" className="saida-nao" onClick={fechar}>
              Agora não
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
