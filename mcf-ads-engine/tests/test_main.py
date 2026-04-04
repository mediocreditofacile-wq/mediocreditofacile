# mcf-ads-engine/tests/test_main.py
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from main import build_proposals


def test_build_proposals_structure():
    scores = {
        "to_pause": [{"keyword": "kw1", "status": "pending"}],
        "to_reward": [],
        "to_review": [],
    }
    result = build_proposals(scores, date_str="2026-03-11")
    assert result["date"] == "2026-03-11"
    assert "to_pause" in result
    assert "landing_proposals" in result
    assert "campaign_drafts" in result
    assert result["to_pause"][0]["keyword"] == "kw1"
