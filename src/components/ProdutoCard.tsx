import Link from "next/link";
import type { Produto } from "@/lib/catalogo";
import { kitDe, precoSoNaPagina } from "@/lib/catalogo";
import { AdicionarBotao } from "./AdicionarBotao";
import { NomeProduto } from "./NomeProduto";
import { Preco } from "./Preco";

function meta(p: Produto): string {
  const partes: string[] = [];
  const kit = kitDe(p);
  if (kit?.composicao.length) partes.push(...kit.composicao);
  if (p.tamanho_cm) partes.push(`${p.tamanho_cm} cm`);
  const sexo = p.ficha?.sexo;
  if (typeof sexo === "string" && sexo) partes.push(sexo);
  return partes.join(" · ");
}

export function ProdutoCard({ produto: p, formato }: { produto: Produto; formato?: "horizontal" | "vertical" | "estreita" }) {
  const indisponivel = p.status !== "disponivel";
  const selo =
    p.status === "vendido" ? "Vendido" : p.status === "reservado" ? "Reservado" : null;
  const linhaMeta = meta(p);
  const kit = kitDe(p);
  // Exemplar único: o card não traz preço nem "Adicionar". Quem toca vê o vídeo e a procedência antes do valor.
  const semPreco = precoSoNaPagina(p);

  return (
    <article className={`cartao${indisponivel ? " indisponivel" : ""}`} data-foto={formato} data-codigo={p.codigo}>
      <Link href={`/p/${p.slug}`} className="foto" aria-label={`Ver ${p.nome}`}>
        {p.imagens[0] ? <img src={p.imagens[0]} alt={p.nome} loading="lazy" decoding="async" /> : null}
        {selo ? <span className="selo">{selo}</span> : null}
      </Link>
      <div className="corpo">
        <h3>
          <Link href={`/p/${p.slug}`}>
            <NomeProduto nome={p.nome} />
          </Link>
        </h3>
        {linhaMeta ? <p className="meta">{linhaMeta}</p> : null}
        {kit?.brinde ? <p className="brinde">Brinde: {kit.brinde}</p> : null}
        <div className="rodape">
          {semPreco ? (
            <>
              <span className="exemplar-unico">Exemplar único</span>
              <Link href={`/p/${p.slug}`} className="btn btn-contorno" data-rastro="ver_peixe" data-codigo={p.codigo}>
                {p.status === "vendido" ? "Vendido" : p.status === "reservado" ? "Reservado" : "Ver peixe"}
              </Link>
            </>
          ) : (
            <>
              <Preco p={p} />
              <AdicionarBotao produto={p} />
            </>
          )}
        </div>
      </div>
    </article>
  );
}
