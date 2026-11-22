"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { avisarPagamento, iniciarPagamento, statusPedido } from "@/lib/checkout";
import type { StatusPedido } from "@/lib/checkout";
import { linkWhatsApp } from "@/lib/config";
import { brl } from "@/lib/format";
import { evento } from "@/lib/tracking";
import { ConfiancaPedido } from "./ConfiancaPedido";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** QR code do Pix, gerado no navegador (biblioteca carregada só nesta página). */
function PixQr({ codigo }: { codigo: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void import("qrcode-generator").then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fabrica = ((mod as any).default ?? mod) as (t: 0, l: "M") => {
        addData(s: string): void;
        make(): void;
        createSvgTag(o: { cellSize?: number; margin?: number; scalable?: boolean }): string;
      };
      const qr = fabrica(0, "M");
      qr.addData(codigo);
      qr.make();
      if (vivo) setSvg(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
    });
    return () => {
      vivo = false;
    };
  }, [codigo]);
  return (
    <div className="pix-qr" role="img" aria-label="QR code do Pix">
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="pix-qr-vazio" />}
    </div>
  );
}

export function PagamentoClient() {
  const router = useRouter();
  const params = useSearchParams();
  const n = Number(params.get("n"));
  const t = params.get("t") ?? "";
  const [pedido, setPedido] = useState<StatusPedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const [abrindo, setAbrindo] = useState<"infinitepay" | "aviso" | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const pago = useRef(false);

  const carregar = useCallback(async () => {
    if (!Number.isFinite(n) || n < 1 || !t) {
      setErro("Link de pagamento inválido. Use o link que apareceu ao enviar o pedido.");
      return;
    }
    const r = await statusPedido(n, t);
    if (!r.ok) {
      setErro(r.mensagem);
      return;
    }
    setErro(null);
    setPedido(r.dados);
    if (r.dados.pago && !pago.current) {
      pago.current = true;
      router.replace(`/obrigado?n=${n}&t=${t}`);
    }
  }, [n, t, router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Atualiza sozinha: o pagamento pode ser confirmado a qualquer momento (InfinitePay ou conferência da equipe).
  useEffect(() => {
    if (!pedido || pedido.pago || pedido.expirado || !pedido.pagamento_online) return;
    const poll = setInterval(() => void carregar(), 6000);
    const relogio = setInterval(() => setAgora(Date.now()), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(relogio);
    };
  }, [pedido, carregar]);

  async function copiar(texto: string) {
    evento("pagamento_acao", undefined, { dados: { acao: "pix_copiado" } });
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const el = document.getElementById("pix-codigo") as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  async function pagarInfinitePay() {
    evento("pagamento_acao", undefined, { dados: { acao: "infinitepay" } });
    setAbrindo("infinitepay");
    setMensagem(null);
    const r = await iniciarPagamento(n, t, "infinitepay");
    if (r.ok && r.dados.url) {
      window.location.href = r.dados.url;
      return;
    }
    setAbrindo(null);
    setMensagem(r.ok ? "Não foi possível abrir a InfinitePay agora. Use o Pix ou tente de novo." : r.mensagem);
  }

  async function jaPaguei() {
    evento("pagamento_acao", undefined, { dados: { acao: "ja_paguei" } });
    setAbrindo("aviso");
    const r = await avisarPagamento(n, t);
    setAbrindo(null);
    if (r.ok) {
      setAvisado(true);
      void carregar();
    } else {
      setMensagem(r.mensagem);
    }
  }

  const ajuda = linkWhatsApp(`Olá! Preciso de ajuda com o pagamento do pedido nº ${Number.isFinite(n) ? n : ""} do catálogo da Aquacarpas.`);

  if (erro) {
    return (
      <div className="pagina">
        <div className="container obrigado">
          <p className="eyebrow">Pagamento</p>
          <h1>Não encontramos este pedido</h1>
          <p className="intro">{erro}</p>
          <p style={{ marginTop: 28 }}>
            <a href={ajuda} className="btn btn-primario" target="_blank" rel="noopener noreferrer">Falar com a equipe no WhatsApp</a>
          </p>
        </div>
      </div>
    );
  }
  if (!pedido) {
    return (
      <div className="pagina">
        <div className="container obrigado">
          <p className="eyebrow">Pagamento</p>
          <h1>Carregando o seu pedido...</h1>
        </div>
      </div>
    );
  }
  if (!pedido.pagamento_online) {
    return (
      <div className="pagina">
        <div className="container obrigado">
          <p className="eyebrow">Pedido nº {pedido.numero}</p>
          <h1>Este pedido segue pelo WhatsApp</h1>
          <p className="intro">O pagamento deste pedido é combinado com a nossa equipe.</p>
          <p style={{ marginTop: 28 }}>
            <a href={ajuda} className="btn btn-primario" target="_blank" rel="noopener noreferrer">Falar com a equipe no WhatsApp</a>
          </p>
        </div>
      </div>
    );
  }
  if (pedido.expirado) {
    return (
      <div className="pagina">
        <div className="container obrigado">
          <p className="eyebrow">Pedido nº {pedido.numero}</p>
          <h1>O prazo para pagar terminou</h1>
          <p className="intro">
            Para garantir os peixes para quem está pagando, o pedido só fica aberto por um tempo. Se ainda quiser, refaça o pedido pelo
            catálogo ou fale com a nossa equipe.
          </p>
          <p style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/#catalogo" className="btn btn-primario">Voltar ao catálogo</Link>
            <a href={ajuda} className="btn btn-contorno" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>
          </p>
        </div>
      </div>
    );
  }

  const total = pedido.total_pagar ?? 0;
  const minutosRestantes = pedido.reservado_ate ? Math.max(0, Math.ceil((Date.parse(pedido.reservado_ate) - agora) / 60000)) : null;
  const subtotalPeixes = pedido.itens.reduce((s, i) => s + i.subtotal, 0);
  const retiradaPolo = pedido.entrega_tipo === "transportadora" && pedido.polo_cidade;

  return (
    <div className="pagina">
      <div className="container">
        <p className="eyebrow">Pagamento</p>
        <h1>Pedido nº {pedido.numero}</h1>
        <p className="intro">Falta só o pagamento. Escolha abaixo como prefere pagar; o valor já vem certo.</p>
        {pedido.reservado_ate ? (
          <p className="aviso" role="status">
            {pedido.tem_exemplar_unico ? "Reservamos o seu exemplar" : "O pedido fica aberto para pagamento"} até {hora(pedido.reservado_ate)}
            {minutosRestantes !== null ? ` (restam ${minutosRestantes} min)` : ""}.
          </p>
        ) : null}

        <div className="duas-colunas pagamento-cols">
          <div className="opcoes-pagamento">
            {pedido.metodos.pix && pedido.pix_copia_cola ? (
              <section className="bloco-form">
                <h2>Pix</h2>
                <p className="intro-bloco">
                  Abra o app do seu banco, escolha Pix e leia o QR code ou use o Pix copia e cola. O valor de <strong>{brl(total)}</strong> já vem preenchido.
                </p>
                <div className="pix-grade">
                  <PixQr codigo={pedido.pix_copia_cola} />
                  <div className="pix-lado">
                    <label htmlFor="pix-codigo" className="sr-only">Código Pix copia e cola</label>
                    <textarea id="pix-codigo" className="pix-codigo" readOnly value={pedido.pix_copia_cola} rows={5} onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn btn-primario btn-bloco" onClick={() => void copiar(pedido.pix_copia_cola as string)}>
                      {copiado ? "Código copiado" : "Copiar código Pix"}
                    </button>
                    <button type="button" className="btn btn-contorno btn-bloco" onClick={() => void jaPaguei()} disabled={abrindo === "aviso" || avisado}>
                      {avisado ? "Equipe avisada" : abrindo === "aviso" ? "Enviando..." : "Já fiz o pagamento"}
                    </button>
                  </div>
                </div>
                <p className="ajuda-pix" role="status">
                  {avisado
                    ? "Avisamos a nossa equipe. Assim que o pagamento for confirmado, esta página atualiza sozinha."
                    : "A nossa equipe confirma o Pix na conta e esta página atualiza sozinha. Se já pagou, toque em “Já fiz o pagamento”."}
                </p>
              </section>
            ) : null}

            {pedido.metodos.infinitepay ? (
              <section className="bloco-form">
                <h2>Cartão ou Pix pela InfinitePay</h2>
                <p className="intro-bloco">
                  Pagamento em ambiente seguro da InfinitePay: cartão de crédito (parcelado, com juros) ou Pix. A confirmação é automática.
                </p>
                <button type="button" className="btn btn-contorno btn-bloco" onClick={() => void pagarInfinitePay()} disabled={abrindo === "infinitepay"}>
                  {abrindo === "infinitepay" ? "Abrindo a InfinitePay..." : "Pagar pela InfinitePay"}
                </button>
              </section>
            ) : null}

            {mensagem ? <p className="erro-form" role="alert">{mensagem}</p> : null}
            <p className="ajuda-pix">
              Dúvidas ou prefere combinar de outro jeito?{" "}
              <a href={ajuda} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Fale com a nossa equipe no WhatsApp</a>.
            </p>
          </div>

          <aside className="resumo" aria-label="Resumo do pedido">
            <h2>Resumo</h2>
            {pedido.itens.map((i, idx) => (
              <div className="linha-item sem-foto" key={idx}>
                <div>
                  <div className="nome">{i.quantidade}x {i.nome}</div>
                </div>
                <div className="valor">{brl(i.subtotal)}</div>
              </div>
            ))}
            <div className="subtotais">
              <div>
                <span>Subtotal</span>
                <span>{brl(subtotalPeixes)}</span>
              </div>
              {pedido.cupom && pedido.desconto ? (
                <div className="desconto">
                  <span>Cupom {pedido.cupom}</span>
                  <span>−{brl(pedido.desconto)}</span>
                </div>
              ) : null}
              {pedido.frete !== null ? (
                <div className={pedido.frete_gratis ? "desconto" : undefined}>
                  <span>Frete{pedido.caixas ? ` · ${pedido.caixas} ${pedido.caixas === 1 ? "caixa" : "caixas"}` : ""}</span>
                  <span>{pedido.frete_gratis ? "Grátis" : brl(pedido.frete)}</span>
                </div>
              ) : null}
            </div>
            <div className="total destaque">
              <span>Total a pagar</span>
              <strong>{brl(total)}</strong>
            </div>
            <ConfiancaPedido online />
            <p className="nota">
              {retiradaPolo
                ? `Retirada em ${pedido.polo_cidade}: nossa equipe informa o local pelo WhatsApp. `
                : pedido.entrega_tipo === "retirada"
                ? "Retirada no local, em São José do Rio Preto. "
                : pedido.cidade
                ? `Entrega em ${pedido.cidade}/${pedido.uf}. `
                : ""}
              Entrega em até 3 dias úteis, já contando o jejum pré-envio.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
