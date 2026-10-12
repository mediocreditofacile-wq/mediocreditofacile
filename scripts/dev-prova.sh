#!/bin/sh
# Sito in locale sul branch Neon di PROVA invece che sulla produzione.
# Serve a provare i portali nominali con gli utenti di prova (seed:motore-demo
# -- --prova) senza scrivere niente sul database vero. Le variabili gia'
# presenti nell'ambiente vincono su .env.local, quindi basta esportarla qui.
set -e
URL=$(grep '^DATABASE_URL_TEST=' .env.local | cut -d= -f2- | sed 's/^"//; s/"$//')
[ -n "$URL" ] || { echo "DATABASE_URL_TEST mancante in .env.local"; exit 1; }
# Se il microservizio PDF gira in locale (porta 8787, avviato con
# PROSPETTI_TOKEN=dev-token), i prospetti si generano li' e non in produzione:
# serve a provare una modifica del microservizio prima di pubblicarla.
if curl -s -m 1 http://127.0.0.1:8787/api/prospetti >/dev/null 2>&1; then
  export PROSPETTI_PDF_URL="http://127.0.0.1:8787/api/prospetti"
  export PROSPETTI_TOKEN="dev-token"
  echo "prospetti PDF: microservizio locale"
fi
DATABASE_URL="$URL" exec npx astro dev "$@"
