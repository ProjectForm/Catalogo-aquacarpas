"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { ABRIR_WHATSAPP_AUTOMATICO, SITE } from "@/lib/config";
import { brl } from "@/lib/format";
import { evento } from "@/lib/tracking";

interface Ultimo {
  numero: number;
  tipo: "pedido" | "cadastro";
  entrega_tipo?: "envio" | "transportadora" | "retirada";
  total: number | null;
  itens: { codigo: string; nome: string; quantidade: number; subtotal: number }[];
  whatsapp_url: string | null;
}

function Conteudo() {
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
            {u.total !== null ? <p style={{ marginTop: 8, color: "var(--texto-forte)" }}>Total dos peixes: {brl(u.total)} (frete não incluso)</p> : null}
          </div>
        ) : null}

        <p style={{ marginTop: 28 }}>
          <WhatsAppLink href={whats} className="btn btn-primario">
            Enviar meus dados pelo WhatsApp
          </WhatsAppLink>
        </p>

        <ol className="passos">
          <li>
            {transportadora
              ? "Confirmamos a disponibilidade dos peixes e informamos a transportadora mais próxima do seu CEP, onde será a retirada."
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
