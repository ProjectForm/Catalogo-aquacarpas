"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { SITE } from "@/lib/config";
import { brl } from "@/lib/format";

interface Ultimo {
  numero: number;
  tipo: "pedido" | "cadastro";
  total: number | null;
  itens: { codigo: string; nome: string; quantidade: number; subtotal: number }[];
  whatsapp_url: string | null;
}

function Conteudo() {
  const n = useSearchParams().get("n");
  const [u, setU] = useState<Ultimo | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("aq_ultimo");
      if (raw) setU(JSON.parse(raw) as Ultimo);
    } catch {
      /* sem storage: mostramos a versão genérica */
    }
  }, []);

  const numero = u?.numero ?? (n ? Number(n) : null);
  const cadastro = u?.tipo === "cadastro";
  const whats = u?.whatsapp_url ?? `https://wa.me/${SITE.whatsapp}`;

  return (
    <div className="pagina">
      <div className="container obrigado">
        <p className="eyebrow">{cadastro ? "Cadastro recebido" : "Pedido recebido"}</p>
        <h1>{numero ? `Recebemos o seu ${cadastro ? "cadastro" : "pedido"} nº ${numero}` : "Recebemos os seus dados"}</h1>
        <p className="intro">
          Obrigado. O próximo passo é a nossa equipe falar com você pelo WhatsApp. Toque no botão abaixo para já deixar a mensagem
          pronta.
        </p>

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
            Falar com a equipe no WhatsApp
          </WhatsAppLink>
        </p>

        <ol className="passos">
          <li>Confirmamos a disponibilidade dos peixes e o valor do frete para a sua cidade.</li>
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
