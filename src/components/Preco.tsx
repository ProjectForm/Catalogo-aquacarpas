import type { Produto } from "@/lib/catalogo";
import { comCupomBlackFriday, kitDe, precoUnitario, promocaoPorQuantidade, temPromocao, valorPorPeixe } from "@/lib/catalogo";
import { BLACK_FRIDAY, blackFridayAtiva } from "@/lib/config";
import { brl } from "@/lib/format";

/** `citarCupom`: na página do kit a linha cita o código ("Preço com cupom BLACK30"), para quem ainda não tem o cupom saber qual usar. */
export function Preco({ p, citarCupom = false }: { p: Produto; citarCupom?: boolean }) {
  if (p.preco === null) return <span className="preco consulta">Consulte pelo WhatsApp</span>;
  const kit = kitDe(p);
  const porUnidade = p.tipo === "lote" ? <span className="un">{kit ? "por kit" : "por unidade"}</span> : null;

  // Kits: valor por peixe (nos mistos, a média) e, durante a campanha, o preço com o cupom e o valor por peixe já com o cupom.
  // Conta igual à do servidor (comCupomBlackFriday); só exibição, quem decide o desconto é o servidor.
  const valorKit = precoUnitario(p, 1);
  const misto = (kit?.composicao.length ?? 0) > 0;
  const rotuloPeixe = (valor: number | null) =>
    valor === null ? null : (
      <span className="por-peixe">
        {misto ? "média de " : ""}
        {brl(valor)} por peixe
      </span>
    );
  const porPeixeKit = kit && valorKit !== null ? rotuloPeixe(valorPorPeixe(valorKit, kit.quantidade)) : null;
  const valorComCupom = kit && blackFridayAtiva() && valorKit !== null ? comCupomBlackFriday(valorKit) : null;
  const comCupom =
    valorComCupom !== null ? (
      <span className="com-cupom">
        Preço com cupom{citarCupom ? ` ${BLACK_FRIDAY.cupom}` : ""}: <b>{brl(valorComCupom)}</b>
        {rotuloPeixe(valorPorPeixe(valorComCupom, kit?.quantidade ?? null))}
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
        {porPeixeKit}
        {comCupom}
      </span>
    );
  }
  return (
    <span className="preco">
      <strong>{brl(p.preco)}</strong>
      {porUnidade}
      {porPeixeKit}
      {comCupom}
    </span>
  );
}
