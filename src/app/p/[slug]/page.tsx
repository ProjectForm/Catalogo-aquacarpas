import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdicionarBotao } from "@/components/AdicionarBotao";
import { Galeria } from "@/components/Galeria";
import { NomeProduto } from "@/components/NomeProduto";
import { Preco } from "@/components/Preco";
import { TrackView } from "@/components/TrackView";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { buscarProduto, listarProdutos } from "@/lib/catalogo";
import type { Produto } from "@/lib/catalogo";
import { linkWhatsApp, POLITICAS, SITE, SITE_URL } from "@/lib/config";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const produtos = await listarProdutos();
  return produtos.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await buscarProduto(slug);
  if (!p) return { title: "Peixe não encontrado" };
  const descricao = (p.descricao ?? `${p.nome} — ${SITE.nome}, ${SITE.cidade}.`).replace(/\s+/g, " ").slice(0, 200);
  const imagem = p.imagens[0] ? `${SITE_URL}${p.imagens[0]}` : undefined;
  return {
    title: p.nome,
    description: descricao,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title: p.nome, description: descricao, images: imagem ? [{ url: imagem }] : undefined, type: "website" },
  };
}

const ROTULO_FICHA: Record<string, string> = { sexo: "Sexo", idade: "Idade", criador: "Origem", certificado: "Certificado" };

function fichaPublica(p: Produto): [string, string][] {
  const linhas: [string, string][] = [];
  if (p.variedade && p.tipo === "exemplar_unico") linhas.push(["Variedade", p.variedade]);
  if (p.tamanho_cm) linhas.push(["Tamanho", `${p.tamanho_cm} cm`]);
  for (const [k, rotulo] of Object.entries(ROTULO_FICHA)) {
    const v = p.ficha?.[k];
    if (typeof v === "string" && v) linhas.push([rotulo, v]);
  }
  const faixa = p.ficha?.faixa_cm;
  if (typeof faixa === "string" && faixa) linhas.push(["Faixa de tamanho", `${faixa} cm`]);
  return linhas;
}

export default async function ProdutoPage({ params }: Props) {
  const { slug } = await params;
  const p = await buscarProduto(slug);
  if (!p) notFound();

  const ficha = fichaPublica(p);
  const disponibilidade = p.status === "disponivel" ? "https://schema.org/InStock" : "https://schema.org/SoldOut";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nome,
    description: p.descricao ?? undefined,
    image: p.imagens.map((i) => `${SITE_URL}${i}`),
    sku: p.codigo,
    brand: { "@type": "Brand", name: SITE.nome },
    offers:
      p.preco !== null
        ? {
            "@type": "Offer",
            priceCurrency: "BRL",
            price: (p.preco_promocional !== null && p.promo_qtd_minima <= 1 ? p.preco_promocional : p.preco).toFixed(2),
            availability: disponibilidade,
            url: `${SITE_URL}/p/${p.slug}`,
          }
        : undefined,
  };

  const textoWhats = `Olá! Tenho interesse no ${p.nome} (código ${p.codigo}) que vi no catálogo da Aquacarpas.`;

  return (
    <div className="container">
      <TrackView produto={p.codigo} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="migalha">
        <Link href="/">Catálogo</Link> / {p.nome}
      </p>
      <div className="produto">
        <Galeria imagens={p.imagens} alt={p.nome} />
        <div>
          <p className="eyebrow">{p.tipo === "exemplar_unico" ? "Exemplar único" : "Vendida por unidade"}</p>
          <h1>
            <NomeProduto nome={p.nome} />
          </h1>
          <Preco p={p} />

          {p.descricao ? <p className="descricao">{p.descricao}</p> : null}

          {ficha.length ? (
            <dl className="ficha">
              {ficha.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {typeof p.ficha?.observacao_foto === "string" && p.ficha.observacao_foto ? (
            <p className="aviso">{p.ficha.observacao_foto}</p>
          ) : null}

          <div className="acoes-produto">
            <AdicionarBotao produto={p} cheio />
            <WhatsAppLink href={linkWhatsApp(textoWhats)} className="btn btn-whats btn-bloco" itemCodigo={p.codigo}>
              Falar sobre este peixe no WhatsApp
            </WhatsAppLink>
          </div>

          <p className="aviso">
            {POLITICAS.prazo.titulo}, já considerando o jejum pré-envio. {POLITICAS.transporte.titulo}. O frete é calculado pela nossa equipe
            e informado pelo WhatsApp.{" "}
            <Link href="/entrega" style={{ textDecoration: "underline" }}>
              Ver detalhes da entrega
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
