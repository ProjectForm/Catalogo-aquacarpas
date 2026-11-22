// Dados institucionais do site. Fonte da verdade: conhecimento/negocio.md (repositório aquacarpas-marketing).
// Mudou política, horário ou endereço lá? Espelhe aqui e publique de novo.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// Endereço público (sitemap, Open Graph, dados estruturados). Na Vercel vale o domínio de produção que ela mesma informa
// (acompanha um domínio próprio, se um dia houver); NEXT_PUBLIC_SITE_URL só vale fora da Vercel.
const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (producao ? `https://${producao}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")).replace(/\/$/, "");

export const API_URL = `${SUPABASE_URL}/functions/v1/catalogo-api`;
/** Função só dos eventos de navegação (rastreio próprio e anônimo); separada da API de pedidos de propósito. */
export const EVENTOS_URL = `${SUPABASE_URL}/functions/v1/catalogo-eventos`;
/** Função só do contato deixado no aviso de saída (WhatsApp para promoções, com consentimento); separada das outras de propósito. */
export const CONTATO_URL = `${SUPABASE_URL}/functions/v1/catalogo-contato`;

/**
 * Medição de terceiros (anúncios e comportamento). Os IDs são públicos (aparecem no código de qualquer site que usa essas
 * ferramentas), então podem ficar aqui ou em variáveis da Vercel (NEXT_PUBLIC_META_PIXEL_ID / NEXT_PUBLIC_CLARITY_ID).
 * Vazio = desligado: nada é carregado e nenhuma faixa de cookies aparece.
 *  - meta: ID do Pixel da Meta (Gerenciador de Eventos > Fontes de dados > Pixel), só números.
 *  - clarity: ID do projeto no Microsoft Clarity (clarity.microsoft.com > Settings > Overview).
 * Faixa de cookies: só existe com o Pixel da Meta ligado (`meta` preenchido) e `consentimentoObrigatorio` ligado; aí os dois
 * só carregam depois do "Aceitar" (LGPD). Com o Pixel desligado, o Clarity roda SEM a pergunta (decisão do Juan em 2026-11-22,
 * risco de LGPD dele) e a página /privacidade avisa e traz o botão para recusar.
 */
export const PIXELS = {
  // Pixel da Meta DESLIGADO em 2026-11-22 (o Juan desativou o pixel). Para religar: ID "Aquacarpas Atendimento" 1592503682603005
  // (o "Aqua Carpas's Pixel" antigo, de 2021, é o 188589343464359), aqui ou em NEXT_PUBLIC_META_PIXEL_ID. Religar traz a faixa de volta.
  meta: process.env.NEXT_PUBLIC_META_PIXEL_ID || "",
  // Projeto "catálogo" no Microsoft Clarity (clarity.microsoft.com). Para trocar de projeto, mude aqui.
  clarity: process.env.NEXT_PUBLIC_CLARITY_ID || "zhl3tbswvu",
  consentimentoObrigatorio: true,
};

/**
 * Campanha Black Friday 2026. TUDO que é visual (faixa, hero, contagem, animações, aviso e campo de cupom no carrinho)
 * depende de `blackFridayAtiva()` e some sozinho depois de `fim`, sem novo deploy. O desconto em si é decidido pelo
 * servidor (tabela `cupons` do Supabase): depois do prazo a função rejeita o cupom mesmo que alguém tente.
 * Para mudar prazo ou desativar: atualize `cupons.valido_ate` / `cupons.ativo` no banco E o `fim` abaixo.
 */
export const BLACK_FRIDAY = {
  cupom: "BLACK30",
  percentual: 30,
  /** 30/11/2026 23:59:59 em Brasília (UTC-3, sem horário de verão). */
  fim: "2026-11-30T23:59:59-03:00",
  fimTexto: "30/11",
  fimTextoLongo: "30 de novembro",
  /** Subtítulo discreto sob o título da primeira tela (sem cupom: o cupom aparece nos itens). */
  subtitulo: "Oferta especial Black Friday",
} as const;

export function blackFridayAtiva(agora: number = Date.now()): boolean {
  return agora <= Date.parse(BLACK_FRIDAY.fim);
}

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

/**
 * Avaliações do Google exibidas na primeira tela. Valores digitados à mão: atualize `nota` e `total` quando mudarem
 * no Perfil da Empresa no Google. O link é a busca "aquacarpas" sem parâmetros de sessão (ei, sxsrf, gs_lp...); se
 * houver um link curto de avaliações (g.page/.../review), troque aqui para abrir direto na lista de avaliações.
 */
export const GOOGLE = {
  nota: 4.8,
  notaTexto: "4,8",
  total: 26,
  url: "https://www.google.com/search?q=aquacarpas",
} as const;

/** Frase da garantia exibida no carrinho (mesma ideia da política de garantia de envio, sem prometer prazo de reembolso). */
export const GARANTIA_CURTA = "Se o seu peixe não chegar bem, repomos o peixe ou devolvemos o seu dinheiro.";

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
      "O frete é calculado aqui mesmo, pelo CEP, e aparece no resumo do pedido. Na região de São José do Rio Preto o frete é de R$ 60 por caixa, para pedidos a partir de R$ 200: grátis a partir de R$ 200 em São José do Rio Preto e Mirassol e a partir de R$ 1.200 nas demais cidades da região. Nas outras cidades que atendemos, o frete é calculado em pedidos a partir de R$ 500 e é grátis em compras acima de R$ 2.000. Os limites consideram o valor dos peixes já com o desconto de cupons. Nos demais casos, a nossa equipe informa o frete pelo WhatsApp.",
  },
  pagamento: {
    titulo: "Pagamento",
    texto:
      "Quando o frete aparece calculado no resumo do pedido, você paga direto aqui no site: Pix ou, pela InfinitePay, cartão de crédito (parcelado, com juros) ou Pix. Nos demais casos, o pagamento é combinado com a nossa equipe pelo WhatsApp.",
  },
} as const;

/** Depois de enviar o cadastro, abre o WhatsApp da Aquacarpas com os dados do cliente já escritos (ele só toca em enviar). */
export const ABRIR_WHATSAPP_AUTOMATICO = true;

export const ACLIMATACAO =
  "Ao receber, deixe o saco fechado boiando no lago por cerca de 5 minutos, na sombra (sem sombra, use uma bacia). Depois solte apenas o peixe, descartando a água do saco.";

export function linkWhatsApp(texto: string) {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(texto)}`;
}
