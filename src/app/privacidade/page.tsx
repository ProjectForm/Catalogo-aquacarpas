import type { Metadata } from "next";
import { AbrirCookies } from "@/components/Medicao";
import { TrackView } from "@/components/TrackView";
import { PIXELS, SITE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacidade e cookies",
  description: "Quais dados a Aquacarpas usa no catálogo online, para quê, e como recusar cookies de medição.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  const medicao = Boolean(PIXELS.meta || PIXELS.clarity);
  return (
    <div className="pagina">
      <TrackView />
      <div className="container texto-legal">
        <p className="eyebrow">Privacidade</p>
        <h1>Privacidade e cookies</h1>
        <p className="intro">
          Texto simples sobre os dados que usamos no catálogo da {SITE.nome} (CNPJ {SITE.cnpj}), para quê, e como você controla.
          Atualizado em 22/11/2026.
        </p>

        <h2>Dados do pedido e do cadastro de envio</h2>
        <p>
          Quando você faz um pedido ou envia o cadastro de envio, pedimos nome, WhatsApp, CPF ou CNPJ, endereço e, se quiser,
          e-mail. Usamos para entregar o seu peixe, emitir a nota fiscal, confirmar o pagamento e falar com você sobre o pedido.
          Guardamos pelo tempo necessário para cumprir essas finalidades e as obrigações legais e fiscais. O CEP é consultado em
          um serviço público de CEP para preencher o endereço. O pagamento por cartão ou Pix pela InfinitePay é feito no ambiente
          deles; nós não vemos nem guardamos dados de cartão.
        </p>

        <h2>Como o catálogo é usado (sem cookies e sem identificar você)</h2>
        <p>
          Para melhorar o catálogo, registramos de forma anônima: página visitada, de qual anúncio ou link você veio, até onde
          rolou a página, quanto tempo ficou, em quais botões e peixes clicou e em quais campos do cadastro parou (só o nome do
          campo, nunca o que você digitou). Isso usa um número aleatório que vale só até você fechar a aba. Não usamos cookies
          para isso e não ligamos essas informações ao seu nome. Usamos também estatísticas agregadas da hospedagem (Vercel),
          sem cookies.
        </p>

        <h2>Cookies e pixels de terceiros (só se você aceitar)</h2>
        {medicao ? (
          <>
            <p>Se você tocar em &quot;Aceitar&quot; na faixa de cookies, carregamos:</p>
            <ul>
              {PIXELS.meta ? (
                <li>
                  <strong>Pixel da Meta (Facebook e Instagram):</strong> mede quantas pessoas que viram o nosso anúncio visitaram o
                  catálogo, olharam um peixe, adicionaram ao pedido ou falaram pelo WhatsApp, para sabermos quais anúncios
                  funcionam e mostrá-los a quem tem interesse. Usa cookies da Meta. Não enviamos nome, telefone, e-mail, CPF nem
                  endereço.
                </li>
              ) : null}
              {PIXELS.clarity ? (
                <li>
                  <strong>Microsoft Clarity:</strong> mostra, em mapas de calor e gravações anônimas da tela, onde as pessoas
                  clicam e rolam, para vermos o que atrapalha. Nas telas de entrega, pagamento e confirmação todo o texto e os
                  campos ficam mascarados (não aparecem nas gravações).
                </li>
              ) : null}
            </ul>
            <p>
              Se você recusar, o catálogo funciona igual. Pode mudar de ideia a qualquer momento:
            </p>
            <p style={{ marginTop: 14 }}>
              <AbrirCookies />
            </p>
          </>
        ) : (
          <p>No momento não usamos cookies nem pixels de terceiros no catálogo.</p>
        )}

        <h2>Seus direitos</h2>
        <p>
          Você pode pedir acesso, correção ou exclusão dos dados do seu cadastro, e tirar o consentimento quando quiser, falando
          com a gente pelo WhatsApp {SITE.whatsappExibicao} ou pelo e-mail {SITE.email}.
        </p>
      </div>
    </div>
  );
}
