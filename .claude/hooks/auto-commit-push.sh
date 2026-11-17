#!/usr/bin/env bash
# Commit e push automaticos do catalogo Aquacarpas.
#
# Chamado pelo hook "Stop" do Claude Code (veja .claude/settings.json): quando o Claude termina de responder,
# se houver alteracao no projeto, faz commit e envia para origin/main. Cada push na main publica sozinho na
# Vercel (deploy de producao).
#
# Regras de seguranca:
#  - so age na branch main; nunca usa force push;
#  - nao envia se achar arquivo .env, chave privada, JWT ou chave de API nas alteracoes (o repositorio e PUBLICO);
#  - se o GitHub tiver commits novos, tenta rebase; se der conflito, aborta e avisa (nada se perde);
#  - sempre termina com exit 0, para nunca travar a sessao do Claude Code.
#
# Pausar:  crie o arquivo vazio .claude/PAUSAR_AUTO_PUSH (fica fora do Git). Retomar: apague o arquivo.
# Testar sem commitar:  AUTO_DRY_RUN=1 bash .claude/hooks/auto-commit-push.sh
# Mensagem propria:     AUTO_COMMIT_MSG="..." bash .claude/hooks/auto-commit-push.sh

export GIT_TERMINAL_PROMPT=0

# A raiz do projeto fica dois niveis acima deste script (.claude/hooks/).
cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null || exit 0

aviso() {
  # Uma linha na interface do Claude Code (JSON do hook). Tira aspas, barras e quebras para nao quebrar o JSON.
  local m="$1"
  m="${m//\\/}"; m="${m//\"/}"; m="${m//$'\n'/ }"; m="${m//$'\r'/ }"
  printf '{"systemMessage":"auto-push: %s"}\n' "$m"
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ -f .claude/PAUSAR_AUTO_PUSH ] && exit 0
[ "$(git symbolic-ref --short -q HEAD)" = "main" ] || exit 0

gitdir="$(git rev-parse --git-dir)"
if [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ] || [ -f "$gitdir/MERGE_HEAD" ] || [ -f "$gitdir/index.lock" ]; then
  aviso "Git ocupado (rebase, merge ou outro processo em andamento). Nada foi enviado agora."
  exit 0
fi

mudancas="$(git status --porcelain)"
adiante_local="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
# Nada a fazer: sem alteracao e sem commit pendente de envio (evita ir a rede a cada resposta).
[ -z "$mudancas" ] && [ "$adiante_local" -eq 0 ] && exit 0

assunto=""
if [ -n "$mudancas" ]; then
  git add -A >/dev/null 2>&1

  # Trava 1: nomes de arquivo que nunca devem ir para um repositorio publico (.env.example pode).
  proibidos="$(git diff --cached --name-only \
    | grep -E '(^|/)\.env($|\.)|\.(pem|key|p12|pfx)$|(^|/)id_(rsa|ed25519)|service[-_]account.*\.json$' \
    | grep -v -E '(^|/)\.env\.example$')"
  if [ -n "$proibidos" ]; then
    git reset -q >/dev/null 2>&1
    aviso "BLOQUEADO: arquivo sensivel nas alteracoes ($(echo "$proibidos" | head -3 | paste -sd, -)). Nada foi enviado. Tire do projeto ou ponha no .gitignore."
    exit 0
  fi

  # Trava 2: conteudo que parece segredo nas linhas adicionadas (JWT, chave Anthropic, chave privada, tokens do GitHub).
  if git diff --cached -U0 --no-color | grep -E '^\+' | grep -v -E '^\+\+\+ ' \
    | grep -E -q 'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sb_secret_[A-Za-z0-9_-]{10,}|gh[pous]_[A-Za-z0-9]{30,}'; then
    git reset -q >/dev/null 2>&1
    aviso "BLOQUEADO: parece haver chave ou token nas alteracoes. Nada foi enviado. Confira com git diff e tire o segredo do codigo."
    exit 0
  fi

  total="$(git diff --cached --name-only | wc -l | tr -d ' ')"
  if [ -n "${AUTO_COMMIT_MSG:-}" ]; then
    assunto="$AUTO_COMMIT_MSG"
  else
    lista="$(git diff --cached --name-only | head -3 | paste -sd, - | sed 's/,/, /g')"
    assunto="Atualiza ${lista}"
    [ "$total" -gt 3 ] && assunto="${assunto} (+$((total - 3)) arquivos)"
  fi

  if [ "${AUTO_DRY_RUN:-0}" = "1" ]; then
    echo "[dry-run] entrariam no commit ($total arquivo(s)): $assunto"
    git diff --cached --name-status | head -20
    git reset -q >/dev/null 2>&1
    exit 0
  fi

  if ! git commit -q -m "$assunto" -m "Commit automatico ao fim da sessao do Claude Code." \
    -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" >/dev/null 2>&1; then
    git reset -q >/dev/null 2>&1
    aviso "Nao consegui criar o commit. Nada foi enviado."
    exit 0
  fi
fi
[ "${AUTO_DRY_RUN:-0}" = "1" ] && { echo "[dry-run] nao ha alteracoes locais, so commit(s) pendente(s) de envio: $adiante_local"; exit 0; }

# Sincroniza com o GitHub antes de enviar (sem force push, nunca).
if ! timeout 45 git fetch -q origin main >/dev/null 2>&1; then
  aviso "Sem acesso ao GitHub agora. O commit ficou salvo no computador e sera enviado na proxima vez."
  exit 0
fi
atras="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
if [ "$atras" -gt 0 ]; then
  if ! git pull --rebase --autostash -q origin main >/dev/null 2>&1; then
    git rebase --abort >/dev/null 2>&1
    aviso "O GitHub tem commits novos que conflitam com os daqui. Nada foi enviado; o conflito precisa ser resolvido."
    exit 0
  fi
fi

a_enviar="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
[ "$a_enviar" -gt 0 ] || exit 0

if timeout 60 git push -q origin main >/dev/null 2>&1; then
  curto="$(git rev-parse --short HEAD)"
  aviso "enviado para o GitHub (${curto}): ${assunto:-commits pendentes}. A Vercel publica o site em cerca de 1 minuto."
else
  aviso "Falha ao enviar para o GitHub. Os commits ficaram salvos no computador e serao enviados na proxima vez."
fi
exit 0
