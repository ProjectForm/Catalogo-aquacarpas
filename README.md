# Catálogo online da Aquacarpas

Next.js 16 + Supabase, feito para a Vercel (plano gratuito). Mostra o catálogo, recebe pedidos e o cadastro para envio
e alimenta o CRM (tabelas `contatos` e `vendas`). **Quem atualiza é o Claude Code**, pelo comando `/catalogo`.

## Como funciona
- Os peixes, preços, ordem, textos e status vêm da tabela `catalogo` do Supabase. O site revalida a cada 60 segundos:
  mudou no banco, aparece em até 1 minuto, **sem deploy**.
- Só **foto nova** precisa de deploy (as fotos ficam em `public/fotos/`).
- Pedidos e cadastros vão para a Edge Function `catalogo-api` (Supabase), que recalcula o preço, grava o contato e a
  venda e devolve o link do WhatsApp com a mensagem pronta. **Nada de chave secreta no navegador.**

## Páginas
| Rota | O que é |
| --- | --- |
| `/` | catálogo por categoria; o peixe com `destaque = true` aparece grande no topo |
| `/p/<slug>` | página do peixe (galeria, preço, descrição, botão de WhatsApp) |
| `/entrega` | resumo da entrega + **cadastro para envio** (com ou sem itens no pedido): entrega no endereço, retirada na transportadora ou retirada no local |
| `/obrigado` | confirmação; abre sozinho o WhatsApp da Aquacarpas com os dados do cliente (há botão se não abrir) |

## Abas, WhatsApp e entrega por transportadora
- **Abas**: cada linha de `catalogo_categorias` é uma aba fixa no topo do catálogo (ex.: "Nishikigoi Ultra Premium"), com a
  contagem de peixes. Para mover um peixe de aba, mude `catalogo.categoria` (slug). Menor `ordem` da categoria aparece antes.
- **Botão flutuante do WhatsApp**: círculo verde com a logo do WhatsApp (SVG preenchido em `WhatsAppFlutuante.tsx`), sempre visível no
  canto; leva direto para `wa.me/<número>` (número em `src/lib/config.ts`).
- **CEP sem entrega em casa**: o Juan informa as faixas; o Claude Code grava em `entrega_restricoes` (cep_inicio, cep_fim com
  8 dígitos, `ativo`, `observacao` opcional com o nome da transportadora). Exemplo:
  `insert into entrega_restricoes (cep_inicio, cep_fim, cidade, uf, observacao) values ('14000000','14099999','Ribeirão Preto','SP','Transportadora X');`
  O formulário passa sozinho para "retirada na transportadora" quando o CEP cai numa faixa, e a função `catalogo-api` confere de
  novo no servidor. A tabela começa **vazia** (sem restrição). Depois da venda, a equipe preenche `vendas.transportadora` e
  `vendas.transportadora_endereco`.
- **Aviso por WhatsApp (dois caminhos)**:
  1. **Automático, para a equipe**: a função `catalogo-api` manda o resumo do pedido (peixes, total, nome, WhatsApp, e-mail,
     recebimento e endereço; **nunca o CPF/CNPJ**) para o WhatsApp **(17) 98151-6665** pelo **CallMeBot** (serviço não oficial,
     chave ativada pelo Juan em 2026-10-01). A chave fica no secret `CALLMEBOT_APIKEY` do Supabase (Project Settings, Edge
     Functions, Secrets), **nunca no código**; sem o secret o pedido funciona e só o aviso não sai. Falha do CallMeBot não
     derruba o pedido (o CRM já recebeu tudo).
  2. **Pelo cliente**: a página `/obrigado` abre o WhatsApp com os dados dele já escritos; ele só toca em enviar. O número é o
     secret `WHATSAPP_ATENDIMENTO` (padrão `5517981516665`).
  Para parar o aviso: mande `Stop` ao CallMeBot pelo WhatsApp ou apague o secret `CALLMEBOT_APIKEY`.

## Medição (comportamento, anúncios e funil)

Três camadas, da mais simples para a mais pesada:

1. **Rastreio próprio e anônimo (sempre ligado, sem cookie, sem dado pessoal)**: `src/lib/tracking.ts`, `src/components/Rastreio.tsx` e a
   Edge Function `catalogo-eventos` (cópia em `supabase/functions/catalogo-eventos/`, **separada** da `catalogo-api` de propósito)
   gravam na tabela `eventos_site` (coluna `dados` jsonb): página, produto visto, adicionou ao pedido, cadastro iniciado, clique no
   WhatsApp **e também** profundidade de rolagem (`scroll`: 25/50/75/100), abas da home que apareceram (`secao_vista`), cliques
   (`clique`: card, aba, botões do topo, nota do Google, Instagram), tempo visível e rolagem máxima por página (`saiu`), primeiro foco
   em cada campo do cadastro (`campo`: só o NOME do campo), CEP digitado (`cep_ok`), resultado do frete (`frete_calculado`:
   online, whatsapp, fora_area, abaixo_minimo...), ações de pagamento (`pagamento_acao`) e `compra_confirmada`. O servidor só aceita uma
   lista fechada de chaves em `dados`. Eventos vão em lote (a cada ~1,5 s ou ao sair da página). Consulte com SQL no Supabase
   (tabela `eventos_site`; agrupe por `sessao` e `tipo`; `utm->>'medium' = 'paid'` separa o tráfego do anúncio).
2. **Pixel da Meta** e 3. **Microsoft Clarity** (gravações e mapas de calor anônimos): `src/lib/pixels.ts` + `src/components/Medicao.tsx`.
   **Só funcionam com ID** em `PIXELS` (`src/lib/config.ts`, ou variáveis `NEXT_PUBLIC_META_PIXEL_ID` / `NEXT_PUBLIC_CLARITY_ID` na
   Vercel) **e depois do "Aceitar"** da faixa de cookies (LGPD; `PIXELS.consentimentoObrigatorio`). Sem ID nada carrega e a faixa
   não aparece. O **Pixel da Meta fica instalado e travado antes da escolha** (modo oficial de consentimento: `fbq('consent','revoke')`
   antes do `init`, `grant` no "Aceitar"): sem cookie e sem evento, mas o Pixel Helper e o "Verificar URL" da Meta o enxergam; quem
   recusa não carrega nada. O Clarity só carrega depois do "Aceitar". Eventos enviados à Meta: PageView, ViewContent, AddToCart, InitiateCheckout, Contact (WhatsApp), Lead (cadastro
   enviado) e Purchase (pagamento confirmado), sempre só com código do peixe e valores; `autoConfig` desligado (a Meta não lê campos
   do formulário). No Clarity, as telas `/entrega`, `/pagamento` e `/obrigado` têm o texto mascarado (`data-clarity-mask` em
   `<main>`, feito por `Rastreio`). A página `/privacidade` explica tudo e tem o botão para mudar a escolha de cookies.
   Ligar: criar o Pixel (Gerenciador de Eventos) e o projeto no Clarity, colar os IDs e publicar; **desligue "correspondência
   avançada automática" do Pixel** no Gerenciador de Eventos (o cadastro tem CPF e telefone).

## Black Friday 2026 e cupons
- **Cupom BLACK30**: 30% sobre o total do pedido (já com a promoção por item, quando houver), em qualquer carpa do site,
  até **30/11/2026 23:59:59 (Brasília)**. Fonte da verdade no **servidor**: tabela `cupons` (RLS ligada, sem política pública,
  só a função `catalogo-api` lê). O navegador nunca decide preço: a ação `cupom` da função só **calcula** (não grava nem avisa
  ninguém) e a ação `pedido` recalcula tudo e grava `vendas.cupom`, `vendas.desconto` e `vendas.valor_total` (= total final).
  O desconto aparece na mensagem do WhatsApp do cliente, no aviso da equipe (CallMeBot) e em `/obrigado`.
- **Mudar ou desativar**: `update cupons set ativo = false where codigo = 'BLACK30';` (para na hora) ou
  `update cupons set valido_ate = '2026-12-05 23:59:59-03' where codigo = 'BLACK30';`. Cupom novo: `insert into cupons`
  (código em maiúsculas, `percentual`, `valido_ate`). O visual e o campo do cupom no carrinho seguem a data `BLACK_FRIDAY.fim`
  em `src/lib/config.ts`: se mudar o prazo no banco, mude lá também.
- **Roleta de desconto** (`src/components/Roleta.tsx`, montada no layout): abre ~1 s depois que a pessoa entra no catálogo
  (qualquer página, menos `/entrega`, `/pagamento`, `/obrigado` e `/privacidade`), uma vez por aparelho até ganhar
  (`localStorage aq_roleta_v1`); quem fecha no X/Esc sem ganhar só a vê de novo na próxima visita (`sessionStorage
  aq_roleta_fechada`). O resultado é sorteado entre **30% (cupom BLACK30)** e **"tente de novo"** (50% cada; depois de 2 "tente
  de novo" seguidos o próximo giro é o prêmio). As fatias de 15%, 5% e "não ganhou nada" são **só desenho**: nunca saem. Ao
  ganhar, o código é guardado no carrinho (`guardarCupom` em `CartProvider`) e o desconto continua sendo **calculado pelo
  servidor** (nada mudou na `catalogo-api`). Eventos do rastreio próprio: `roleta` com `dados.acao` = aberta | giro (`resultado`
  tente/ganhou e `valor` = nº do giro) | escolher | fechou. Sumir é automático depois de `BLACK_FRIDAY.fim`.
- **Visual da campanha** (subtítulo "Oferta especial Black Friday" na primeira tela, entrada suave dos cards, roleta, aviso e
  campo do cupom no carrinho) é controlado só por `blackFridayAtiva()` em `src/lib/config.ts` e **some sozinho** depois de
  `fim`: o layout se refaz a cada 60 s. Os textos da campanha ficam em `BLACK_FRIDAY` (mesmo arquivo). A primeira tela e os
  cards são propositalmente silenciosos: o cupom **não** aparece embaixo dos peixes nem na página do peixe, só na roleta e no
  carrinho (`CupomCarrinho`, na tela `/entrega`). Animações respeitam `prefers-reduced-motion` e não usam bibliotecas.
- **Primeira tela e confiança**: título "Aquacarpas / Catálogo" em serifa leve, nota do Google (estrelas em cinza claro,
  "Nota 4,8 em 26 avaliações", com link), `@aquacarpas` com ícone do Instagram e três pilares (entrega, pagamento, garantia). A
  nota e o total de avaliações são **digitados à mão** em `GOOGLE` (`src/lib/config.ts`): atualize quando mudarem no Google
  (e, se houver o link curto de avaliações do Perfil da Empresa, troque `GOOGLE.url`). No celular a primeira tela é curta de
  propósito (nota e Instagram na mesma linha, pilares lado a lado como uma barra, sem botão e sem a foto de destaque) para a
  ponta da grade de produtos aparecer sem rolar; a foto de destaque continua só no computador. No canto direito do hero
  cruza a **carpa real do vídeo da Aquacarpas** (`CarpaNadando`, imagem WebP animada com **transparência de verdade**,
  `public/carpa/orbita-v2.webp`, ~360 KB; só a carpa, sem marca d'água nem reflexos, com vai e volta do nado): ela nasce
  embaixo da header, desce nadando, faz a curva para a direita com a cabeça sempre virada para onde vai e sai pela borda
  direita; some uns 3,5 s e volta a sair da header. **Tempo próprio, independente da rolagem** (a outra carpa, em traço fino,
  é a que anda conforme se rola). A rota é uma curva de Bézier montada no navegador a partir do layout real (título,
  subtítulo, nota e Instagram), escolhendo o caminho que não passa por cima de texto em qualquer largura; é tocada com a Web
  Animations API (compositor) e só roda com o topo visível. No computador ela esmaece perto da foto de destaque. Não é vídeo
  de propósito: vídeo com fundo preto + `mix-blend-mode` deixava uma caixa visível em alguns celulares. Com "reduzir
  movimento" fica o quadro parado (`orbita-parada-v2.webp`). Como o arquivo foi feito (e como refazer com outro vídeo) está em
  `scripts/carpa-video/LEIA-ME.md`. A carpa vista de cima é o
  componente `NadoCarpa`: não ocupa espaço, sai de baixo das abas e nada para baixo pela grade enquanto a página rola (não
  aparece com "reduzir movimento"). **Grade**: 2 itens por linha no celular (até 560 px). **Quantidade**: depois de tocar em
  "Adicionar", o botão do card (e o da página do peixe) vira `- número +` (o número aceita digitação; no mínimo, o "-" tira o
  item); exemplar único não tem quantidade. No resumo do pedido, `ConfiancaPedido` mostra "pagamento confiável pela
  InfinitePay" (ou, se o CEP já foi calculado e não há pagamento online, "combinado com a nossa equipe") e a garantia
  (`GARANTIA_CURTA`: reposição ou reembolso, sem prometer prazo).
- **Preços do reajuste** (+10% no mais caro a +16,7% no mais barato, escala logarítmica): os valores de antes ficam em
  `catalogo_precos_backup_20261117` (RLS ligada, sem acesso público). Para **reverter**:
  `update catalogo c set preco = b.preco_antigo, preco_promocional = b.preco_promocional_antigo, atualizado_em = now() from catalogo_precos_backup_20261117 b where b.codigo = c.codigo and b.preco_novo is not null;`
  A ordem antiga das abas: Nishikigoi Ultra Premium 5, Nishikigoi (inativa) 10, Koi selecionadas 20, Carpas coloridas 30,
  Kinguios cometas 40 (`catalogo_categorias.ordem`).
- **Função `catalogo-api`**: o código que roda no Supabase tem uma cópia versionada em `supabase/functions/catalogo-api/index.ts`
  (fora do build do Next: `supabase` está no `exclude` do `tsconfig.json`). Mudou lá? Publique no Supabase (verify_jwt desligado)
  e mantenha as duas versões iguais.
- O cupom não aparece como "de R$ X por R$ Y": cards e página do peixe mostram só o preço de tabela vigente; o desconto
  aparece no carrinho. A promoção por item que já existia (`preco_promocional`) continua como antes.

## Checkout online: frete, Pix e InfinitePay
Tudo é calculado e decidido **no servidor** (Edge Function `catalogo-api`); o navegador só mostra. Código da função em
`supabase/functions/catalogo-api/` (`index.ts`, `frete.ts`, `pix.ts`); testes da lógica pura: `node --test supabase/functions/catalogo-api/logica.test.ts`.
- **Frete (já ativo)**: caixas = teto(volume ÷ 15), igual ao site principal (8-12 cm = 1; 12-15 = 1,5; 15-17 = 1,875; 18-21 = 3;
  23-27 = 5; 28-32 = 7,5; 33+ = 15; tamanho entre duas faixas cai na de cima). Tudo em `config_loja`, chave `frete` (editável sem deploy).
  O frete depende do **CEP**, em três faixas:
  1. **Zona local** (`zonas`, nome `local`, por código IBGE: São José do Rio Preto e Mirassol): R$ 60 por caixa, **grátis a partir de R$ 200**,
     pedido mínimo R$ 200.
  2. **Zona regional** (nome `regional`, raio de **135 km em linha reta** de Rio Preto, cerca de 148 cidades, inclusive Araçatuba, Frutal e
     Fronteira): R$ 60 por caixa, **grátis a partir de R$ 1.200**, pedido mínimo R$ 200. A distância de cada município está em
     `municipios_atendimento.distancia_rp_km` (centroides do IBGE; 135 km em linha reta equivale a cerca de 160 km por estrada).
  3. **Demais cidades**: tabela por estado (SP 95; MG, MS, PR, DF 125; GO, RJ, SC, RS, MT 150 por caixa), **grátis a partir de R$ 2.000** e
     pedido mínimo de R$ 500.
  Em todas, o pedido mínimo olha o preço de tabela (antes do cupom) e o frete grátis olha o valor dos peixes **já com o desconto do cupom**.
  Abaixo do mínimo o fluxo é o de antes (WhatsApp, frete a combinar). Para mudar o raio, o valor ou os limites: `update config_loja set valor =
  jsonb_set(valor, '{zonas,1,raio_km}', '150') where chave = 'frete';` (a posição 0 é a zona local, a 1 é a regional).
- **Cidades atendidas**: tabela `municipios_atendimento` (SP, MG, PR e MS, população do Censo 2022 do IBGE). Cidade numa zona de frete ou com
  mais de 200 mil habitantes = entrega em casa. Menor e fora das zonas = retirada na cidade-polo mais próxima em linha reta (`polo_ibge`; o
  frete é o do estado do polo, com a tabela e o mínimo das demais cidades). Para trocar o
  polo de uma cidade: `update municipios_atendimento set polo_ibge = '<ibge da cidade polo>' where ibge = '<ibge>'`. Outros estados: sem
  checkout online, a equipe combina pelo WhatsApp. O CEP é consultado no ViaCEP pelo servidor (usa o IBGE do CEP; se o ViaCEP falhar, usa
  cidade e estado do formulário). A regra dos 200 mil habitantes nunca aparece no catálogo.
- **Pagamento online** (ligado em 17/11/2026, com Pix e InfinitePay; para pausar: `update config_loja set valor = jsonb_set(valor, '{checkout_online_ativo}', 'false') where chave = 'pagamento';`
  e os pedidos voltam ao fluxo de WhatsApp na hora): `config_loja`, chave `pagamento`:
  `{"checkout_online_ativo": true, "reserva_minutos": 60, "pix": {"chave": "...", "nome": "...", "cidade": "..."}, "infinitepay": {"handle": "..."}}`.
  O pedido vai para `/pagamento?n=<número>&t=<token>` (token secreto em `vendas.token_publico`; cada cliente só vê o próprio pedido).
  - **Pix**: código "copia e cola" e QR com o valor **exato** (frete e cupom incluídos), gerado no servidor com o número do pedido como
    identificador. Pix estático **não avisa quando é pago**: a equipe confere no banco e confirma com
    `update vendas set status = 'pago', pago_em = now() where numero = <n>;`. O botão "Já fiz o pagamento" só avisa a equipe pelo CallMeBot.
  - **InfinitePay**: link de checkout (cartão e Pix) criado pela API `api.checkout.infinitepay.io` (sem API Key; basta o handle, que é a
    InfiniteTag sem o `$`), que exige o **Checkout Integrado** ligado na conta (app InfinitePay > Checkout Integrado > Configurações). Dica:
    desligar lá a "Etapa de endereço", porque o endereço já foi informado no catálogo. O webhook (`catalogo-api?hook=infinitepay`) não é assinado, então a confirmação sempre passa
    pelo `payment_check` e só vale se o valor (`amount`) for o do pedido; ao voltar para a loja o cliente também dispara essa conferência.
  - **Estoque**: quando o pedido vira `pago` (webhook, conferência ou o `update` acima), o gatilho `vendas_baixa_estoque` marca o
    exemplar único como `vendido` (e baixa a quantidade dos itens com controle de estoque). Enquanto o cliente paga, o exemplar fica reservado
    (`vendas.reservado_ate`) e outro cliente recebe "reservado para outro cliente". Pagamento que chega depois de a reserva vencer e de o
    peixe ter sido vendido a outro é marcado como **CONFLITO DE ESTOQUE** em `vendas.observacoes` e avisado à equipe (estorno ou outro peixe).
  - **Pedido de teste**: coloque o marcador de `config_loja.teste` (chave `marcador`) nas observações do pedido e a equipe **não** recebe aviso.
  - Valor total: `vendas.valor_total` agora é o **total a pagar** (peixes com desconto + frete); `vendas.frete`, `caixas`, `frete_gratis`,
    `polo_cidade`, `pagamento_metodo`, `pagamento_ref` detalham.

## Rodar no computador
Precisa de Node 20.9 ou superior.
```
cd catalogo
npm install
copy .env.example .env.local     (preencha a chave anon do Supabase)
npm run dev                      (abre em http://localhost:3000)
```
Se o `npm install` acusar erro de certificado (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`), use a variável
`NODE_OPTIONS=--use-system-ca`.

## Fotos
`npm run foto -- "caminho/da/foto.jpg" nome-do-arquivo` reduz para no máximo 1600 px e converte para WebP em
`public/fotos/nome-do-arquivo.webp`. Depois o item recebe `/fotos/nome-do-arquivo.webp` na coluna `imagens`.
Use **foto real do peixe**, de cima, em bacia azul ou clara (ver `../conhecimento/referencias-visuais.md`).

## Publicar na Vercel
Este diretório é o repositório `github.com/ProjectForm/Catalogo-aquacarpas` (branch `main`). Importar esse repositório
na Vercel (Root Directory `./`), com as variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`NEXT_PUBLIC_SITE_URL`, e ligar o Web Analytics. Depois disso, cada `git push` na `main` publica sozinho. Passo a passo em
`../PROMPTS/05-catalogo-online.md` (seção "Como publicar"). O repositório é **público**: nunca coloque segredo aqui.

## Commit e push automáticos
Ao fim de cada resposta do Claude Code neste projeto, o hook `Stop` (`.claude/settings.json`, que chama
`.claude/hooks/auto-commit-push.sh`) faz commit das alterações e envia para `origin/main`, o que publica o site na Vercel
sozinho. Só age na branch `main`, nunca usa force push e **se recusa a enviar** se achar `.env`, chave privada, JWT ou chave de
API nas alterações (o repositório é público). Se o GitHub tiver commits novos, faz rebase; em caso de conflito, não envia e avisa.
- **Pausar**: crie o arquivo vazio `.claude/PAUSAR_AUTO_PUSH` (fica fora do Git). Retomar: apague o arquivo.
- **Testar sem commitar**: `AUTO_DRY_RUN=1 bash .claude/hooks/auto-commit-push.sh`.
- Os commits saem como `Aquacarpas (Claude Code)` com o e-mail *noreply* do GitHub (configurado só neste repositório).

## Segurança
- A chave `anon` do Supabase é pública por natureza. A `service_role` **nunca** entra aqui.
- O RLS do banco só libera leitura dos itens ativos do catálogo. Tudo o mais passa pela função `catalogo-api`
  (a tabela `cupons`, o backup de preços, `config_loja` e `municipios_atendimento` não têm política pública; chave Pix e handle da
  InfinitePay ficam em `config_loja`, nunca no código).
- O formulário tem campo isca (honeypot) e limite de pedidos por telefone/hora.
- Sem emoji e sem texto de venda agressivo: a marca é high ticket (`../conhecimento/marca.md`).
