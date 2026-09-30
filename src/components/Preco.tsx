import type { Produto } from "@/lib/catalogo";
import { promocaoPorQuantidade, temPromocao } from "@/lib/catalogo";
import { brl } from "@/lib/format";

export function Preco({ p }: { p: Produto }) {
  if (p.preco === null) return <span className="preco consulta">Consulte pelo WhatsApp</span>;
  const porUnidade = p.tipo === "lote" ? <span className="un">por unidade</span> : null;

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
      </span>
    );
  }
  return (
    <span className="preco">
      <strong>{brl(p.preco)}</strong>
      {porUnidade}
    </span>
  );
}
