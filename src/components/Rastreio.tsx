"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { evento } from "@/lib/tracking";

/** Telas com dados pessoais: o Clarity mascara todo o texto delas (e os campos já são mascarados sempre). */
const SENSIVEIS = ["/entrega", "/pagamento", "/obrigado"];
const MARCOS = [25, 50, 75, 100];

/**
 * Rastreio de comportamento (próprio, anônimo, sem cookie): quanto a pessoa rolou, quanto tempo ficou, quais abas viu, no que
 * clicou e em que campo do cadastro parou. Tudo vira linhas em `eventos_site` (ver tracking.ts); nunca o que foi digitado.
 * Um listener passivo de rolagem, um de clique e um de foco, no documento inteiro: não pesa na página.
 */
export function Rastreio() {
  const path = usePathname();

  useEffect(() => {
    const atual = path;
    const sensivel = SENSIVEIS.some((p) => atual.startsWith(p));
    const main = document.querySelector("main");
    if (sensivel) main?.setAttribute("data-clarity-mask", "true");
    else main?.removeAttribute("data-clarity-mask");

    let acumulado = 0; // ms com a página visível
    let desde: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let maximo = 0; // maior profundidade de rolagem (%)
    const marcosVistos = new Set<number>();
    const secoesVistas = new Set<string>();
    const camposVistos = new Set<string>();
    let ultimoSaiu = -1;
    let quadro = 0;

    const segundos = () => Math.round((acumulado + (desde !== null ? performance.now() - desde : 0)) / 1000);
    const enviarSaida = () => {
      const seg = segundos();
      if (seg === ultimoSaiu) return;
      ultimoSaiu = seg;
      evento("saiu", undefined, { path: atual, dados: { seg, scroll: Math.round(maximo) } });
    };

    const medirScroll = () => {
      quadro = 0;
      const total = document.documentElement.scrollHeight;
      if (total <= 0) return;
      const pct = Math.min(100, ((window.scrollY + window.innerHeight) / total) * 100);
      if (pct > maximo) maximo = pct;
      for (const m of MARCOS) {
        if (maximo >= m - 0.5 && !marcosVistos.has(m)) {
          marcosVistos.add(m);
          evento("scroll", undefined, { path: atual, dados: { pct: m } });
        }
      }
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medirScroll);
    };

    const aoVisibilidade = () => {
      if (document.visibilityState === "hidden") {
        if (desde !== null) acumulado += performance.now() - desde;
        desde = null;
        enviarSaida();
      } else if (desde === null) {
        desde = performance.now();
      }
    };

    const aoClicar = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-rastro], .cartao a, .abas a");
      if (!el) return;
      let alvo = el.dataset.rastro;
      const dados: Record<string, string> = {};
      if (!alvo) {
        if (el.matches(".abas a")) {
          alvo = "aba";
          dados.secao = (el.getAttribute("href") ?? "").replace("#sec-", "").slice(0, 40);
        } else alvo = el.closest("h3") ? "card_titulo" : "card_foto";
      }
      dados.alvo = alvo;
      const codigo = el.closest<HTMLElement>("[data-codigo]")?.dataset.codigo;
      evento("clique", codigo, { path: atual, dados });
    };

    const aoFocar = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      if (!el.closest("[data-rastro-form]")) return;
      const nome = (el.name || el.id || "").slice(0, 20).toLowerCase();
      if (!nome || nome === "website" || camposVistos.has(nome)) return; // "website" é a isca antirrobô
      camposVistos.add(nome);
      evento("campo", undefined, { path: atual, dados: { campo: nome } });
    };

    // Abas da home que apareceram na tela (mostra até onde a lista foi lida).
    let obs: IntersectionObserver | null = null;
    if (atual === "/" && typeof IntersectionObserver !== "undefined") {
      obs = new IntersectionObserver(
        (entradas) => {
          for (const e of entradas) {
            if (!e.isIntersecting) continue;
            const slug = (e.target.id || "").replace("sec-", "");
            if (slug && !secoesVistas.has(slug)) {
              secoesVistas.add(slug);
              evento("secao_vista", undefined, { path: atual, dados: { secao: slug } });
            }
          }
        },
        { threshold: 0.2 },
      );
      document.querySelectorAll(".secao[id^='sec-']").forEach((s) => obs?.observe(s));
    }

    window.addEventListener("scroll", aoRolar, { passive: true });
    document.addEventListener("visibilitychange", aoVisibilidade);
    window.addEventListener("pagehide", enviarSaida);
    document.addEventListener("click", aoClicar, true);
    document.addEventListener("focusin", aoFocar);
    aoRolar(); // páginas curtas já contam como lidas

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", aoRolar);
      document.removeEventListener("visibilitychange", aoVisibilidade);
      window.removeEventListener("pagehide", enviarSaida);
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("focusin", aoFocar);
      obs?.disconnect();
      enviarSaida(); // trocou de página dentro do site
    };
  }, [path]);

  return null;
}
