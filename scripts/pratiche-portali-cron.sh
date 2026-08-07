#!/bin/bash
# Giro schedulato delle pratiche dai portali partner.
# Lanciato da launchd 3 volte al giorno (vedi com.mcf.pratiche-portali.plist).
#
# Cosa fa:
#  1. scarica dallo store Blob le pratiche NUOVE (puller) -> cartelle in Clienti/
#  2. se ce ne sono, chiama Claude headless per l'analisi FIDI + recap WhatsApp
#  3. logga tutto in un file, cosi' Alberto puo' controllare cosa e' successo
#
# Non fa nulla se non ci sono pratiche nuove (il puller tiene un file di stato).

# no pipefail: il conteggio "zero novita'" usa grep|wc che altrimenti abortirebbe
set -eu

REPO="/Users/alberto/dev/mediocreditofacile"
LOG="$HOME/Desktop/PROGETTI/Clienti/.pratiche-portali-cron.log"
STAMP="$(/bin/date '+%Y-%m-%d %H:%M:%S')"

cd "$REPO"

# Carica le variabili d'ambiente (token Blob) senza stamparle
set -a
# shellcheck disable=SC1091
[ -f .env.local ] && . .env.local
set +a

# 1. Puller: scarica le pratiche nuove e restituisce il JSON delle novita'
NUOVE_JSON="$(/opt/homebrew/bin/node scripts/pull-pratiche-portali.mjs --json 2>>"$LOG" || echo '{"nuove":[]}')"
COUNT="$(printf '%s' "$NUOVE_JSON" | /usr/bin/grep -o '"id"' | /usr/bin/wc -l | /usr/bin/tr -d ' ')"

echo "[$STAMP] giro pratiche portali — nuove: $COUNT" >>"$LOG"

if [ "$COUNT" -eq 0 ]; then
  exit 0
fi

# 2. Analisi FIDI + notifica: la fa Claude headless (ha accesso a skill e MCP).
#    Gli passo il JSON delle pratiche nuove appena scaricate.
PROMPT="Sei lo scheduler automatico delle pratiche dei portali partner MCF. \
Sono appena state scaricate queste pratiche nuove (JSON con cartella locale, cliente e importo): ${NUOVE_JSON}. \
Per OGNI pratica: apri la sua cartella in ~/Desktop/PROGETTI/Clienti/, leggi i documenti in documenti/ (visura, bilanci, preventivo), \
esegui l'analisi FIDI di fattibilita' (skill processa-pratiche, solo Fase 3) e salva l'esito come ANALISI_FIDI_<cliente>.html nella cartella. \
Al termine mandami UN recap su WhatsApp (MCP wapp, alla mia chat personale) con, per ogni pratica: cliente, importo, esito di fattibilita' in una riga e gli eventuali red flag. \
Non chiedere conferme: e' un giro automatico non presidiato. Se una pratica non ha i documenti per l'analisi, segnalalo nel recap invece di inventare."

/usr/local/bin/claude -p "$PROMPT" >>"$LOG" 2>&1 || echo "[$STAMP] claude headless: errore (vedi sopra)" >>"$LOG"

echo "[$STAMP] giro completato" >>"$LOG"
