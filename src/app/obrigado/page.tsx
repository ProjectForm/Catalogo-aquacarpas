"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ObrigadoOnline } from "@/components/ObrigadoOnline";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { ABRIR_WHATSAPP_AUTOMATICO, SITE } from "@/lib/config";
import { brl } from "@/lib/format";
import { registrarLead } from "@/lib/pixels";
import { evento } from "@/lib/tracking";

interface Ultimo {
  numero: number;
  tipo: "pedido" | "cadastro";
  entrega_tipo?: "envio" | "transportadora" | "retirada";
  total: number | null;
  /** Campos do cupom (Black Friday): vêm da função catalogo-api; ausentes em pedidos antigos ou sem cupom. */
  total_original?: number | null;
  total_final?: number | null;
  desconto?: number | null;
  cupom?: string | null;
  percentual?: number | null;
  /** Frete calculado pelo servidor (pedidos a partir do mínimo, em cidade atendida); null = a combinar pelo WhatsApp. */
  frete?: number | null;
  frete_gratis?: boolean | null;
  caixas?: number | null;
  total_pagar?: number | null;
  polo_cidade?: string | null;
  itens: { codigo: string; nome: string; quantidade: number; subtotal: number }[];
  whatsapp_url: string | null;
}

/** Pedido pago no site (link com n + t) usa a tela nova; o fluxo antigo (WhatsApp) segue igual. */
function Conteudo() {
  const params = useSearchParams();
  const n = params.get("n");
  const t = params.get("t");
  if (t && n && Number.isFinite(Number(n))) return <ObrigadoOnline n={Number(n)} t={t} />;
  return <ConteudoWhatsApp />;
}

function ConteudoWhatsApp() {
  const n = useSearchParams().get("n");
  const [u, setU] = useState<Ultimo | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const jaAbriu = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("aq_ultimo");
      if (raw) setU(JSON.parse(raw) as Ultimo);
    } catch {
      /* sem storage: mostramos a versão genérica */
    }
  }, []);

  // Cadastro/pedido enviado: "Lead" na Meta (uma vez por número; só o valor, nada pessoal).
  useEffect(() => {
    if (u) registrarLead(u.numero, u.total_pagar ?? u.total);
  }, [u]);

  // Abre o WhatsApp da Aquacarpas com os dados do cliente já escritos. O cliente só toca em enviar.
  // Abre uma vez por pedido (se ele voltar para esta página, não redireciona de novo).
  useEffect(() => {
    if (!ABRIR_WHATSAPP_AUTOMATICO || !u?.whatsapp_url || jaAbriu.current) return;
    const chave = `aq_wa_aberto_${u.numero}`;
    try {
      if (sessionStorage.getItem(chave)) return;
    } catch {
      /* ignora */
    }
    jaAbriu.current = true;
    setAbrindo(true);
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(chave, "1");
      } catch {
        /* ignora */
      }
      evento("clique_whatsapp");
      window.location.href = u.whatsapp_url as string;
    }, 2200);
    return () => clearTimeout(t);
  }, [u]);

  const numero = u?.numero ?? (n ? Number(n) : null);
  const cadastro = u?.tipo === "cadastro";
  const whats = u?.whatsapp_url ?? `https://wa.me/${SITE.whatsapp}`;
  const transportadora = u?.entrega_tipo === "transportadora";

  return (
    <div className="pagina">
      <div className="container obrigado">
        <p className="eyebrow">{cadastro ? "Cadastro recebido" : "Pedido recebido"}</p>
        <h1>{numero ? `Recebemos o seu ${cadastro ? "cadastro" : "pedido"} nº ${numero}` : "Recebemos os seus dados"}</h1>
        <p className="intro">
          Os seus dados já estão no nosso cadastro. O último passo é enviar a mensagem pelo WhatsApp para a nossa equipe, que já vai
          com tudo escrito: você só precisa tocar em enviar.
        </p>

        {abrindo ? (
          <p className="aviso" role="status">Abrindo o WhatsApp com os seus dados... Se não abrir, use o botão abaixo.</p>
        ) : null}

        {u && u.itens.length > 0 ? (
          <div className="card-info" style={{ marginTop: 28 }}>
            <h3>Resumo</h3>
            {u.itens.map((i) => (
              <p key={i.codigo}>
                {i.quantidade}x {i.nome} — {brl(i.subtotal)}
              </p>
            ))}
            {(u.cupom && u.desconto && u.desconto > 0) || (u.frete !== null && u.frete !== undefined) ? (
              <div className="subtotais" style={{ marginTop: 10 }}>
                <div>
                  <span>Subtotal</span>
                  <span>{brl(u.total_original ?? u.total ?? 0)}</span>
                </div>
                {u.cupom && u.desconto && u.desconto > 0 ? (
                  <div className="desconto">
                    <span>Cupom {u.cupom}{u.percentual ? ` · ${u.percentual}%` : ""}</span>
                    <span>−{brl(u.desconto)}</span>
                  </div>
                ) : null}
                {u.frete !== null && u.frete !== undefined ? (
                  <div className={u.frete_gratis ? "desconto" : undefined}>
                    <span>Frete{u.caixas ? ` · ${u.caixas} ${u.caixas === 1 ? "caixa" : "caixas"}` : ""}</span>
                    <span>{u.frete_gratis ? "Grátis" : brl(u.frete)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {u.total_final != null || u.total !== null ? (
              u.frete !== null && u.frete !== undefined && u.total_pagar != null ? (
                <div className="total destaque" style={{ marginTop: 10 }}>
                  <span>Total do pedido</span>
                  <strong>{brl(u.total_pagar)}</strong>
                </div>
              ) : (
                <div className={`total${u.cupom ? " destaque" : ""}`} style={{ marginTop: 10 }}>
                  <span>Total dos peixes <small className="suave">(frete não incluso)</small></span>
                  <strong>{brl((u.total_final ?? u.total) as number)}</strong>
                </div>
              )
            ) : null}
          </div>
        ) : null}

        <p style={{ marginTop: 28 }}>
          <WhatsAppLink href={whats} className="btn btn-primario">
            Enviar meus dados pelo WhatsApp
          </WhatsAppLink>
        </p>

        <ol className="passos">
          <li>
            {u?.polo_cidade
              ? `Confirmamos a disponibilidade dos peixes e informamos o local de retirada em ${u.polo_cidade}.`
              : transportadora
              ? "Confirmamos a disponibilidade dos peixes e informamos a transportadora mais próxima do seu CEP, onde será a retirada."
              : u?.frete !== null && u?.frete !== undefined
              ? "Confirmamos a disponibilidade dos peixes e o frete calculado para a sua cidade."
              : "Confirmamos a disponibilidade dos peixes e o valor do frete para a sua cidade."}
          </li>
          <li>Combinamos o pagamento por Pix ou cartão (Mercado Pago, com juros).</li>
          <li>
            O peixe fica de 1 a 2 dias em jejum antes de viajar e segue no envio de segunda a quinta. Entrega em até 3 dias
            úteis, já contando o jejum.
          </li>
        </ol>

        <Link href="/" className="btn btn-contorno">Voltar ao catálogo</Link>
      </div>
    </div>
  );
}

export default function Obrigado() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
