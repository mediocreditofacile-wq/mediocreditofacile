#!/bin/bash
# Porta su Vercel le variabili del portale Green-Go, leggendole da .env.local.
# Da lanciare una volta sola, dalla radice del repo.
#
#   bash scripts/env-vercel-green-go.sh
#
# Le variabili gia' presenti su Vercel non vengono toccate: se una va cambiata,
# rimuovila prima con  vercel env rm NOME production
set -euo pipefail
cd "$(dirname "$0")/.."

leggi() { grep "^$1=" .env.local | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

# In produzione l'origine e' il dominio vero, non localhost
BETTER_AUTH_URL_PROD="https://www.mediocreditofacile.it"
CRON_SECRET_NUOVO="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"

metti() {
  local nome="$1" valore="$2"
  for ambiente in production preview development; do
    printf '%s' "$valore" | vercel env add "$nome" "$ambiente" >/dev/null 2>&1 \
      && echo "  $nome -> $ambiente" \
      || echo "  $nome -> $ambiente (gia' presente, saltata)"
  done
}

echo "Variabili del portale Green-Go:"
metti DATABASE_URL        "$(leggi DATABASE_URL)"
metti BETTER_AUTH_SECRET  "$(leggi BETTER_AUTH_SECRET)"
metti CRON_SECRET         "$CRON_SECRET_NUOVO"

# L'URL cambia tra produzione e locale, quindi va messo a mano ambiente per ambiente
printf '%s' "$BETTER_AUTH_URL_PROD" | vercel env add BETTER_AUTH_URL production >/dev/null 2>&1 \
  && echo "  BETTER_AUTH_URL -> production" || echo "  BETTER_AUTH_URL -> production (gia' presente, saltata)"
printf '%s' "$BETTER_AUTH_URL_PROD" | vercel env add BETTER_AUTH_URL preview >/dev/null 2>&1 \
  && echo "  BETTER_AUTH_URL -> preview" || echo "  BETTER_AUTH_URL -> preview (gia' presente, saltata)"

echo
echo "Fatto. Il prossimo deploy le prende."
