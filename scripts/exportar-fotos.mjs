// Exporta TODAS as fotos do catálogo para uma pasta do computador, na maior qualidade que o projeto tem.
//
// Uso:    npm run exportar-fotos
//         npm run exportar-fotos -- "D:/minha/pasta"      (outra pasta de destino)
// Padrão: a pasta "fotos-catalogo" ao lado da pasta do projeto (fora do Git, nada disso vai para o site).
//
// O que sai na pasta de destino:
//   - <nome>.jpg            cada foto em JPG de qualidade máxima (abre em qualquer lugar: Instagram, WhatsApp, anúncios, Canva)
//   - webp-original/<nome>.webp   o arquivo exatamente como está no site (sem reconverter, sem perda)
//   - indice.csv            qual foto é de qual item do catálogo (abre no Excel), com tamanho em pixels e aviso das pequenas
//
// Limite que não dá para vencer: o site só guarda a versão otimizada (no máximo 1600 px no lado maior, ver scripts/foto.mjs).
// A foto original do celular não fica no projeto. O JPG sai do WebP sem nova perda visível, mas não recupera detalhe que já se foi.
// Se você ainda tem as fotos originais do celular, elas são sempre melhores que estas.
import sharp from "sharp";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const fotosDir = join(raiz, "public", "fotos");
const destino = resolve(process.argv[2] || join(raiz, "..", "fotos-catalogo"));
const webpDir = join(destino, "webp-original");
mkdirSync(webpDir, { recursive: true });

// Itens do catálogo: de qual item cada foto é (só para o índice; as fotos vêm da pasta public/fotos).
const usos = new Map(); // arquivo -> [{ codigo, nome, ativo }]
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let externas = []; // fotos que não estão em public/fotos (endereço completo)
if (url && chave) {
  try {
    const r = await fetch(`${url}/rest/v1/catalogo?select=codigo,nome,ativo,imagens,foto_url&order=ordem.asc`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
    });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}`);
    for (const item of await r.json()) {
      const lista = Array.isArray(item.imagens) && item.imagens.length ? item.imagens : item.foto_url ? [item.foto_url] : [];
      for (const caminho of lista) {
        if (/^https?:\/\//i.test(caminho)) externas.push(caminho);
        const arquivo = basename(String(caminho).split("?")[0]);
        if (!usos.has(arquivo)) usos.set(arquivo, []);
        usos.get(arquivo).push({ codigo: item.codigo, nome: item.nome ?? item.codigo, ativo: item.ativo !== false });
      }
    }
  } catch (e) {
    console.warn(`Aviso: não consegui ler o catálogo (${e.message}). As fotos saem igual, só o índice fica sem os nomes dos itens.`);
  }
} else {
  console.warn("Aviso: sem NEXT_PUBLIC_SUPABASE_* no ambiente (use `npm run exportar-fotos`). As fotos saem igual, só o índice fica sem os nomes dos itens.");
}

// Fotos hospedadas fora do projeto (se um dia houver): baixa para a pasta de destino com o mesmo tratamento.
const arquivos = readdirSync(fotosDir).filter((f) => /\.(webp|jpe?g|png|avif)$/i.test(f));
const baixadas = [];
for (const endereco of [...new Set(externas)]) {
  try {
    const r = await fetch(endereco);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const nome = basename(new URL(endereco).pathname) || "foto";
    const dest = join(webpDir, nome);
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    baixadas.push(dest);
  } catch (e) {
    console.warn(`Aviso: não consegui baixar ${endereco} (${e.message}).`);
  }
}

const linhas = [["arquivo", "itens_do_catalogo", "largura_px", "altura_px", "tamanho_kb_jpg", "aviso"]];
let ok = 0;
const origens = [...arquivos.map((f) => join(fotosDir, f)), ...baixadas];
for (const origem of origens.sort()) {
  const arquivo = basename(origem);
  const nome = basename(arquivo, extname(arquivo));
  if (!baixadas.includes(origem)) copyFileSync(origem, join(webpDir, arquivo));
  const img = sharp(origem, { failOn: "none" }).rotate();
  const meta = await sharp(origem, { failOn: "none" }).rotate().metadata();
  const saida = join(destino, `${nome}.jpg`);
  // Qualidade 95 sem subamostragem de cor (4:4:4): preserva o contraste fino entre as cores do koi.
  await img.jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: false }).toFile(saida);
  const info = await sharp(saida).metadata();
  const kb = Math.round(statSync(saida).size / 1024);
  const uso = (usos.get(arquivo) ?? []).filter((u) => u.ativo);
  const inativos = (usos.get(arquivo) ?? []).filter((u) => !u.ativo);
  const itens = uso.map((u) => `${u.codigo} (${u.nome})`).join(" | ") || (inativos.length ? `só itens desativados: ${inativos.map((u) => u.codigo).join(", ")}` : "não usada no catálogo");
  const largo = Math.max(info.width ?? 0, info.height ?? 0);
  const aviso = largo < 800 ? "resolução baixa (serve para o site, borra se for ampliada ou impressa)" : largo < 1200 ? "resolução média" : "";
  linhas.push([`${nome}.jpg`, itens, meta.width ?? "", meta.height ?? "", kb, aviso]);
  ok += 1;
}

// CSV para o Excel brasileiro: separador ";", com BOM para os acentos abrirem certos.
const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
writeFileSync(join(destino, "indice.csv"), `\uFEFF${csv}\r\n`);

console.log(`Pronto: ${ok} fotos em ${destino}`);
console.log("  .jpg na pasta, os .webp exatos do site em webp-original/ e o indice.csv dizendo de qual item é cada foto.");
const baixas = linhas.slice(1).filter((l) => l[5].startsWith("resolução baixa")).map((l) => l[0]);
if (baixas.length) console.log(`  Atenção: ${baixas.length} foto(s) de resolução baixa: ${baixas.join(", ")}`);
if (!existsSync(join(destino, "indice.csv"))) process.exitCode = 1;
