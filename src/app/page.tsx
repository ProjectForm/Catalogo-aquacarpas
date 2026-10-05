import Link from "next/link";
import { CategoriaNav } from "@/components/CategoriaNav";
import { NomeProduto } from "@/components/NomeProduto";
import { ProdutoCard } from "@/components/ProdutoCard";
import { TrackView } from "@/components/TrackView";
import { listarSecoes, type Produto } from "@/lib/catalogo";
import { POLITICAS, SITE } from "@/lib/config";
import { brl } from "@/lib/format";

export const revalidate = 60;

/** Proporção (largura/altura) da foto, gravada em catalogo.ficha.foto_ratio por `npm run foto` / pelo Claude Code. */
function razaoFoto(p: Produto): number {
  const r = p.ficha?.foto_ratio;
  return typeof r === "number" && r > 0 ? r : 0.7;
}
/** horizontal (>= 1), vertical (0,6 a 1) ou estreita (< 0,6, mostrada inteira sem cortar). */
function formatoFoto(p: Produto): "horizontal" | "vertical" | "estreita" {
  const r = razaoFoto(p);
  return r >= 1 ? "horizontal" : r < 0.6 ? "estreita" : "vertical";
}

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
              {s.produtos.every((p) => p.tipo === "exemplar_unico") ? (
                // Abas só de exemplares: fotos horizontais e verticais em linhas separadas, cada linha com moldura igual.
                [s.produtos.filter((p) => formatoFoto(p) === "horizontal"), s.produtos.filter((p) => formatoFoto(p) !== "horizontal")]
                  .filter((grupo) => grupo.length > 0)
                  .map((grupo) => (
                    <div key={grupo[0].codigo} className="grade grande">
                      {grupo.map((p) => (
                        <ProdutoCard key={p.codigo} produto={p} formato={formatoFoto(p)} />
                      ))}
                    </div>
                  ))
              ) : (
                <div className="grade">
                  {s.produtos.map((p) => (
                    <ProdutoCard key={p.codigo} produto={p} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </>
  );
}
