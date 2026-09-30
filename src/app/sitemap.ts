import type { MetadataRoute } from "next";
import { listarProdutos } from "@/lib/catalogo";
import { SITE_URL } from "@/lib/config";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const produtos = await listarProdutos();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/entrega`, changeFrequency: "monthly", priority: 0.5 },
    ...produtos.map((p) => ({ url: `${SITE_URL}/p/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
