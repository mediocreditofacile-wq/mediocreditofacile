"""Test per utils/claude_md.py — update deterministico del CLAUDE.md."""
import pytest
from pathlib import Path

from utils.claude_md import update_last_run


FIXTURE = """Stato attuale:
- Ultimo run daily: 2026-01-01. Ultimo run weekly (negatives): 2026-01-02.
- 66 test (pytest)
- Dashboard FastAPI funzionante
"""


def test_update_daily_sostituisce_data(tmp_path):
    f = tmp_path / "CLAUDE.md"
    f.write_text(FIXTURE, encoding="utf-8")

    ok = update_last_run("daily", "2026-04-20", path=f)

    assert ok is True
    content = f.read_text(encoding="utf-8")
    assert "Ultimo run daily: 2026-04-20" in content
    # weekly non deve cambiare
    assert "Ultimo run weekly (negatives): 2026-01-02" in content


def test_update_weekly_sostituisce_data(tmp_path):
    f = tmp_path / "CLAUDE.md"
    f.write_text(FIXTURE, encoding="utf-8")

    ok = update_last_run("weekly", "2026-04-20", path=f)

    assert ok is True
    content = f.read_text(encoding="utf-8")
    assert "Ultimo run weekly (negatives): 2026-04-20" in content
    # daily non deve cambiare
    assert "Ultimo run daily: 2026-01-01" in content


def test_update_file_mancante_ritorna_false(tmp_path):
    f = tmp_path / "non_esiste.md"
    assert update_last_run("daily", "2026-04-20", path=f) is False


def test_update_pattern_non_trovato_ritorna_false(tmp_path):
    f = tmp_path / "CLAUDE.md"
    f.write_text("File senza righe riconoscibili.\n", encoding="utf-8")
    assert update_last_run("daily", "2026-04-20", path=f) is False


def test_update_mode_invalido_solleva(tmp_path):
    f = tmp_path / "CLAUDE.md"
    f.write_text(FIXTURE, encoding="utf-8")
    with pytest.raises(ValueError):
        update_last_run("monthly", "2026-04-20", path=f)
