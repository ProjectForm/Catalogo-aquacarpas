import type { Produto } from "@/lib/catalogo";
import { comCupomBlackFriday, kitDe, precoUnitario, promocaoPorQuantidade, temPromocao } from "@/lib/catalogo";
import { BLACK_FRIDAY, blackFridayAtiva } from "@/lib/config";
import { brl } from "@/lib/format";

/** `citarCupom`: na página do kit a linha cita o código ("Preço com cupom BLACK30"), para quem ainda não tem o cupom saber qual usar. */
export function Preco({ p, citarCupom = false }: { p: Produto; citarCupom?: boolean }) {
  if (p.preco === null) return <span className="preco consulta">Consulte pelo WhatsApp</span>;
  const kit = kitDe(p);
  const porUnidade = p.tipo === "lote" ? <span className="un">{kit ? "por kit" : "por unidade"}</span> : null;
  // Só nos kits, durante a campanha: o valor já com o cupom (conta igual à do servidor; o servidor é quem decide).
  const valorKit = precoUnitario(p, 1);
  const comCupom =
    kit && blackFridayAtiva() && valorKit !== null ? (
      <span className="com-cupom">
        Preço com cupom{citarCupom ? ` ${BLACK_FRIDAY.cupom}` : ""}: <b>{brl(comCupomBlackFriday(valorKit))}</b>
      </span>
    ) : null;

  if (promocaoPorQuantidade(p)) {
    return (
      <span className="preco">
        <strong>{brl(p.preco)}</strong>
        {porUnidade}
        <small>
          {brl(p.preco_promocional as number)} cada a partir de {p.promo_qtd_minima} unidades
        </small>
      </span>
    );
  }
  if (temPromocao(p)) {
    return (
      <span className="preco">
        <s>{brl(p.preco)}</s>
        <strong>{brl(p.preco_promocional as number)}</strong>
        {porUnidade}
        {comCupom}
      </span>
    );
  }
  return (
    <span className="preco">
      <strong>{brl(p.preco)}</strong>
      {porUnidade}
      {comCupom}
    </span>
  );
}
