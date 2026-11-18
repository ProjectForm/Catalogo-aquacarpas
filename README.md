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
- **Botão flutuante do WhatsApp**: sempre visível no canto; leva direto para `wa.me/<número>` (número em `src/lib/config.ts`).
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
- **Visual da campanha** (faixa no topo, hero com contagem regressiva, entrada suave dos cards, aviso e campo do cupom no
  carrinho, nota na página do peixe) é controlado só por `blackFridayAtiva()` em `src/lib/config.ts` e **some sozinho** depois
  de `fim`: o layout se refaz a cada 60 s. Os textos da campanha ficam em `BLACK_FRIDAY` (mesmo arquivo). Animações respeitam
  `prefers-reduced-motion` e não usam bibliotecas.
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
  23-27 = 5; 28-32 = 7,5; 33+ = 15; tamanho entre duas faixas cai na de cima). Valor por caixa por estado em `config_loja`
  (chave `frete`: SP 95; MG, MS, PR, DF 125; GO, RJ, SC, RS, MT 150). **Frete grátis** a partir de R$ 2.000 já **com o desconto do
  cupom**. **Pedido mínimo** de R$ 500 (preço de tabela, antes do cupom) para calcular frete e pagar online; abaixo disso o fluxo é o
  de antes (WhatsApp, frete a combinar). Tudo editável em `config_loja` (sem deploy).
- **Cidades atendidas**: tabela `municipios_atendimento` (SP, MG, PR e MS, população do Censo 2022 do IBGE). Mais de 200 mil habitantes
  = entrega em casa. Menor = retirada na cidade-polo mais próxima em linha reta (`polo_ibge`; o frete é o do estado do polo). Para trocar o
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
