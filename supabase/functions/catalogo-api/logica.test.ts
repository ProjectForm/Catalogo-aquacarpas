// Testes da lógica pura (Pix e frete). Rodar na raiz do projeto:
//   node --test supabase/functions/catalogo-api/logica.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { crc16, gerarPix } from "./pix.ts";
import { calcularCaixas, calcularFrete, milesimosDeVolume, tamanhoMedioCm } from "./frete.ts";
import type { RegrasFrete } from "./frete.ts";

const regras: RegrasFrete = {
  capacidade_caixa: 15,
  gratis_a_partir: 2000,
  pedido_minimo_online: 500,
  custo_por_caixa: { SP: 95, MG: 125, MS: 125, PR: 125 },
  custo_padrao: 125,
};

test("CRC16/CCITT-FALSE: vetor padrão '123456789' = 29B1", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("Pix: exemplo do manual do Banco Central tem CRC 1D3D", () => {
  const sem = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" + "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(sem), "1D3D");
});

test("Pix: payload com valor exato, campos e CRC consistentes", () => {
  const p = gerarPix({ chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Aquacarpas Ltda", cidade: "São José do Rio Preto", valor: 1234.5, txid: "AQ1002" });
  assert.ok(p.startsWith("000201010211"));
  assert.ok(p.includes("5407" + "1234.50"));
  assert.ok(p.includes("5802BR"));
  assert.ok(p.includes("5915AQUACARPAS LTDA")); // nome sem acento, maiúsculo
  assert.ok(p.includes("6015SAO JOSE DO RIO")); // cidade cortada em 15
  assert.ok(p.includes("0506AQ1002"));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  // a cada campo TLV o tamanho declarado confere (percorre o payload inteiro)
  let i = 0;
  while (i < p.length) {
    const len = Number(p.slice(i + 2, i + 4));
    assert.ok(Number.isInteger(len));
    i += 4 + len;
  }
  assert.equal(i, p.length);
});

test("Pix: valor inválido ou chave vazia lançam erro", () => {
  assert.throws(() => gerarPix({ chave: "", nome: "A", cidade: "B", valor: 10 }));
  assert.throws(() => gerarPix({ chave: "x@y.com", nome: "A", cidade: "B", valor: 0 }));
});

test("tamanho médio: faixa e número", () => {
  assert.equal(tamanhoMedioCm(null, "22-23"), 22.5);
  assert.equal(tamanhoMedioCm(null, "30"), 30);
  assert.equal(tamanhoMedioCm(14, null), 14);
  assert.equal(tamanhoMedioCm(null, null), null);
});

test("unidades de volume por faixa (em milésimos)", () => {
  const casos: [number, number][] = [[11, 1000], [12, 1000], [14, 1500], [15, 1500], [15.5, 1875], [17, 1875], [18, 3000], [19.5, 3000], [21, 3000], [22.5, 5000], [25.5, 5000], [27, 5000], [29, 7500], [32, 7500], [33, 15000], [63, 15000]];
  for (const [tam, esperado] of casos) assert.equal(milesimosDeVolume(tam), esperado, `${tam} cm`);
  assert.equal(milesimosDeVolume(null), 15000);
});

test("caixas: exemplo do site principal (4 carpas de 30 cm = 2 caixas)", () => {
  assert.equal(calcularCaixas([{ tamanho_medio_cm: 30, quantidade: 4 }]), 2);
});

test("caixas: 8 peixes de 15-16 cm cabem em 1 caixa; 9 pedem 2", () => {
  assert.equal(calcularCaixas([{ tamanho_medio_cm: 15.5, quantidade: 8 }]), 1);
  assert.equal(calcularCaixas([{ tamanho_medio_cm: 15.5, quantidade: 9 }]), 2);
});

test("caixas: cada exemplar de 33 cm ou mais ocupa uma caixa", () => {
  assert.equal(calcularCaixas([{ tamanho_medio_cm: 33, quantidade: 1 }]), 1);
  assert.equal(calcularCaixas([{ tamanho_medio_cm: 39, quantidade: 1 }, { tamanho_medio_cm: 50, quantidade: 1 }]), 2);
});

test("caixas: mistura soma o volume (1 exemplar de 33 cm + 3 carpas de 25 cm = 30 unidades = 2 caixas)", () => {
  assert.equal(calcularCaixas([{ tamanho_medio_cm: 33, quantidade: 1 }, { tamanho_medio_cm: 25.5, quantidade: 3 }]), 2);
});

test("frete: SP 95 por caixa, MG/MS/PR 125, grátis a partir de 2000 (sobre o valor final)", () => {
  const itens = [{ tamanho_medio_cm: 30, quantidade: 4 }]; // 2 caixas
  assert.deepEqual(calcularFrete(itens, "SP", 1500, regras), { caixas: 2, custo_caixa: 95, frete: 190, gratis: false });
  assert.equal(calcularFrete(itens, "MG", 1500, regras).frete, 250);
  assert.equal(calcularFrete(itens, "PR", 1999.99, regras).frete, 250);
  assert.deepEqual(calcularFrete(itens, "SP", 2000, regras), { caixas: 2, custo_caixa: 95, frete: 0, gratis: true });
  assert.equal(calcularFrete(itens, "XX", 100, regras).custo_caixa, 125); // UF sem valor: padrão
});
