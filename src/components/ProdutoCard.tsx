import Link from "next/link";
import type { Produto } from "@/lib/catalogo";
import { AdicionarBotao } from "./AdicionarBotao";
import { NomeProduto } from "./NomeProduto";
import { Preco } from "./Preco";

function meta(p: Produto): string {
  const partes: string[] = [];
  if (p.tamanho_cm) partes.push(`${p.tamanho_cm} cm`);
  const sexo = p.ficha?.sexo;
  if (typeof sexo === "string" && sexo) partes.push(sexo);
  return partes.join(" · ");
}

export function ProdutoCard({ produto: p }: { produto: Produto }) {
  const indisponivel = p.status !== "disponivel";
  const selo =
    p.status === "vendido" ? "Vendido" : p.status === "reservado" ? "Reservado" : p.tipo === "exemplar_unico" ? "Exemplar único" : null;
  const linhaMeta = meta(p);

  return (
    <article className={`cartao${indisponivel ? " indisponivel" : ""}`}>
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
        <div className="rodape">
          <Preco p={p} />
          <AdicionarBotao produto={p} />
        </div>
      </div>
    </article>
  );
}
