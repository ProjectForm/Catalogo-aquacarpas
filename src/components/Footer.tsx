import Link from "next/link";
import { HORARIOS, RETIRADA, SITE } from "@/lib/config";

export function Footer() {
  return (
    <footer className="rodape-site">
      <div className="container">
        <div className="colunas">
          <div>
            <h4>{SITE.nome}</h4>
            <p>{SITE.tagline}.</p>
            <p style={{ marginTop: 10 }}>Criação e venda de carpas Nishikigoi em {SITE.cidade}.</p>
          </div>
          <div>
            <h4>Atendimento</h4>
            <p>
              WhatsApp:{" "}
              <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noopener noreferrer">
                {SITE.whatsappExibicao}
              </a>
            </p>
            <p>
              Instagram:{" "}
              <a href={SITE.instagramUrl} target="_blank" rel="noopener noreferrer">
                @{SITE.instagram}
              </a>
            </p>
            {HORARIOS.map((h) => (
              <p key={h.dia}>
                {h.dia}: {h.horas}
              </p>
            ))}
          </div>
          <div>
            <h4>Retirada no local</h4>
            <p>{RETIRADA.endereco}</p>
            <p style={{ marginTop: 10 }}>
              <Link href="/entrega">Como funciona a entrega</Link>
            </p>
          </div>
        </div>
        <p className="legal">
          {SITE.nome} · CNPJ {SITE.cnpj}. Seus dados são usados apenas para entrega, emissão de nota fiscal e contato sobre o seu
          pedido.
        </p>
      </div>
    </footer>
  );
}
