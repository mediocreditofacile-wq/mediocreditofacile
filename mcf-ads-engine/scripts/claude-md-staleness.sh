#!/usr/bin/env bash
# Livello 2 dell'auto-detect CLAUDE.md: rileva staleness.
#
# Confronta la data dell'ultimo commit che tocca il CLAUDE.md con i commit
# successivi che toccano aree strutturali del progetto. Se il CLAUDE.md e'
# piu' vecchio, stampa i commit "orfani" cosi' Claude vede a inizio sessione
# cosa potenzialmente manca dalla documentazione.
#
# Output silente se tutto e' allineato. Exit code sempre 0 (non bloccante).

set -euo pipefail

# Risali alla root del progetto (script vive in scripts/)
cd "$(dirname "$0")/.."

CLAUDE_MD="CLAUDE.md"
[ -f "$CLAUDE_MD" ] || exit 0

# Se non siamo in un repo git, esci pulito
git rev-parse --git-dir > /dev/null 2>&1 || exit 0

# Epoch dell'ultimo commit che tocca CLAUDE.md. Se il file non e' mai stato
# committato, usa il mtime del filesystem come fallback.
MD_COMMIT_TIME=$(git log -1 --format=%ct -- "$CLAUDE_MD" 2>/dev/null || true)
if [ -z "$MD_COMMIT_TIME" ]; then
  MD_COMMIT_TIME=$(stat -f %m "$CLAUDE_MD" 2>/dev/null || stat -c %Y "$CLAUDE_MD")
fi

# Aree considerate "strutturali": se cambiano qui, il CLAUDE.md probabilmente
# ha bisogno di un aggiornamento (nuovi moduli, config, endpoint, schedulazione).
STRUCTURAL_PATHS=(
  "collector/"
  "analyzer/"
  "writer/"
  "generator/"
  "notifier/"
  "dashboard/"
  "scheduler/"
  "utils/"
  "main.py"
  "config.yaml"
  "pyproject.toml"
)

# Commit successivi all'ultima modifica di CLAUDE.md che toccano aree strutturali
STALE_COMMITS=$(git log --since="@${MD_COMMIT_TIME}" --pretty=format:"  %h %ad %s" --date=short -- "${STRUCTURAL_PATHS[@]}" 2>/dev/null || true)

if [ -z "$STALE_COMMITS" ]; then
  exit 0
fi

# File unici modificati in quei commit (top 20)
STALE_FILES=$(git log --since="@${MD_COMMIT_TIME}" --name-only --pretty=format: -- "${STRUCTURAL_PATHS[@]}" 2>/dev/null | sort -u | grep -v '^$' | head -20)

echo "=== CLAUDE.md staleness check ==="
echo ""
echo "CLAUDE.md non e' stato aggiornato dopo questi commit strutturali:"
echo "$STALE_COMMITS"
echo ""
echo "File toccati nelle aree strutturali dopo l'ultimo update di CLAUDE.md:"
echo "$STALE_FILES" | sed 's/^/  /'
echo ""
echo "Valuta se il CLAUDE.md riflette ancora la realta' del codice prima di chiudere la sessione."

exit 0
