"use client";

import { useEffect, useState } from "react";

/** Abas de categoria (âncoras) fixas abaixo do topo: levam direto à seção, ex.: "Nishikigoi Ultra Premium". */
export function CategoriaNav({ itens }: { itens: { slug: string; nome: string; total: number }[] }) {
  const [ativo, setAtivo] = useState<string>(itens[0]?.slug ?? "");

  useEffect(() => {
    const secoes = itens.map((i) => document.getElementById(`sec-${i.slug}`)).filter((e): e is HTMLElement => Boolean(e));
    if (secoes.length === 0 || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setAtivo(visivel.target.id.replace("sec-", ""));
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );
    secoes.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [itens]);

  if (itens.length < 2) return null;
  return (
    <nav className="abas" aria-label="Categorias do catálogo">
      <div className="container abas-lista">
        {itens.map((i) => (
          <a key={i.slug} href={`#sec-${i.slug}`} aria-current={ativo === i.slug ? "true" : undefined}>
            {i.nome} <span className="qtd-aba">{i.total}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
