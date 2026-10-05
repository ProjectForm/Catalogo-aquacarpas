// Dados institucionais do site. Fonte da verdade: conhecimento/negocio.md (repositório aquacarpas-marketing).
// Mudou política, horário ou endereço lá? Espelhe aqui e publique de novo.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// Endereço público (sitemap, Open Graph, dados estruturados). Na Vercel vale o domínio de produção que ela mesma informa
// (acompanha um domínio próprio, se um dia houver); NEXT_PUBLIC_SITE_URL só vale fora da Vercel.
const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (producao ? `https://${producao}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")).replace(/\/$/, "");

export const API_URL = `${SUPABASE_URL}/functions/v1/catalogo-api`;

export const SITE = {
  nome: "Aquacarpas",
  tagline: "Joias vivas para o seu lago",
  cidade: "São José do Rio Preto - SP",
  cnpj: "42.396.024/0001-51",
  whatsapp: "5517981516665",
  whatsappExibicao: "(17) 98151-6665",
  instagram: "aquacarpas",
  instagramUrl: "https://www.instagram.com/aquacarpas/",
  email: "aquacarpas@hotmail.com",
} as const;

export const RETIRADA = {
  endereco: "R. Joséfa Voltareli Sanfelice, 301 - Jardim Antunes, São José do Rio Preto - SP, 15047-051",
  prazo: "1 a 2 dias",
} as const;

export const HORARIOS = [
  { dia: "Segunda a sexta", horas: "10h às 18h" },
  { dia: "Sábado", horas: "9h às 18h" },
  { dia: "Domingo", horas: "Fechado" },
] as const;

// Políticas oficiais (conhecimento/negocio.md). Não reescreva com outras palavras sem atualizar a fonte.
export const POLITICAS = {
  prazo: {
    titulo: "Entrega em até 3 dias úteis",
    texto: "O prazo já considera o jejum pré-envio.",
  },
  // Atenção: isto NÃO é quarentena (correção do Juan, 2026-09-30). Quarentena é outra coisa (ver conhecimento/negocio.md).
  jejum: {
    titulo: "Jejum antes do envio",
    texto:
      "O peixe fica de 1 a 2 dias sem se alimentar antes de viajar, para não soltar muitos excrementos na água do saco nem elevar a amônia durante o transporte.",
  },
  transporte: {
    titulo: "Até 72h de sobrevivência garantida no transporte",
    texto: "Se algo sair do esperado na viagem, vale a garantia de envio descrita abaixo.",
  },
  garantia: {
    titulo: "Garantia de envio",
    texto:
      "Se o peixe chegar debilitado ou não resistir ao transporte, envie foto ou vídeo em até 3 horas do recebimento pelo WhatsApp. Garantimos reposição do peixe ou reembolso integral, conforme avaliação do caso.",
  },
  diasEnvio: {
    titulo: "Envios de segunda a quinta",
    texto: "O pedido confirmado entra na programação de envio, respeitando o jejum pré-envio.",
  },
  transportadora: {
    titulo: "Retirada na transportadora",
    texto:
      "Em alguns CEPs não é possível entregar diretamente no endereço da residência. Nesses casos, a retirada é na transportadora mais próxima do seu CEP, e a nossa equipe informa qual é pelo WhatsApp.",
  },
  frete: {
    titulo: "Frete",
    texto:
      "O valor é calculado pela nossa equipe conforme a sua cidade e informado pelo WhatsApp. Frete grátis em qualquer cidade que atendemos, em compras acima de R$ 2.000.",
  },
  pagamento: {
    titulo: "Pagamento",
    texto: "Pix ou cartão (Mercado Pago, com juros). O pagamento é combinado com a nossa equipe pelo WhatsApp.",
  },
} as const;

/** Depois de enviar o cadastro, abre o WhatsApp da Aquacarpas com os dados do cliente já escritos (ele só toca em enviar). */
export const ABRIR_WHATSAPP_AUTOMATICO = true;

export const ACLIMATACAO =
  "Ao receber, deixe o saco fechado boiando no lago por cerca de 5 minutos, na sombra (sem sombra, use uma bacia). Depois solte apenas o peixe, descartando a água do saco.";

export function linkWhatsApp(texto: string) {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(texto)}`;
}
