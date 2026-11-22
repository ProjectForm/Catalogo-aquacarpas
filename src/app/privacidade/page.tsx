import type { Metadata } from "next";
import { AbrirCookies, PreferenciaMedicao } from "@/components/Medicao";
import { TrackView } from "@/components/TrackView";
import { PIXELS, SITE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacidade e cookies",
  description: "Quais dados a Aquacarpas usa no catálogo online, para quê, e como desligar a medição.",
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

        <h2>Roleta de desconto</h2>
        <p>
          A roleta da Black Friday aparece uma vez só em cada aparelho. Para isso guardamos no seu aparelho, no armazenamento do
          navegador e em um cookie nosso, um número aleatório, a data e o resultado do giro (por exemplo, se você ganhou o
          cupom). Não tem nome nem dado pessoal, não é enviado a terceiros e fica guardado por até 1 ano; você pode apagar nos
          dados do navegador. Esse cookie é necessário para a roleta funcionar.
        </p>

        <h2>Contato para promoções (aviso &quot;Antes de ir&quot;)</h2>
        <p>
          Quando você está saindo do catálogo, mostramos uma vez um aviso para você deixar o seu WhatsApp (e, se quiser, o seu
          nome) e receber ofertas e peixes novos. Só guardamos o contato se você tocar em &quot;Quero receber promoções&quot;, sob o texto
          de autorização. Junto com ele guardamos a página em que você estava, de qual anúncio ou link você veio e quantos itens
          tinha no pedido. Usamos só para falar com você pelo WhatsApp sobre ofertas e novidades da {SITE.nome}, e guardamos até
          você pedir para sair. Para parar de receber ou apagar o seu contato, é só avisar pelo WhatsApp {SITE.whatsappExibicao}{" "}
          ou pelo e-mail {SITE.email}.
        </p>
        <p>
          Os dados ficam em um banco de dados na nuvem (Supabase), e a nossa equipe é avisada por um serviço de mensagens quando
          chega um contato novo. Não vendemos nem repassamos o seu contato a outras empresas. No seu aparelho fica apenas uma marca
          simples (se você deixou o contato ou fechou o aviso, e a data) para o aviso não voltar: se você fecha, ele não aparece de
          novo por 7 dias. Esses dados não vão para o rastreio anônimo descrito acima nem para as gravações do Clarity (o aviso é
          mascarado).
        </p>

        {medicao ? (
          <>
            {PIXELS.meta ? (
              <>
                <h2>Cookies e pixels de terceiros (só se você aceitar)</h2>
                <p>
                  Antes da sua escolha, o código do Pixel da Meta fica na página travado: ele não grava cookies e não envia nenhum
                  evento sobre a sua visita. Como o arquivo do Pixel vem dos servidores da Meta, o seu navegador o baixa de lá e a
                  Meta recebe o seu endereço de IP nessa busca.
                </p>
                <p>Se você tocar em &quot;Aceitar&quot; na faixa de cookies, liberamos:</p>
                <ul>
                  <li>
                    <strong>Pixel da Meta (Facebook e Instagram):</strong> mede quantas pessoas que viram o nosso anúncio visitaram
                    o catálogo, olharam um peixe, adicionaram ao pedido ou falaram pelo WhatsApp, para sabermos quais anúncios
                    funcionam e mostrá-los a quem tem interesse. Usa cookies da Meta. Não enviamos nome, telefone, e-mail, CPF
                    nem endereço.
                  </li>
                  {PIXELS.clarity ? (
                    <li>
                      <strong>Microsoft Clarity:</strong> mostra, em mapas de calor e gravações anônimas da tela, onde as pessoas
                      clicam e rolam, para vermos o que atrapalha. Nas telas de entrega, pagamento e confirmação todo o texto e os
                      campos ficam mascarados (não aparecem nas gravações).
                    </li>
                  ) : null}
                </ul>
                <p>Se você recusar, o catálogo funciona igual. Pode mudar de ideia a qualquer momento:</p>
                <p style={{ marginTop: 14 }}>
                  <AbrirCookies />
                </p>
              </>
            ) : (
              <>
                <h2>Medição do comportamento no catálogo (Microsoft Clarity)</h2>
                <p>
                  Para vermos o que atrapalha a navegação, usamos o Microsoft Clarity. Ele faz mapas de calor e gravações
                  anônimas da tela, mostrando onde as pessoas clicam e rolam, e usa cookies próprios para reconhecer a mesma visita
                  durante a navegação. Nas telas de entrega, pagamento e confirmação todo o texto e os campos ficam mascarados:
                  nome, telefone, CPF, endereço e dados de pagamento não aparecem nas gravações. Não ligamos isso ao seu nome. Os
                  dados da medição ficam com a Microsoft, conforme a política de privacidade dela.
                </p>
                <p>
                  Esta medição fica ligada por padrão, sem faixa de cookies. Se você não quiser, desligue aqui (vale para este
                  aparelho; o catálogo funciona igual):
                </p>
                <div style={{ marginTop: 14 }}>
                  <PreferenciaMedicao />
                </div>
                <p>
                  Hoje não usamos o Pixel da Meta (Facebook e Instagram) nem outros pixels de anúncio no catálogo.
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <h2>Cookies e pixels de terceiros</h2>
            <p>No momento não usamos cookies de terceiros nem pixels de medição no catálogo.</p>
          </>
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
