"use client";

import { useState } from "react";
import { BLACK_FRIDAY } from "@/lib/config";
import { brl } from "@/lib/format";
import { useCart } from "./CartProvider";

/**
 * Bloco do cupom no resumo do pedido (/entrega): aviso da Black Friday + campo do cupom, ou a confirmação em verde
 * quando o servidor já aplicou o desconto. Só aparece durante a campanha e com itens no pedido.
 */
export function CupomCarrinho() {
  const { bf, itens, cupom, cupomCodigo, verificandoCupom, mensagemCupom, aplicarCupom, removerCupom } = useCart();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!bf || itens.length === 0) return null;

  async function aplicar(valor: string) {
    setErro(null);
    const r = await aplicarCupom(valor);
    if (r.ok) setCodigo("");
    else setErro(r.mensagem);
  }

  // Cupom aplicado e confirmado pelo servidor.
  if (cupomCodigo && cupom) {
    return (
      <div className="cupom-ok" role="status">
        <div className="cupom-ok-linha">
          <span className="cupom-ok-titulo">Cupom {cupom.codigo} aplicado</span>
          <button type="button" className="remover" onClick={removerCupom}>remover</button>
        </div>
        <p className="cupom-economia">
          Você economizou <strong>{brl(cupom.desconto)}</strong>
        </p>
      </div>
    );
  }

  // Cupom guardado, mas o desconto está sendo (re)calculado ou deu erro nos itens.
  if (cupomCodigo) {
    return (
      <div className="cupom-ok" role="status" aria-live="polite">
        <div className="cupom-ok-linha">
          <span className="cupom-ok-titulo">Cupom {cupomCodigo}</span>
          <button type="button" className="remover" onClick={removerCupom}>remover</button>
        </div>
        <p className="cupom-economia suave">{verificandoCupom || !mensagemCupom ? "Atualizando o desconto..." : mensagemCupom}</p>
      </div>
    );
  }

  return (
    <div className="cupom-bloco">
      <p className="eyebrow">Black Friday</p>
      <p className="cupom-aviso">
        Até {BLACK_FRIDAY.fimTexto}, use o cupom <strong>{BLACK_FRIDAY.cupom}</strong> e ganhe {BLACK_FRIDAY.percentual}% de desconto em qualquer carpa do site.
      </p>
      {mensagemCupom && !erro ? <p className="cupom-erro" role="alert">{mensagemCupom}</p> : null}
      <form
        className="cupom-form"
        onSubmit={(e) => {
          e.preventDefault();
          void aplicar(codigo);
        }}
      >
        <label htmlFor="cupom" className="sr-only">Código do cupom</label>
        <input
          id="cupom" name="cupom" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={30}
          placeholder="Código do cupom" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        />
        <button type="submit" className="btn btn-contorno" disabled={verificandoCupom || codigo.trim() === ""}>
          {verificandoCupom ? "Conferindo..." : "Aplicar"}
        </button>
      </form>
      <button type="button" className="cupom-usar" onClick={() => void aplicar(BLACK_FRIDAY.cupom)} disabled={verificandoCupom}>
        Usar {BLACK_FRIDAY.cupom}
      </button>
      {erro ? <p className="cupom-erro" role="alert">{erro}</p> : null}
    </div>
  );
}
