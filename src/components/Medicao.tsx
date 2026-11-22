"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apagarCookiesClarity, carregarTerceiros, consentimentoExigido, gravarEscolha, lerEscolha, podeCarregar, prepararMeta, terceirosConfigurados } from "@/lib/pixels";
import { capturarUtm, utmAtual } from "@/lib/tracking";

/**
 * Pixel da Meta e Microsoft Clarity. Sem ID em config.ts (PIXELS) não faz nada e nenhuma faixa aparece.
 *  - Com o Pixel da Meta LIGADO: ele fica instalado mas travado (modo de consentimento da Meta: sem cookie e sem evento) e só
 *    destrava, junto com o Clarity, depois do "Aceitar" da faixa de cookies (LGPD). Quem recusa não carrega nada.
 *  - Com o Pixel DESLIGADO (hoje): não há faixa; o Clarity carrega para todos, menos para quem recusou em /privacidade
 *    (`PreferenciaMedicao`). Decisão do Juan em 2026-11-22.
 */
export function Medicao() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!terceirosConfigurados()) return;
    const utm = capturarUtm();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (podeCarregar()) carregarTerceiros(utm);
    else {
      // Pixel da Meta instalado e travado (sem cookie e sem evento) até o "Aceitar": é o que o torna detectável pela Meta.
      prepararMeta();
      if (consentimentoExigido() && lerEscolha() === null) timer = setTimeout(() => setAberto(true), 1400);
    }
    const reabrir = () => setAberto(true);
    window.addEventListener("aq:cookies", reabrir);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("aq:cookies", reabrir);
    };
  }, []);

  if (!aberto) return null;

  function aceitar() {
    gravarEscolha("sim");
    carregarTerceiros(utmAtual());
    setAberto(false);
  }
  function recusar() {
    const tinhaAceitado = lerEscolha() === "sim";
    gravarEscolha("nao");
    setAberto(false);
    if (tinhaAceitado) window.location.reload(); // derruba os scripts que já tinham carregado nesta visita
  }

  return (
    <div className="cookies" role="dialog" aria-label="Cookies e medição" aria-live="polite">
      <p>
        Usamos cookies para entender como o catálogo é usado e medir os nossos anúncios. Você pode recusar sem perder nada.{" "}
        <Link href="/privacidade">Saiba mais</Link>
      </p>
      <div className="cookies-botoes">
        <button type="button" className="btn btn-contorno" onClick={recusar}>Recusar</button>
        <button type="button" className="btn btn-claro" onClick={aceitar}>Aceitar</button>
      </div>
    </div>
  );
}

/** Botão da página /privacidade para reabrir a faixa e mudar a escolha (só existe com o Pixel da Meta ligado). */
export function AbrirCookies() {
  return (
    <button type="button" className="btn btn-contorno" onClick={() => window.dispatchEvent(new Event("aq:cookies"))}>
      Alterar minha escolha de cookies
    </button>
  );
}

/** Botão da página /privacidade (sem faixa de cookies): recusar ou voltar a permitir a medição do Clarity neste aparelho. */
export function PreferenciaMedicao() {
  const [recusou, setRecusou] = useState(false);
  useEffect(() => setRecusou(lerEscolha() === "nao"), []);
  function alternar() {
    if (recusou) {
      gravarEscolha("sim");
      setRecusou(false);
      return;
    }
    gravarEscolha("nao");
    apagarCookiesClarity();
    setRecusou(true);
    window.location.reload(); // derruba o Clarity que já carregou nesta visita
  }
  return (
    <>
      <p role="status">{recusou ? "A medição está desligada neste aparelho." : "A medição está ligada."}</p>
      <button type="button" className="btn btn-contorno" onClick={alternar}>
        {recusou ? "Permitir a medição de novo" : "Não quero ser medido (desligar o Clarity)"}
      </button>
    </>
  );
}
