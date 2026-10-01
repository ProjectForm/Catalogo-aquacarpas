"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { precoUnitario } from "@/lib/catalogo";
import { API_URL, POLITICAS, RETIRADA, SUPABASE_ANON_KEY } from "@/lib/config";
import { carregarRestricoes, restricaoDoCep } from "@/lib/entrega";
import type { Restricao, TipoEntrega } from "@/lib/entrega";
import { ESTADOS, brl, documentoValido, mascaraCep, mascaraDocumento, mascaraTelefone, somenteDigitos } from "@/lib/format";
import { capturarUtm, evento, sessaoId, utmAtual } from "@/lib/tracking";
import { useCart } from "./CartProvider";

interface Dados {
  nome: string;
  telefone: string;
  email: string;
  documento: string;
  tipo: TipoEntrega;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  referencia: string;
  observacoes: string;
  codigoIndicacao: string;
  consentimento: boolean;
  marketing: boolean;
  website: string; // honeypot: pessoas não veem, robôs preenchem
}

const VAZIO: Dados = {
  nome: "", telefone: "", email: "", documento: "", tipo: "envio", cep: "", rua: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", referencia: "", observacoes: "", codigoIndicacao: "", consentimento: false, marketing: false, website: "",
};

export function EntregaForm() {
  const router = useRouter();
  const { itens, total, pronto, definirQuantidade, remover, limpar } = useCart();
  const [d, setD] = useState<Dados>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const iniciou = useRef(false);

  const [restricoes, setRestricoes] = useState<Restricao[]>([]);

  useEffect(() => {
    const utm = capturarUtm();
    if (utm.ref) setD((x) => ({ ...x, codigoIndicacao: utm.ref!.toUpperCase() }));
    void carregarRestricoes().then(setRestricoes);
  }, []);

  // CEP que não recebe entrega na residência: o cadastro passa sozinho para "retirada na transportadora".
  const restricao = useMemo(() => restricaoDoCep(somenteDigitos(d.cep), restricoes), [d.cep, restricoes]);
  useEffect(() => {
    if (restricao) setD((x) => (x.tipo === "envio" ? { ...x, tipo: "transportadora" } : x));
  }, [restricao]);

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => setD((x) => ({ ...x, [k]: v }));
  const soCadastro = itens.length === 0;

  function primeiroFoco() {
    if (iniciou.current) return;
    iniciou.current = true;
    evento("iniciou_cadastro");
  }

  async function buscarCep(valor: string) {
    const cep = somenteDigitos(valor);
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (!j.erro) {
        setD((x) => ({ ...x, rua: j.logradouro || x.rua, bairro: j.bairro || x.bairro, cidade: j.localidade || x.cidade, uf: j.uf || x.uf }));
      }
    } catch {
      /* sem internet no ViaCEP: a pessoa preenche na mão */
    } finally {
      setBuscandoCep(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!documentoValido(d.documento)) {
      setErro("CPF ou CNPJ inválido. Confira os números.");
      return;
    }
    if (!d.consentimento) {
      setErro("Marque a autorização de uso dos dados para continuar.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          acao: "pedido",
          consentimento: d.consentimento,
          marketing_opt_in: d.marketing,
          website: d.website,
          sessao: sessaoId(),
          utm: utmAtual(),
          referrer: document.referrer ? new URL(document.referrer).hostname : "",
          codigo_indicacao: d.codigoIndicacao,
          observacoes: d.observacoes,
          cliente: { nome: d.nome, telefone: d.telefone, email: d.email, cpf_cnpj: somenteDigitos(d.documento) },
          entrega: {
            tipo: d.tipo, cep: d.cep, rua: d.rua, numero: d.numero, complemento: d.complemento,
            bairro: d.bairro, cidade: d.cidade, uf: d.uf, referencia: d.referencia,
          },
          itens: itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setErro(j?.mensagem ?? "Não foi possível enviar agora. Tente novamente ou fale com a gente pelo WhatsApp.");
        return;
      }
      try {
        sessionStorage.setItem("aq_ultimo", JSON.stringify(j));
      } catch {
        /* segue mesmo sem storage */
      }
      limpar();
      router.push(`/obrigado?n=${j.numero}`);
    } catch {
      setErro("Sem conexão com o servidor. Tente novamente ou fale com a gente pelo WhatsApp.");
    } finally {
      setEnviando(false);
    }
  }

  const envio = d.tipo === "envio";
  const transportadora = d.tipo === "transportadora";
  const comEndereco = envio || transportadora;

  return (
    <div className="duas-colunas" id="cadastro">
      <form className="form" onSubmit={enviar} onFocus={primeiroFoco} noValidate={false}>
        <div className="honey" aria-hidden="true">
          <label>
            Não preencha este campo
            <input type="text" tabIndex={-1} autoComplete="off" value={d.website} onChange={(e) => set("website", e.target.value)} />
          </label>
        </div>

        <section className="bloco-form">
          <h2>Seus dados</h2>
          <div className="campos">
            <div className="campo">
              <label htmlFor="nome">Nome completo</label>
              <input id="nome" name="nome" autoComplete="name" required minLength={5} maxLength={120} value={d.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="campo m3">
              <label htmlFor="telefone">WhatsApp com DDD</label>
              <input id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="(17) 90000-0000" value={d.telefone} onChange={(e) => set("telefone", mascaraTelefone(e.target.value))} />
            </div>
            <div className="campo m3">
              <label htmlFor="email">E-mail <span className="opcional">(opcional)</span></label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={120} value={d.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="campo m3">
              <label htmlFor="documento">CPF ou CNPJ</label>
              <input id="documento" name="documento" inputMode="numeric" autoComplete="off" required value={d.documento} onChange={(e) => set("documento", mascaraDocumento(e.target.value))} />
              <span className="ajuda">Usado na nota fiscal e no cadastro de envio.</span>
            </div>
          </div>
        </section>

        <section className="bloco-form">
          <h2>Como quer receber</h2>
          <div className="escolhas tres" role="radiogroup" aria-label="Forma de recebimento">
            <label className={`escolha${restricao ? " desativada" : ""}`}>
              <input type="radio" name="tipo" checked={envio} disabled={Boolean(restricao)} onChange={() => set("tipo", "envio")} />
              <div>
                <strong>Entrega no meu endereço</strong>
                <span>Entrega em até 3 dias úteis, já com o jejum pré-envio.</span>
              </div>
            </label>
            <label className="escolha">
              <input type="radio" name="tipo" checked={transportadora} onChange={() => set("tipo", "transportadora")} />
              <div>
                <strong>Retirada na transportadora</strong>
                <span>Na mais próxima do seu CEP. Para CEPs sem entrega na residência.</span>
              </div>
            </label>
            <label className="escolha">
              <input type="radio" name="tipo" checked={d.tipo === "retirada"} onChange={() => set("tipo", "retirada")} />
              <div>
                <strong>Retirada no local</strong>
                <span>São José do Rio Preto. Prazo: {RETIRADA.prazo}.</span>
              </div>
            </label>
          </div>

          {restricao ? (
            <p className="aviso" style={{ marginTop: 0 }} role="status">
              Para este CEP não é possível entregar diretamente na residência. A retirada é na transportadora mais próxima do seu CEP.
              {restricao.observacao ? ` ${restricao.observacao}` : ""} Nossa equipe confirma qual é pelo WhatsApp.
            </p>
          ) : transportadora ? (
            <p className="aviso" style={{ marginTop: 0 }}>
              {POLITICAS.transportadora.texto}
            </p>
          ) : null}

          {comEndereco ? (
            <div className="campos">
              <div className="campo m2">
                <label htmlFor="cep">CEP</label>
                <input
                  id="cep" name="cep" inputMode="numeric" autoComplete="postal-code" required value={d.cep} placeholder="00000-000"
                  onChange={(e) => {
                    const v = mascaraCep(e.target.value);
                    set("cep", v);
                    if (somenteDigitos(v).length === 8) void buscarCep(v);
                  }}
                />
                <span className="ajuda">{buscandoCep ? "Buscando endereço..." : "Preenchemos o restante pelo CEP."}</span>
              </div>
              <div className="campo m4">
                <label htmlFor="rua">Rua{!envio ? <span className="opcional"> (opcional)</span> : null}</label>
                <input id="rua" name="rua" autoComplete="address-line1" required={envio} maxLength={150} value={d.rua} onChange={(e) => set("rua", e.target.value)} />
              </div>
              <div className="campo m2">
                <label htmlFor="numero">Número{!envio ? <span className="opcional"> (opcional)</span> : null}</label>
                <input id="numero" name="numero" autoComplete="off" required={envio} maxLength={20} value={d.numero} onChange={(e) => set("numero", e.target.value)} />
              </div>
              <div className="campo m4">
                <label htmlFor="complemento">Complemento <span className="opcional">(opcional)</span></label>
                <input id="complemento" name="complemento" autoComplete="address-line2" maxLength={80} value={d.complemento} onChange={(e) => set("complemento", e.target.value)} />
              </div>
              <div className="campo m3">
                <label htmlFor="bairro">Bairro{!envio ? <span className="opcional"> (opcional)</span> : null}</label>
                <input id="bairro" name="bairro" required={envio} maxLength={80} value={d.bairro} onChange={(e) => set("bairro", e.target.value)} />
              </div>
              <div className="campo m3">
                <label htmlFor="cidade">Cidade</label>
                <input id="cidade" name="cidade" autoComplete="address-level2" required maxLength={80} value={d.cidade} onChange={(e) => set("cidade", e.target.value)} />
              </div>
              <div className="campo m2 uf">
                <label htmlFor="uf">Estado</label>
                <select id="uf" name="uf" autoComplete="address-level1" required value={d.uf} onChange={(e) => set("uf", e.target.value)}>
                  <option value="">Selecione</option>
                  {ESTADOS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="campo m4">
                <label htmlFor="referencia">Ponto de referência <span className="opcional">(opcional)</span></label>
                <input id="referencia" name="referencia" maxLength={150} value={d.referencia} onChange={(e) => set("referencia", e.target.value)} />
              </div>
            </div>
          ) : (
            <p className="aviso" style={{ marginTop: 0 }}>{RETIRADA.endereco}</p>
          )}
        </section>

        <section className="bloco-form">
          <h2>Observações</h2>
          <div className="campos">
            <div className="campo">
              <label htmlFor="observacoes">Algo que devemos saber? <span className="opcional">(opcional)</span></label>
              <textarea id="observacoes" name="observacoes" maxLength={500} value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Tamanho do lago, melhor horário para receber, dúvidas..." />
            </div>
            <div className="campo m3">
              <label htmlFor="indicacao">Código de indicação <span className="opcional">(opcional)</span></label>
              <input id="indicacao" name="indicacao" autoComplete="off" maxLength={30} value={d.codigoIndicacao} onChange={(e) => set("codigoIndicacao", e.target.value.toUpperCase())} />
            </div>
          </div>
        </section>

        <section className="bloco-form">
          <label className="marcar">
            <input type="checkbox" required checked={d.consentimento} onChange={(e) => set("consentimento", e.target.checked)} />
            <span>
              Autorizo a Aquacarpas a usar meus dados, inclusive o CPF ou CNPJ, para entrega do pedido, emissão de nota fiscal e contato sobre esta compra.
            </span>
          </label>
          <label className="marcar">
            <input type="checkbox" checked={d.marketing} onChange={(e) => set("marketing", e.target.checked)} />
            <span>Quero receber avisos de novos lotes pelo WhatsApp. <span className="opcional">(opcional)</span></span>
          </label>
          {erro ? <p className="erro-form" role="alert">{erro}</p> : null}
          <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? "Enviando..." : soCadastro ? "Enviar cadastro de envio" : "Enviar pedido"}
          </button>
        </section>
      </form>

      <aside className="resumo" aria-label="Resumo do pedido">
        <h2>Seu pedido</h2>
        {!pronto ? null : soCadastro ? (
          <>
            <p className="vazio">
              Nenhum peixe no pedido. Já combinou a compra pelo WhatsApp? Envie só o cadastro de envio e a nossa equipe segue com você.
              Ainda escolhendo?
            </p>
            <p style={{ marginTop: 14 }}>
              <Link href="/#catalogo" className="btn btn-contorno btn-bloco">Voltar ao catálogo</Link>
            </p>
          </>
        ) : (
          <>
            {itens.map((i) => {
              const unit = precoUnitario(i, i.quantidade);
              return (
                <div className="linha-item" key={i.codigo}>
                  {i.imagem ? <img src={i.imagem} alt="" /> : <span />}
                  <div>
                    <div className="nome">{i.nome}</div>
                    {i.tipo === "lote" ? (
                      <div className="qtd" role="group" aria-label={`Quantidade de ${i.nome}`}>
                        <button type="button" aria-label="Diminuir" onClick={() => definirQuantidade(i.codigo, i.quantidade - 1)} disabled={i.quantidade <= Math.max(i.quantidade_minima, 1)}>-</button>
                        <span>{i.quantidade}</span>
                        <button type="button" aria-label="Aumentar" onClick={() => definirQuantidade(i.codigo, i.quantidade + 1)}>+</button>
                      </div>
                    ) : (
                      <div className="sub">Exemplar único</div>
                    )}
                    <button type="button" className="remover" onClick={() => remover(i.codigo)}>remover</button>
                    {i.preco_promocional !== null && i.promo_qtd_minima > 1 && i.quantidade < i.promo_qtd_minima ? (
                      <div className="sub">
                        {brl(i.preco_promocional)} cada a partir de {i.promo_qtd_minima} unidades
                      </div>
                    ) : null}
                  </div>
                  <div className="valor">{unit !== null ? brl(unit * i.quantidade) : "Consulte"}</div>
                </div>
              );
            })}
            <div className="total">
              <span>Total dos peixes</span>
              <strong>{brl(total)}</strong>
            </div>
            <p className="nota">
              Frete não incluso: nossa equipe informa o valor pelo WhatsApp. Depois de enviar, confirmamos disponibilidade, frete e
              pagamento com você.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
