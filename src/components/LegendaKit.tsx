import type { KitInfo } from "@/lib/catalogo";
import { rotuloPeixes } from "@/lib/catalogo";

/**
 * Legenda da quantidade do kit, em fonte sem serifa e números alinhados (a serifa do título desenha o 1 como um I e deixa
 * "15 koi de 10 a 12 cm" difícil de ler): "15 peixes · 10 a 12 cm" ou, nos kits mistos, "5 peixes · 2 de 21 cm · 1 de 25 cm...".
 * Kits de mais de uma caixa avisam ("2 caixas"), porque o frete é por caixa.
 */
export function LegendaKit({ kit, grande = false }: { kit: KitInfo; grande?: boolean }) {
  const detalhe = kit.composicao.length ? kit.composicao : kit.tamanho ? [kit.tamanho] : [];
  if (!kit.quantidade && detalhe.length === 0) return null;
  return (
    <p className={`legenda-kit${grande ? " grande" : ""}`}>
      {kit.quantidade ? <strong>{rotuloPeixes(kit.quantidade)}</strong> : null}
      {detalhe.length ? <span>{detalhe.join(" · ")}</span> : null}
      {kit.caixas > 1 ? <span className="caixas">{kit.caixas} caixas</span> : null}
    </p>
  );
}
