import type { Metadata } from "next";
import { EntregaForm } from "@/components/EntregaForm";
import { TrackView } from "@/components/TrackView";
import { ACLIMATACAO, HORARIOS, POLITICAS, RETIRADA } from "@/lib/config";

export const metadata: Metadata = {
  title: "Entrega e cadastro para envio",
  description: "Como enviamos as carpas, prazos, garantia de envio e formulário de cadastro para envio do seu pedido.",
  alternates: { canonical: "/entrega" },
};

export default function EntregaPage() {
  const detalhes = [POLITICAS.jejum, POLITICAS.transporte, POLITICAS.garantia, POLITICAS.diasEnvio, POLITICAS.transportadora, POLITICAS.frete, POLITICAS.pagamento];

  return (
    <div className="pagina">
      <TrackView />
      <div className="container">
        <p className="eyebrow">Entrega</p>
        <h1>Do nosso lago ao seu</h1>
        <p className="intro">
          Preencha os dados de entrega para fechar o pedido do catálogo, ou envie só o cadastro se você já combinou a compra pelo
          WhatsApp. Nossa equipe confirma tudo com você em seguida.
        </p>

        <div className="fatos">
          <div className="fato">
            <strong>{POLITICAS.prazo.titulo}</strong>
            <span>{POLITICAS.prazo.texto}</span>
          </div>
          <div className="fato">
            <strong>Envios de segunda a quinta</strong>
            <span>Depois de 1 a 2 dias de jejum pré-envio.</span>
          </div>
          <div className="fato">
            <strong>Garantia de envio</strong>
            <span>Foto ou vídeo em até 3 horas do recebimento.</span>
          </div>
        </div>
        <p className="atalhos">
          <a href="#detalhes">Ler todos os detalhes da entrega</a>
        </p>

        <EntregaForm />

        <section className="detalhes" id="detalhes" aria-labelledby="det-titulo">
          <h2 id="det-titulo">Detalhes da entrega</h2>
          <div className="cards-info">
            {detalhes.map((c) => (
              <div className="card-info" key={c.titulo}>
                <h3>{c.titulo}</h3>
                <p>{c.texto}</p>
              </div>
            ))}
            <div className="card-info">
              <h3>Retirada no local</h3>
              <p>
                {RETIRADA.endereco}. Prazo: {RETIRADA.prazo}.
              </p>
              {HORARIOS.map((h) => (
                <p key={h.dia}>
                  {h.dia}: {h.horas}
                </p>
              ))}
            </div>
            <div className="card-info">
              <h3>Ao receber o seu peixe</h3>
              <p>{ACLIMATACAO}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
