import Link from "next/link";
import { CategoriaNav } from "@/components/CategoriaNav";
import { NomeProduto } from "@/components/NomeProduto";
import { ProdutoCard } from "@/components/ProdutoCard";
import { TrackView } from "@/components/TrackView";
import { listarSecoes } from "@/lib/catalogo";
import { POLITICAS, SITE } from "@/lib/config";
import { brl } from "@/lib/format";

export const revalidate = 60;

export default async function Home() {
  const secoes = await listarSecoes();
  // O peixe em destaque do topo é o primeiro item marcado com destaque=true e disponível no banco.
  const destaque = secoes.flatMap((s) => s.produtos).find((p) => p.destaque && p.status === "disponivel" && p.imagens[0]);

  return (
    <>
      <TrackView />
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">{SITE.nome} · {SITE.cidade}</p>
            <h1>{SITE.tagline}</h1>
            <p className="sub">
              Carpas Nishikigoi criadas e selecionadas com cuidado. Mais de 10 anos de convivência com carpas e mais de 7 levando
              peixes para o lago dos nossos clientes.
            </p>
            <div className="acoes">
              <a href="#catalogo" className="btn btn-primario">Ver o catálogo</a>
              <Link href="/entrega" className="btn btn-contorno">Como funciona a entrega</Link>
            </div>
          </div>
          {destaque ? (
            <Link href={`/p/${destaque.slug}`} className="hero-foto" aria-label={`Ver ${destaque.nome}`}>
              <div className="img">
                <img src={destaque.imagens[0]} alt={destaque.nome} decoding="async" />
              </div>
              <div className="legenda">
                <strong><NomeProduto nome={destaque.nome} /></strong>
                <span>{destaque.preco !== null ? brl(destaque.preco_promocional !== null && destaque.promo_qtd_minima <= 1 ? destaque.preco_promocional : destaque.preco) : "Consulte"}</span>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="confianca" aria-label="Garantias">
        <div className="container">
          <div className="item">
            <h3>{POLITICAS.prazo.titulo}</h3>
            <p>{POLITICAS.prazo.texto} {POLITICAS.jejum.texto}</p>
          </div>
          <div className="item">
            <h3>{POLITICAS.transporte.titulo}</h3>
            <p>{POLITICAS.transporte.texto}</p>
          </div>
          <div className="item">
            <h3>{POLITICAS.garantia.titulo}</h3>
            <p>Foto ou vídeo em até 3 horas do recebimento, pelo WhatsApp. Reposição ou reembolso integral, conforme avaliação do caso.</p>
          </div>
        </div>
      </section>

      <CategoriaNav itens={secoes.map((s) => ({ slug: s.categoria.slug, nome: s.categoria.nome, total: s.produtos.length }))} />

      <div id="catalogo" className="container">
        {secoes.length === 0 ? (
          <section className="secao">
            <p className="vazio">O catálogo está sendo atualizado. Fale com a gente pelo WhatsApp para ver os peixes disponíveis.</p>
          </section>
        ) : (
          secoes.map((s) => (
            <section key={s.categoria.slug} id={`sec-${s.categoria.slug}`} className="secao" aria-labelledby={`cat-${s.categoria.slug}`}>
              <div className="secao-cab">
                <h2 id={`cat-${s.categoria.slug}`}>{s.categoria.nome}</h2>
                {s.categoria.descricao ? <p>{s.categoria.descricao}</p> : null}
              </div>
              <div className={s.produtos.every((p) => p.tipo === "exemplar_unico") ? "grade grande" : "grade"}>
                {s.produtos.map((p) => (
                  <ProdutoCard key={p.codigo} produto={p} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
