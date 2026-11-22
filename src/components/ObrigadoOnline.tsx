"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { conferirPagamento, statusPedido } from "@/lib/checkout";
import type { StatusPedido } from "@/lib/checkout";
import { linkWhatsApp } from "@/lib/config";
import { brl } from "@/lib/format";
import { registrarCompra } from "@/lib/pixels";
import { evento } from "@/lib/tracking";

/**
 * /obrigado para pedidos pagos no site. Quando a pessoa volta da InfinitePay, o endereço traz transaction_nsu e slug:
 * conferimos o pagamento na hora (sem esperar o webhook) e depois seguimos perguntando ao servidor por cerca de 1 minuto.
 */
export function ObrigadoOnline({ n, t }: { n: number; t: string }) {
  const params = useSearchParams();
  const [pedido, setPedido] = useState<StatusPedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativas, setTentativas] = useState(0);
  const conferiu = useRef(false);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function ciclo(vez: number) {
      // Primeira volta da InfinitePay: confirma o pagamento direto no servidor.
      const nsu = params.get("transaction_nsu");
      const slug = params.get("slug");
      if (!conferiu.current && nsu && slug) {
        conferiu.current = true;
        await conferirPagamento(n, t, nsu, slug);
      }
      const r = await statusPedido(n, t);
      if (!vivo) return;
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setPedido(r.dados);
      setTentativas(vez + 1);
      if (!r.dados.pago && vez < 14) timer = setTimeout(() => void ciclo(vez + 1), 4000);
    }
    void ciclo(0);
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [n, t, params]);

  // Pagamento confirmado: "Purchase" na Meta e evento próprio, uma vez por pedido (só o número e o valor, nada pessoal).
  const pedidoPago = Boolean(pedido?.pago);
  const valorPago = pedido?.total_pagar ?? 0;
  useEffect(() => {
    if (pedidoPago && valorPago > 0 && registrarCompra(n, valorPago)) evento("compra_confirmada", undefined, { valor: valorPago });
  }, [pedidoPago, valorPago, n]);

  const ajuda = linkWhatsApp(`Olá! Sobre o pedido nº ${n} do catálogo da Aquacarpas.`);

  if (erro) {
    return (
      <div className="pagina">
        <div className="container obrigado">
          <p className="eyebrow">Pedido nº {n}</p>
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
          <p className="eyebrow">Pedido nº {n}</p>
          <h1>Confirmando o seu pagamento...</h1>
        </div>
      </div>
    );
  }

  const total = pedido.total_pagar ?? 0;
  const subtotalPeixes = pedido.itens.reduce((s, i) => s + i.subtotal, 0);
  const retiradaPolo = pedido.entrega_tipo === "transportadora" && pedido.polo_cidade;

  if (!pedido.pago) {
    const aguardando = tentativas < 15;
    return (
      <div className="pagina">
        <div className="container obrigado">
          <p className="eyebrow">Pedido nº {pedido.numero}</p>
          <h1>{aguardando ? "Confirmando o seu pagamento..." : "Ainda não recebemos a confirmação"}</h1>
          <p className="intro">
            {aguardando
              ? "Pagamentos pela InfinitePay costumam ser confirmados em segundos. Pix feito direto na nossa conta é confirmado pela equipe."
              : "Se você já pagou, fique tranquilo: assim que o pagamento for confirmado, a nossa equipe segue com o seu pedido. Se ainda não pagou, volte para a página de pagamento."}
          </p>
          <p style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {!pedido.expirado ? <Link href={`/pagamento?n=${pedido.numero}&t=${t}`} className="btn btn-primario">Voltar ao pagamento</Link> : null}
            <a href={ajuda} className="btn btn-contorno" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pagina">
      <div className="container obrigado">
        <p className="eyebrow">Pagamento confirmado</p>
        <h1>Recebemos o pagamento do pedido nº {pedido.numero}</h1>
        <p className="intro">Obrigado pela confiança. Agora é com a gente: vamos separar os seus peixes com todo o cuidado.</p>

        <div className="card-info" style={{ marginTop: 28 }}>
          <h3>Resumo</h3>
          {pedido.itens.map((i, idx) => (
            <p key={idx}>
              {i.quantidade}x {i.nome} — {brl(i.subtotal)}
            </p>
          ))}
          <div className="subtotais" style={{ marginTop: 10 }}>
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
                <span>Frete</span>
                <span>{pedido.frete_gratis ? "Grátis" : brl(pedido.frete)}</span>
              </div>
            ) : null}
          </div>
          <div className="total destaque" style={{ marginTop: 10 }}>
            <span>Total pago</span>
            <strong>{brl(total)}</strong>
          </div>
        </div>

        <ol className="passos">
          <li>Os peixes ficam de 1 a 2 dias em jejum antes de viajar, para chegarem bem. O jejum já está no prazo de entrega.</li>
          <li>
            {retiradaPolo
              ? `Informamos pelo WhatsApp o local de retirada em ${pedido.polo_cidade}.`
              : pedido.entrega_tipo === "retirada"
              ? "Combinamos pelo WhatsApp o dia e o horário da sua retirada em São José do Rio Preto."
              : "O envio sai de segunda a quinta. Entrega em até 3 dias úteis, já contando o jejum."}
          </li>
          <li>Qualquer dúvida, é só falar com a nossa equipe pelo WhatsApp.</li>
        </ol>

        <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href={linkWhatsApp(`Olá! Paguei o pedido nº ${pedido.numero} pelo catálogo da Aquacarpas.`)} className="btn btn-primario" target="_blank" rel="noopener noreferrer">
            Falar com a equipe no WhatsApp
          </a>
          <Link href="/" className="btn btn-contorno">Voltar ao catálogo</Link>
        </p>
      </div>
    </div>
  );
}
