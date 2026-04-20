"""Aggiorna il CLAUDE.md con la data dell'ultimo run dell'engine.

Livello 1 dell'auto-detect CLAUDE.md: sostituzione deterministica delle righe
"Ultimo run daily" e "Ultimo run weekly (negatives)" nella sezione "Stato attuale".
Nessuna AI, nessuna ambiguita': o il campo e' aggiornato, o l'engine non ha girato.
"""
import re
from pathlib import Path
from typing import Optional

# Path di default: CLAUDE.md nella root del progetto (parent di utils/)
DEFAULT_CLAUDE_MD = Path(__file__).resolve().parent.parent / "CLAUDE.md"


def update_last_run(mode: str, date_str: str, path: Optional[Path] = None) -> bool:
    """Sostituisce la data dell'ultimo run nel CLAUDE.md.

    Args:
        mode: 'daily' oppure 'weekly'.
        date_str: data ISO (YYYY-MM-DD).
        path: path opzionale del CLAUDE.md (default: root progetto).

    Returns:
        True se la riga e' stata trovata e aggiornata, False altrimenti.
    """
    target = path or DEFAULT_CLAUDE_MD
    if not target.exists():
        return False

    if mode == "daily":
        # Matcha "Ultimo run daily: YYYY-MM-DD" e cattura il prefisso per preservarlo
        pattern = r"(Ultimo run daily: )\d{4}-\d{2}-\d{2}"
    elif mode == "weekly":
        pattern = r"(Ultimo run weekly \(negatives\): )\d{4}-\d{2}-\d{2}"
    else:
        raise ValueError("mode deve essere 'daily' o 'weekly', ricevuto: %s" % mode)

    content = target.read_text(encoding="utf-8")
    new_content, n = re.subn(pattern, r"\g<1>" + date_str, content)
    if n == 0:
        return False

    target.write_text(new_content, encoding="utf-8")
    return True
