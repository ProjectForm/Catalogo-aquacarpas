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
- **Aviso por WhatsApp**: sem a API oficial não há envio automático do servidor. Ao concluir o cadastro, o navegador do cliente
  abre o WhatsApp **(17) 98151-6665** com os dados dele; ele só toca em enviar. O número de destino é o secret
  `WHATSAPP_ATENDIMENTO` da função (padrão `5517981516665`). O CRM já recebe tudo antes desse passo.

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

## Segurança
- A chave `anon` do Supabase é pública por natureza. A `service_role` **nunca** entra aqui.
- O RLS do banco só libera leitura dos itens ativos do catálogo. Tudo o mais passa pela função `catalogo-api`.
- O formulário tem campo isca (honeypot) e limite de pedidos por telefone/hora.
- Sem emoji e sem texto de venda agressivo: a marca é high ticket (`../conhecimento/marca.md`).
