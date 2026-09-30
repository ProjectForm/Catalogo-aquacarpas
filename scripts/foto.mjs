// Otimiza uma foto para o catálogo: reduz para no máximo 1600px, converte para WebP e salva em public/fotos/.
//
// Uso:   npm run foto -- caminho/da/foto.jpg nome-do-arquivo
// Exemplo: npm run foto -- "C:/Users/Juan/Downloads/IMG_2041.jpg" kohaku-63cm
// Depois: colocar "/fotos/kohaku-63cm.webp" na coluna `imagens` do item no Supabase (o Claude Code faz isso).
//
// Nunca amplia foto pequena (só avisa): foto de baixa resolução fica com aspecto ruim no site.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [, , origem, nomeArg] = process.argv;
if (!origem) {
  console.error("Uso: npm run foto -- caminho/da/foto.jpg nome-do-arquivo");
  process.exit(1);
}

const aqui = dirname(fileURLToPath(import.meta.url));
const destinoDir = join(aqui, "..", "public", "fotos");
mkdirSync(destinoDir, { recursive: true });

const nome = (nomeArg || basename(origem, extname(origem)))
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/^-+|-+$/g, "");

const img = sharp(origem, { failOn: "none" }).rotate(); // respeita a orientação do celular
const meta = await img.metadata();
if ((meta.width ?? 0) < 800) {
  console.warn(`Atenção: foto com só ${meta.width}px de largura. Vai ficar borrada no site; prefira a original do celular.`);
}

const saida = join(destinoDir, `${nome}.webp`);
const info = await img
  .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
  .webp({ quality: 82 })
  .toFile(saida);

console.log(`OK: /fotos/${nome}.webp  (${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB)`);
