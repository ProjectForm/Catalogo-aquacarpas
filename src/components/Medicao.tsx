"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PIXELS } from "@/lib/config";
import { carregarTerceiros, gravarEscolha, lerEscolha, podeCarregar, terceirosConfigurados } from "@/lib/pixels";
import { capturarUtm, utmAtual } from "@/lib/tracking";

/**
 * Pixel da Meta e Microsoft Clarity. Sem ID em config.ts (PIXELS) não faz nada e nenhuma faixa aparece. Com ID, só carrega
 * depois do "Aceitar" da faixa de cookies (LGPD: cookies de marketing/medição de terceiros pedem consentimento). Quem já
 * escolheu não vê a faixa de novo; a página /privacidade tem o botão para mudar de ideia.
 */
export function Medicao() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!terceirosConfigurados()) return;
    const utm = capturarUtm();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (podeCarregar()) carregarTerceiros(utm);
    else if (PIXELS.consentimentoObrigatorio && lerEscolha() === null) timer = setTimeout(() => setAberto(true), 1400);
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

/** Botão da página /privacidade para reabrir a faixa e mudar a escolha. */
export function AbrirCookies() {
  return (
    <button type="button" className="btn btn-contorno" onClick={() => window.dispatchEvent(new Event("aq:cookies"))}>
      Alterar minha escolha de cookies
    </button>
  );
}
