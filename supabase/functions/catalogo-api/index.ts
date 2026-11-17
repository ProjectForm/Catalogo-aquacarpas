// catalogo-api — recebe pedidos / cadastros de envio do catálogo online, calcula cupons e registra eventos de funil.
//
// Esta é uma CÓPIA VERSIONADA da Edge Function que roda no Supabase (projeto vxrfyprtikznvklodqmx). O código só vale
// quando é publicado lá (Supabase MCP `deploy_edge_function` ou `supabase functions deploy catalogo-api --no-verify-jwt`).
// Nenhum segredo fica aqui: as chaves vêm das variáveis de ambiente da função (secrets).
//
// Público (verify_jwt = false): quem chama é o navegador do cliente. Por isso:
//  - o preço e o desconto são SEMPRE recalculados aqui a partir das tabelas `catalogo` e `cupons` (nunca confia no navegador);
//  - CPF/CNPJ nunca vai para log;
//  - honeypot + limite de pedidos por telefone/hora contra abuso;
//  - a venda nasce com status `aguardando_pagamento` (ou `cadastro_recebido`, sem itens). Confirmar
//    pagamento e reservar o peixe continua sendo decisão humana (Juan/pai).
//
// POST { acao: "pedido" | "cupom" | "evento", ... }  — ver tipos abaixo.
//  - "cupom": só CALCULA o desconto (não grava nada e não avisa ninguém). Devolve
//    { ok, codigo, percentual, desconto, total_original, total_final, valido_ate } ou um erro amigável.
//  - "pedido": aceita `cupom` (opcional). O desconto incide sobre o total que seria cobrado (já com promoção por item).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Número de atendimento (mesmo do Kyte e de conhecimento/negocio.md). Sobrescrevível por secret.
const WHATSAPP_ATENDIMENTO = Deno.env.get("WHATSAPP_ATENDIMENTO") || "5517981516665";
// Aviso interno por WhatsApp via CallMeBot (serviço não oficial; só envia para o número que ativou a chave lá).
// A chave NUNCA fica no código: vem do secret CALLMEBOT_APIKEY (Supabase > Edge Functions > Secrets).
const CALLMEBOT_APIKEY = Deno.env.get("CALLMEBOT_APIKEY") ?? "";
const CALLMEBOT_PHONE = Deno.env.get("CALLMEBOT_PHONE") || WHATSAPP_ATENDIMENTO;
const MAX_PEDIDOS_POR_HORA = 3;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function erro(status: number, codigo: string, mensagem: string) {
  return json(status, { ok: false, erro: codigo, mensagem });
}

// ---------- aviso à equipe ----------
/** Manda o resumo do pedido para o WhatsApp da equipe. Nunca derruba o pedido e nunca registra a URL (tem a chave). */
async function avisarEquipe(texto: string): Promise<void> {
  if (!CALLMEBOT_APIKEY) {
    console.warn("CALLMEBOT_APIKEY ausente: aviso à equipe não enviado.");
    return;
  }
  try {
    const url = "https://api.callmebot.com/whatsapp.php" +
      `?phone=${encodeURIComponent(CALLMEBOT_PHONE)}&text=${encodeURIComponent(texto.slice(0, 1500))}` +
      `&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const corpo = (await r.text()).replace(/\s+/g, " ").slice(0, 120);
    if (!r.ok) console.error(`CallMeBot respondeu ${r.status}: ${corpo}`);
    else if (/error|invalid/i.test(corpo)) console.error("CallMeBot recusou a mensagem.");
    else console.log("Aviso CallMeBot enviado.");
  } catch (e) {
    console.error("CallMeBot falhou:", e instanceof Error ? e.name : "erro desconhecido");
  }
}

// ---------- utilidades ----------
function limpar(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  // deno-lint-ignore no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function soDigitos(v: unknown): string {
  return typeof v === "string" ? v.replace(/\D/g, "") : "";
}

/** Devolve o telefone em E.164 sem "+" (55 + DDD + número), inserindo o 9º dígito de celular se faltar. */
function normalizarTelefone(raw: unknown): string | null {
  let d = soDigitos(raw).replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  let local = d.slice(4);
  if (local.length === 8 && /^[6-9]/.test(local)) local = "9" + local; // celular antigo sem o 9
  if (local.length !== 8 && local.length !== 9) return null;
  if (local.length === 9 && local[0] !== "9") return null;
  return "55" + d.slice(2, 4) + local;
}

/** O WhatsApp às vezes entrega o wa_id sem o 9º dígito; casamos com as duas formas. */
function variantesTelefone(p: string): string[] {
  const out = [p];
  const local = p.slice(4);
  if (local.length === 9 && local[0] === "9") out.push(p.slice(0, 4) + local.slice(1));
  if (local.length === 8 && /^[6-9]/.test(local)) out.push(p.slice(0, 4) + "9" + local);
  return out;
}

function validarCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(cpf.slice(0, 9), 10) === Number(cpf[9]) && calc(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function validarCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(cnpj.slice(0, 12)) === Number(cnpj[12]) && calc(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 14000000 -> 14000-000 */
function fmtCep(cep: string): string {
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/** 5517981516665 -> (17) 98151-6665 */
function fmtTelefone(p: string): string {
  const local = p.slice(4);
  const ddd = p.slice(2, 4);
  return local.length === 9 ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
}

const UF = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
);

function limparUtm(u: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (u && typeof u === "object") {
    for (const k of ["source", "medium", "campaign", "content", "term", "ref"]) {
      const val = limpar((u as Record<string, unknown>)[k], 100);
      if (val) out[k] = val;
    }
  }
  return out;
}

const MIDIA_PAGA = new Set(["cpc", "paid", "ads", "paid_social", "paidsocial", "ppc", "ctwa"]);

/** origem do contato: organico | anuncio | indicacao | direto */
function classificarOrigem(utm: Record<string, string>, temIndicacao: boolean): string {
  if (temIndicacao) return "indicacao";
  if (utm.medium && MIDIA_PAGA.has(utm.medium.toLowerCase())) return "anuncio";
  if (utm.source) return "organico";
  return "direto";
}

// ---------- eventos de funil ----------
const EVENTOS = new Set([
  "pagina",
  "produto_visto",
  "add_pedido",
  "clique_whatsapp",
  "iniciou_cadastro",
]);

async function registrarEvento(b: Record<string, unknown>) {
  const tipo = limpar(b.tipo, 40);
  if (!EVENTOS.has(tipo)) return erro(400, "evento_invalido", "Evento não reconhecido.");
  const codigo = limpar(b.item_codigo, 30);
  await supabase.from("eventos_site").insert({
    tipo,
    sessao: limpar(b.sessao, 64) || null,
    path: limpar(b.path, 200) || null,
    item_codigo: /^[A-Z0-9-]{2,30}$/i.test(codigo) ? codigo.toUpperCase() : null,
    utm: limparUtm(b.utm),
    referrer: limpar(b.referrer, 200) || null,
  });
  return json(200, { ok: true });
}

// ---------- itens e preços (compartilhado entre `cupom` e `pedido`) ----------
interface Linha {
  codigo: string;
  nome: string;
  variedade: string;
  tamanho_cm: number | null;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  promocao_aplicada: boolean;
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

/** Lê `itens` do corpo (até 20, quantidades de 1 a 200). Devolve o mapa codigo -> quantidade ou a resposta de erro. */
function lerItens(bruto: unknown): { pedidos: Map<string, number> } | { resp: Response } {
  const itensIn = Array.isArray(bruto) ? bruto.slice(0, 20) : [];
  const pedidos = new Map<string, number>();
  for (const it of itensIn) {
    const codigo = limpar((it as Record<string, unknown>)?.codigo, 30).toUpperCase();
    const qtd = Math.floor(Number((it as Record<string, unknown>)?.quantidade));
    if (!/^[A-Z0-9-]{2,30}$/.test(codigo) || !Number.isFinite(qtd) || qtd < 1 || qtd > 200) {
      return { resp: erro(422, "item_invalido", "Há um item inválido no pedido.") };
    }
    pedidos.set(codigo, (pedidos.get(codigo) ?? 0) + qtd);
  }
  return { pedidos };
}

/** Recalcula cada linha a partir da tabela `catalogo` (disponibilidade, estoque, quantidade mínima e promoção). */
async function calcularLinhas(pedidos: Map<string, number>): Promise<{ linhas: Linha[] } | { resp: Response }> {
  const linhas: Linha[] = [];
  if (pedidos.size === 0) return { linhas };
  const { data: produtos, error: eProd } = await supabase
    .from("catalogo")
    .select("*")
    .in("codigo", [...pedidos.keys()])
    .eq("ativo", true);
  if (eProd) return { resp: erro(500, "erro_catalogo", "Não foi possível consultar o catálogo agora.") };

  for (const [codigo, qtdPedida] of pedidos) {
    const p = (produtos ?? []).find((x) => x.codigo === codigo);
    const indisponivel = !p || p.status === "vendido" || p.status === "reservado" ||
      (p.controla_estoque && (p.quantidade ?? 0) < 1);
    if (indisponivel) {
      return { resp: erro(409, "item_indisponivel", `O item ${p?.nome ?? codigo} não está mais disponível.`) };
    }
    const qtd = p.tipo === "exemplar_unico" ? 1 : qtdPedida;
    if (qtd < (p.quantidade_minima ?? 1)) {
      return { resp: erro(422, "quantidade_minima", `${p.nome}: quantidade mínima de ${p.quantidade_minima}.`) };
    }
    if (p.controla_estoque && p.quantidade != null && qtd > p.quantidade) {
      return { resp: erro(409, "sem_estoque", `${p.nome}: só temos ${p.quantidade} unidade(s).`) };
    }
    const cheio = Number(p.preco ?? 0);
    const promo = p.preco_promocional != null ? Number(p.preco_promocional) : null;
    const aplicaPromo = promo != null && qtd >= (p.promo_qtd_minima ?? 1);
    const unit = aplicaPromo ? promo! : cheio;
    if (!(unit > 0)) return { resp: erro(422, "sem_preco", `${p.nome}: consulte o preço pelo WhatsApp.`) };
    linhas.push({
      codigo,
      nome: p.nome ?? p.variedade,
      variedade: p.variedade,
      tamanho_cm: p.tamanho_cm ?? null,
      quantidade: qtd,
      preco_unitario: unit,
      subtotal: arred2(unit * qtd),
      promocao_aplicada: aplicaPromo,
    });
  }
  return { linhas };
}

// ---------- cupom ----------
interface CupomAplicado {
  codigo: string;
  percentual: number;
  valido_ate: string;
  total_original: number;
  desconto: number;
  total_final: number;
}

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Confere o cupom no banco (tabela `cupons`, só acessível por esta função) e calcula o desconto sobre `totalOriginal`.
 * A palavra final é sempre daqui: o navegador só mostra o que o servidor devolve.
 */
async function aplicarCupom(bruto: unknown, totalOriginal: number): Promise<{ cupom: CupomAplicado } | { resp: Response }> {
  const codigo = limpar(bruto, 30).toUpperCase();
  const invalido = { resp: erro(422, "cupom_invalido", "Cupom inválido. Confira o código e tente novamente.") };
  if (!/^[A-Z0-9-]{3,30}$/.test(codigo)) return invalido;

  const { data: c, error: eC } = await supabase
    .from("cupons")
    .select("codigo, percentual, valido_de, valido_ate, ativo")
    .eq("codigo", codigo)
    .maybeSingle();
  if (eC) return { resp: erro(500, "erro_cupom", "Não foi possível conferir o cupom agora. Tente novamente em instantes.") };
  if (!c || !c.ativo) return invalido;

  const agora = Date.now();
  if (c.valido_de && agora < Date.parse(c.valido_de)) {
    return { resp: erro(422, "cupom_invalido", "Este cupom ainda não está valendo.") };
  }
  if (agora > Date.parse(c.valido_ate)) {
    return { resp: erro(422, "cupom_expirado", `Este cupom expirou em ${dataBR(c.valido_ate)}.`) };
  }

  const percentual = Number(c.percentual);
  const desconto = Math.round(totalOriginal * percentual) / 100; // centavos, arredondado uma única vez sobre o total
  return {
    cupom: {
      codigo: c.codigo,
      percentual,
      valido_ate: c.valido_ate,
      total_original: arred2(totalOriginal),
      desconto: arred2(desconto),
      total_final: arred2(totalOriginal - desconto),
    },
  };
}

/** acao "cupom": só calcula. Não grava nada e não avisa ninguém. */
async function calcularCupom(b: Record<string, unknown>) {
  const lidos = lerItens(b.itens);
  if ("resp" in lidos) return lidos.resp;
  if (lidos.pedidos.size === 0) {
    return erro(422, "sem_itens", "Adicione ao menos um peixe ao pedido para usar o cupom.");
  }
  const calc = await calcularLinhas(lidos.pedidos);
  if ("resp" in calc) return calc.resp;
  const totalOriginal = arred2(calc.linhas.reduce((s, l) => s + l.subtotal, 0));

  const r = await aplicarCupom(b.cupom, totalOriginal);
  if ("resp" in r) return r.resp;
  return json(200, { ok: true, ...r.cupom });
}

// ---------- pedido / cadastro de envio ----------
async function criarPedido(b: Record<string, unknown>) {
  // honeypot: robôs preenchem, pessoas não veem o campo. Responde "ok" sem gravar nada.
  if (limpar(b.website, 100)) return json(200, { ok: true, numero: 0, whatsapp_url: null });

  if (b.consentimento !== true) {
    return erro(422, "sem_consentimento", "É preciso concordar com o uso dos dados para entrega para continuar.");
  }

  const cliente = (b.cliente ?? {}) as Record<string, unknown>;
  const entrega = (b.entrega ?? {}) as Record<string, unknown>;

  const nome = limpar(cliente.nome, 120);
  if (nome.split(" ").filter((p) => p.length > 0).length < 2) {
    return erro(422, "nome_invalido", "Informe o nome completo.");
  }
  const telefone = normalizarTelefone(cliente.telefone);
  if (!telefone) return erro(422, "telefone_invalido", "Informe um WhatsApp válido, com DDD.");

  const email = limpar(cliente.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return erro(422, "email_invalido", "O e-mail informado não parece válido.");
  }

  // CPF/CNPJ é obrigatório (decisão do Juan, 2026-09-30): nota fiscal e cadastro de envio.
  const doc = soDigitos(cliente.cpf_cnpj);
  if (!doc) return erro(422, "documento_obrigatorio", "Informe o CPF ou CNPJ: ele é necessário para a nota fiscal e o envio.");
  const docOk = (doc.length === 11 && validarCpf(doc)) || (doc.length === 14 && validarCnpj(doc));
  if (!docOk) return erro(422, "documento_invalido", "CPF ou CNPJ inválido. Confira os números.");

  const pedidoTipo = limpar(entrega.tipo, 15);
  let tipoEntrega: "envio" | "transportadora" | "retirada" = pedidoTipo === "retirada"
    ? "retirada"
    : pedidoTipo === "transportadora"
    ? "transportadora"
    : "envio";
  const cep = soDigitos(entrega.cep);
  const rua = limpar(entrega.rua, 150);
  const numeroEnd = limpar(entrega.numero, 20);
  const complemento = limpar(entrega.complemento, 80);
  const bairro = limpar(entrega.bairro, 80);
  const cidade = limpar(entrega.cidade, 80);
  const uf = limpar(entrega.uf, 2).toUpperCase();
  const referencia = limpar(entrega.referencia, 150);

  // CEP sem entrega na residência (tabela entrega_restricoes): vira retirada na transportadora, mesmo que o
  // navegador tenha mandado "envio".
  let avisoRestricao = "";
  if (tipoEntrega === "envio" && cep.length === 8) {
    const { data: faixas } = await supabase
      .from("entrega_restricoes")
      .select("observacao")
      .eq("ativo", true)
      .lte("cep_inicio", cep)
      .gte("cep_fim", cep)
      .limit(1);
    if (faixas && faixas.length > 0) {
      tipoEntrega = "transportadora";
      avisoRestricao = "CEP sem entrega na residência: convertido para retirada na transportadora." +
        (faixas[0].observacao ? ` (${faixas[0].observacao})` : "");
    }
  }

  if (tipoEntrega === "envio") {
    if (cep.length !== 8) return erro(422, "cep_invalido", "Informe o CEP com 8 dígitos.");
    if (!rua || !numeroEnd || !bairro || !cidade) {
      return erro(422, "endereco_incompleto", "Preencha rua, número, bairro e cidade.");
    }
    if (!UF.has(uf)) return erro(422, "uf_invalida", "Selecione o estado.");
  } else if (tipoEntrega === "transportadora") {
    // Na retirada em transportadora só precisamos do CEP, da cidade e do estado para indicar a unidade mais próxima.
    if (cep.length !== 8) return erro(422, "cep_invalido", "Informe o CEP com 8 dígitos.");
    if (!cidade) return erro(422, "endereco_incompleto", "Informe a cidade.");
    if (!UF.has(uf)) return erro(422, "uf_invalida", "Selecione o estado.");
  }

  // ---- itens (opcional: sem itens = "cadastro para envio" de quem combinou a compra pelo WhatsApp)
  const lidos = lerItens(b.itens);
  if ("resp" in lidos) return lidos.resp;
  const calc = await calcularLinhas(lidos.pedidos);
  if ("resp" in calc) return calc.resp;
  const linhas = calc.linhas;
  const total = arred2(linhas.reduce((s, l) => s + l.subtotal, 0)); // total de tabela (já com promoção por item)
  const soCadastro = linhas.length === 0;

  // ---- cupom (opcional; sem itens não há o que descontar). Cupom inválido/expirado recusa o pedido: o cliente
  // esperava o desconto e decide se segue sem ele.
  let cupom: CupomAplicado | null = null;
  if (!soCadastro && limpar(b.cupom, 30)) {
    const r = await aplicarCupom(b.cupom, total);
    if ("resp" in r) return r.resp;
    cupom = r.cupom;
  }
  const desconto = cupom?.desconto ?? 0;
  const totalFinal = cupom?.total_final ?? total;

  // ---- limite de pedidos por telefone/hora
  const variantes = variantesTelefone(telefone);
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("vendas")
    .select("id", { count: "exact", head: true })
    .in("telefone", variantes)
    .gte("criado_em", desde);
  if ((count ?? 0) >= MAX_PEDIDOS_POR_HORA) {
    return erro(429, "muitas_tentativas", "Recebemos vários pedidos deste número na última hora. Fale com a gente pelo WhatsApp.");
  }

  // ---- indicação
  const codIndRaw = limpar(b.codigo_indicacao, 30).toUpperCase();
  const codInd = /^[A-Z0-9-]{4,30}$/.test(codIndRaw) ? codIndRaw : "";
  let indicacaoId: string | null = null;
  if (codInd) {
    const { data: ind } = await supabase
      .from("indicacoes")
      .select("id, expira_em, status")
      .eq("codigo", codInd)
      .maybeSingle();
    if (ind && (!ind.expira_em || new Date(ind.expira_em) > new Date()) && ind.status === "enviada") {
      indicacaoId = ind.id;
    }
  }

  // ---- contato (casa por telefone nas duas formas: com e sem o 9º dígito)
  const utm = limparUtm(b.utm);
  const origem = classificarOrigem(utm, !!indicacaoId);
  const agora = new Date().toISOString();
  const marketing = b.marketing_opt_in === true;

  const { data: existentes } = await supabase
    .from("contatos")
    .select("*")
    .or(`telefone.in.(${variantes.join(",")}),wa_id.in.(${variantes.join(",")})`)
    .limit(1);
  let contato = existentes?.[0];

  if (contato) {
    const upd: Record<string, unknown> = { ultima_interacao_em: agora };
    if (!contato.nome) upd.nome = nome;
    if (!contato.telefone) upd.telefone = telefone;
    if (!contato.email && email) upd.email = email;
    if (!contato.cidade && cidade) upd.cidade = cidade;
    if (!contato.cep && cep) upd.cep = cep;
    if (!contato.origem) upd.origem = origem;
    if (marketing && !contato.consentimento_marketing) {
      upd.consentimento_marketing = true;
      upd.consentimento_em = agora;
    }
    if (contato.status_lead !== "cliente") upd.status_lead = soCadastro ? contato.status_lead ?? "novo" : "qualificado";
    await supabase.from("contatos").update(upd).eq("id", contato.id);
  } else {
    const { data: novo, error: eC } = await supabase
      .from("contatos")
      .insert({
        wa_id: telefone,
        telefone,
        nome,
        email: email || null,
        cidade: cidade || null,
        cep: cep || null,
        origem,
        origem_detalhe: `catalogo_app${utm.source ? `:${utm.source}` : ""}${utm.campaign ? `/${utm.campaign}` : ""}`,
        utm_source: utm.source ?? null,
        utm_medium: utm.medium ?? null,
        utm_campaign: utm.campaign ?? null,
        utm_content: utm.content ?? null,
        status_lead: soCadastro ? "novo" : "qualificado",
        consentimento_marketing: marketing,
        consentimento_em: marketing ? agora : null,
        primeiro_contato_em: agora,
        ultima_interacao_em: agora,
        etapa: soCadastro ? "novo" : "aguardando_humano",
        modo: "humano", // quem veio do site já está no fluxo de fechamento humano; o bot não abre conversa sozinho
      })
      .select("*")
      .single();
    if (eC || !novo) return erro(500, "erro_contato", "Não foi possível registrar seus dados agora. Tente pelo WhatsApp.");
    contato = novo;
  }

  // ---- venda
  const enderecoCompleto = [
    rua ? `${rua}${numeroEnd ? `, ${numeroEnd}` : ""}` : "",
    complemento,
    bairro,
    cidade ? `${cidade}${uf ? `/${uf}` : ""}` : "",
    cep ? `CEP ${fmtCep(cep)}` : "",
  ].filter(Boolean).join(" - ");
  const enderecoTexto = tipoEntrega === "retirada"
    ? "Retirada no local"
    : tipoEntrega === "transportadora"
    ? `Retirada na transportadora mais próxima do CEP ${fmtCep(cep)} (${cidade}/${uf})${enderecoCompleto && rua ? ` - endereço informado: ${enderecoCompleto}` : ""}`
    : enderecoCompleto;

  const obs = [
    limpar(b.observacoes, 500),
    avisoRestricao,
    codInd && !indicacaoId ? `Código de indicação informado (não localizado ou expirado): ${codInd}` : "",
  ].filter(Boolean).join(" | ");

  const { data: venda, error: eV } = await supabase
    .from("vendas")
    .insert({
      contato_id: contato.id,
      nome_completo: nome,
      endereco: enderecoTexto,
      cpf: doc || null,
      itens: linhas,
      valor_total: soCadastro ? null : totalFinal, // total FINAL (já com o desconto do cupom, se houver)
      cupom: cupom ? cupom.codigo : null,
      desconto: cupom ? desconto : null,
      status: soCadastro ? "cadastro_recebido" : "aguardando_pagamento",
      origem: "catalogo_app",
      origem_pedido: soCadastro ? "cadastro_envio" : "catalogo_app",
      indicacao_codigo: indicacaoId ? codInd : null,
      telefone,
      email: email || null,
      entrega_tipo: tipoEntrega,
      endereco_detalhe: tipoEntrega !== "retirada"
        ? { cep, rua, numero: numeroEnd, complemento, bairro, cidade, uf, referencia }
        : null,
      cidade: cidade || null,
      uf: uf || null,
      cep: cep || null,
      observacoes: obs || null,
      consentimento_em: agora,
      utm,
    })
    .select("id, numero")
    .single();
  if (eV || !venda) return erro(500, "erro_pedido", "Não foi possível registrar o pedido agora. Tente pelo WhatsApp.");

  if (indicacaoId) {
    await supabase
      .from("indicacoes")
      .update({ indicado_contato_id: contato.id, indicado_nome: nome, indicado_telefone: telefone })
      .eq("id", indicacaoId)
      .is("indicado_contato_id", null);
  }

  // Trecho de texto reaproveitado no resumo da equipe e nas mensagens (só aparece quando há cupom).
  const textoDesconto = cupom
    ? `Subtotal: ${brl(total)}\nCupom ${cupom.codigo} (${cupom.percentual}%): -${brl(desconto)}\n`
    : "";

  if (!soCadastro) {
    // Cai na mesma fila de atendimento humano que o bot usa (tabela `handoffs`).
    await supabase.from("handoffs").insert({
      contato_id: contato.id,
      motivo: "pronto_para_fechar",
      resumo: `Pedido nº ${venda.numero} pelo catálogo online: ` +
        linhas.map((l) => `${l.quantidade}x ${l.nome}`).join(", ") +
        (cupom ? `. Cupom ${cupom.codigo} (${cupom.percentual}%): desconto de ${brl(desconto)} sobre ${brl(total)}` : "") +
        `. Total ${brl(totalFinal)}. ` +
        (tipoEntrega === "transportadora"
          ? `Retirada na transportadora (CEP ${fmtCep(cep)}, ${cidade}/${uf}): definir qual.`
          : tipoEntrega === "retirada"
          ? "Retirada no local."
          : `Entrega em ${cidade}/${uf}.`),
    });
  }

  await supabase.from("eventos_site").insert({
    tipo: "pedido_enviado",
    sessao: limpar(b.sessao, 64) || null,
    path: "/entrega",
    utm,
    referrer: limpar(b.referrer, 200) || null,
  });

  // ---- link do WhatsApp com a mensagem pronta (o CPF/CNPJ fica só no CRM, nunca vai na mensagem)
  const primeiroNome = nome.split(" ")[0];
  const recebimento = tipoEntrega === "retirada"
    ? "Retirada no local (São José do Rio Preto)"
    : tipoEntrega === "transportadora"
    ? `Retirada na transportadora mais próxima do CEP ${fmtCep(cep)} (${cidade}/${uf}). Qual transportadora: a confirmar.`
    : "Entrega no endereço";
  const blocoCliente = [
    `Nome: ${nome}`,
    `WhatsApp: ${fmtTelefone(telefone)}`,
    email ? `E-mail: ${email}` : "",
    `Recebimento: ${recebimento}`,
    tipoEntrega === "retirada" ? "" : `Endereço: ${enderecoCompleto || `CEP ${fmtCep(cep)} - ${cidade}/${uf}`}`,
    referencia ? `Referência: ${referencia}` : "",
    obs ? `Observações: ${obs}` : "",
  ].filter(Boolean).join("\n");
  const texto = soCadastro
    ? `Olá! Aqui é ${primeiroNome}. Enviei meus dados de entrega pelo site da Aquacarpas (cadastro nº ${venda.numero}).\n\n${blocoCliente}\n\nPodemos seguir com o meu pedido?`
    : `Olá! Aqui é ${primeiroNome}. Fiz o pedido nº ${venda.numero} pelo catálogo da Aquacarpas.\n\nPeixes:\n` +
      linhas.map((l) => `- ${l.quantidade}x ${l.nome} (${brl(l.subtotal)})`).join("\n") +
      `\n${textoDesconto}Total dos peixes: ${brl(totalFinal)} (frete a combinar).\n\n${blocoCliente}\n\nQuero combinar o pagamento e o envio.`;

  // ---- aviso para a equipe (sem o CPF/CNPJ); roda em segundo plano para não atrasar a resposta ao cliente
  const aviso = [
    `${soCadastro ? "Novo cadastro de envio" : "Novo pedido"} nº ${venda.numero} (catálogo online)`,
    ...(soCadastro
      ? []
      : [
        "",
        ...linhas.map((l) => `${l.quantidade}x ${l.nome} (${brl(l.subtotal)})`),
        (cupom ? `Cupom ${cupom.codigo} (${cupom.percentual}%): -${brl(desconto)} sobre ${brl(total)}\n` : "") +
        `Total dos peixes: ${brl(totalFinal)} (frete a combinar)`,
      ]),
    "",
    blocoCliente,
  ].join("\n");
  const envio = avisarEquipe(aviso);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(envio);
  else await envio;

  return json(200, {
    ok: true,
    numero: venda.numero,
    tipo: soCadastro ? "cadastro" : "pedido",
    entrega_tipo: tipoEntrega,
    convertido_para_transportadora: avisoRestricao !== "",
    // `total` continua sendo o valor cobrado (agora o total final); os campos novos detalham o cupom.
    total: soCadastro ? null : totalFinal,
    total_original: soCadastro ? null : total,
    total_final: soCadastro ? null : totalFinal,
    desconto: soCadastro ? null : desconto,
    cupom: cupom ? cupom.codigo : null,
    percentual: cupom ? cupom.percentual : null,
    itens: linhas.map((l) => ({ codigo: l.codigo, nome: l.nome, quantidade: l.quantidade, subtotal: l.subtotal })),
    whatsapp_url: `https://wa.me/${WHATSAPP_ATENDIMENTO}?text=${encodeURIComponent(texto)}`,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erro(405, "metodo", "Método não permitido.");

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 20_000) return erro(413, "muito_grande", "Requisição grande demais.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erro(400, "json_invalido", "Requisição inválida.");
  }

  try {
    if (body.acao === "evento") return await registrarEvento(body);
    if (body.acao === "cupom") return await calcularCupom(body);
    if (body.acao === "pedido") return await criarPedido(body);
    return erro(400, "acao_invalida", "Ação não reconhecida.");
  } catch (e) {
    // Nunca logar o corpo da requisição: pode conter CPF e endereço.
    console.error("catalogo-api falhou:", e instanceof Error ? e.message : "erro desconhecido");
    return erro(500, "erro_interno", "Algo deu errado. Tente novamente ou fale pelo WhatsApp.");
  }
});
