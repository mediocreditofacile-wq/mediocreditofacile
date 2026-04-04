# mcf-ads-engine/tests/test_server.py
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def tmp_proposals(tmp_path):
    """Write a sample proposals file and return its path."""
    proposals = {
        "date": "2026-03-11",
        "to_pause": [{"keyword": "test kw", "campaign": "C", "ad_group": "AG",
                       "cost": 12.0, "conversions": 0, "match_type": "PHRASE",
                       "reason": "costo_elevato_zero_conversioni", "status": "pending"}],
        "to_reward": [],
        "to_review": [],
        "landing_proposals": [],
        "campaign_drafts": [],
    }
    p = tmp_path / "proposals" / "2026-03-11.json"
    p.parent.mkdir()
    p.write_text(json.dumps(proposals))
    return tmp_path


def get_test_client(proposals_dir):
    import os
    os.environ["PROPOSALS_DIR"] = str(proposals_dir / "proposals")
    os.environ["LANDING_PAGES_PATH"] = str(proposals_dir / "landing-pages.json")
    os.environ["ANTHROPIC_API_KEY"] = "fake"
    os.environ["GOOGLE_ADS_CUSTOMER_ID"] = "123"
    from dashboard.server import app
    return TestClient(app)


def test_get_proposals_returns_latest(tmp_proposals):
    client = get_test_client(tmp_proposals)
    response = client.get("/api/proposals/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["date"] == "2026-03-11"
    assert len(data["to_pause"]) == 1


def test_approve_pause_updates_status(tmp_proposals):
    client = get_test_client(tmp_proposals)
    response = client.post("/api/actions/approve", json={
        "date": "2026-03-11",
        "list": "to_pause",
        "index": 0,
        "action": "approved"
    })
    assert response.status_code == 200
    # Verify file was updated
    proposals_file = tmp_proposals / "proposals" / "2026-03-11.json"
    data = json.loads(proposals_file.read_text())
    assert data["to_pause"][0]["status"] == "approved"


def test_reject_sets_status_rejected(tmp_proposals):
    client = get_test_client(tmp_proposals)
    response = client.post("/api/actions/approve", json={
        "date": "2026-03-11",
        "list": "to_pause",
        "index": 0,
        "action": "rejected"
    })
    assert response.status_code == 200
    proposals_file = tmp_proposals / "proposals" / "2026-03-11.json"
    data = json.loads(proposals_file.read_text())
    assert data["to_pause"][0]["status"] == "rejected"


# --- Auto-execute tests ---

@pytest.fixture
def tmp_proposals_with_resource(tmp_path):
    """Proposals con resource_name per testare auto-execute."""
    proposals = {
        "date": "2026-03-11",
        "to_pause": [{"keyword": "test kw", "campaign": "C", "ad_group": "AG",
                       "resource_name": "customers/123/adGroupCriteria/111~222",
                       "cost": 12.0, "conversions": 0, "match_type": "PHRASE",
                       "reason": "costo_elevato_zero_conversioni", "status": "pending"}],
        "to_reward": [{"keyword": "top kw", "campaign": "C", "ad_group": "AG",
                        "resource_name": "customers/123/adGroupCriteria/111~333",
                        "cost": 5.0, "conversions": 3, "match_type": "BROAD",
                        "bid_suggestion": 2.0, "status": "pending"}],
        "to_review": [],
        "landing_proposals": [],
        "campaign_drafts": [],
    }
    p = tmp_path / "proposals" / "2026-03-11.json"
    p.parent.mkdir()
    p.write_text(json.dumps(proposals))
    return tmp_path


def test_approve_pause_calls_pause_keyword_api(tmp_proposals_with_resource, monkeypatch):
    """Approvare un to_pause deve chiamare pause_keyword() automaticamente."""
    mock_pause = MagicMock(return_value={"resource_name": "customers/123/adGroupCriteria/111~222"})
    monkeypatch.setattr("dashboard.server.pause_keyword", mock_pause)
    client = get_test_client(tmp_proposals_with_resource)
    client.post("/api/actions/approve", json={
        "date": "2026-03-11", "list": "to_pause", "index": 0, "action": "approved"
    })
    mock_pause.assert_called_once()


def test_approve_pause_sets_status_applied_on_success(tmp_proposals_with_resource, monkeypatch):
    """Dopo pause_keyword() riuscito, status deve diventare 'applied'."""
    monkeypatch.setattr("dashboard.server.pause_keyword",
                        MagicMock(return_value={"resource_name": "x"}))
    client = get_test_client(tmp_proposals_with_resource)
    client.post("/api/actions/approve", json={
        "date": "2026-03-11", "list": "to_pause", "index": 0, "action": "approved"
    })
    proposals_file = tmp_proposals_with_resource / "proposals" / "2026-03-11.json"
    data = json.loads(proposals_file.read_text())
    assert data["to_pause"][0]["status"] == "applied"


def test_approve_pause_sets_apply_error_on_api_failure(tmp_proposals_with_resource, monkeypatch):
    """Se pause_keyword() fallisce, status rimane 'approved' e viene aggiunto apply_error."""
    monkeypatch.setattr("dashboard.server.pause_keyword",
                        MagicMock(side_effect=Exception("API error")))
    client = get_test_client(tmp_proposals_with_resource)
    client.post("/api/actions/approve", json={
        "date": "2026-03-11", "list": "to_pause", "index": 0, "action": "approved"
    })
    proposals_file = tmp_proposals_with_resource / "proposals" / "2026-03-11.json"
    data = json.loads(proposals_file.read_text())
    assert data["to_pause"][0]["status"] == "approved"
    assert "apply_error" in data["to_pause"][0]


def test_approve_reward_calls_update_keyword_bid(tmp_proposals_with_resource, monkeypatch):
    """Approvare un to_reward deve chiamare update_keyword_bid() automaticamente."""
    mock_bid = MagicMock(return_value={"resource_name": "x"})
    monkeypatch.setattr("dashboard.server.update_keyword_bid", mock_bid)
    client = get_test_client(tmp_proposals_with_resource)
    client.post("/api/actions/approve", json={
        "date": "2026-03-11", "list": "to_reward", "index": 0, "action": "approved"
    })
    mock_bid.assert_called_once()


# --- Negatives routes ---

@pytest.fixture
def tmp_negatives(tmp_path):
    """Scrive un file negatives di esempio e restituisce il tmp_path."""
    negatives = {
        "date": "2026-03-11",
        "negatives": [
            {
                "search_term": "noleggio auto privati",
                "campaign": "Noleggio Operativo",
                "ad_group": "Generico",
                "category": "Irrelevant",
                "status": "pending",
                "impressions": 50,
                "clicks": 5,
                "cost": 2.5,
                "conversions": 0,
            }
        ],
    }
    neg_dir = tmp_path / "negatives"
    neg_dir.mkdir()
    (neg_dir / "2026-03-11.json").write_text(json.dumps(negatives))
    # Proposals dir necessaria per get_test_client
    proposals_dir = tmp_path / "proposals"
    proposals_dir.mkdir()
    return tmp_path


def get_test_client_with_negatives(tmp_path):
    import os
    os.environ["PROPOSALS_DIR"] = str(tmp_path / "proposals")
    os.environ["NEGATIVES_DIR"] = str(tmp_path / "negatives")
    os.environ["LANDING_PAGES_PATH"] = str(tmp_path / "landing-pages.json")
    os.environ["ANTHROPIC_API_KEY"] = "fake"
    from dashboard.server import app
    return TestClient(app)


def test_get_negatives_returns_latest(tmp_negatives):
    client = get_test_client_with_negatives(tmp_negatives)
    response = client.get("/api/negatives/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["date"] == "2026-03-11"
    assert len(data["negatives"]) == 1
    assert data["negatives"][0]["search_term"] == "noleggio auto privati"


def test_approve_negative_updates_status(tmp_negatives):
    client = get_test_client_with_negatives(tmp_negatives)
    response = client.post("/api/negatives/approve", json={
        "date": "2026-03-11",
        "index": 0,
        "action": "approved",
    })
    assert response.status_code == 200
    neg_file = tmp_negatives / "negatives" / "2026-03-11.json"
    data = json.loads(neg_file.read_text())
    assert data["negatives"][0]["status"] == "approved"


def test_approve_negative_calls_add_negative_keyword_api(monkeypatch, tmp_path):
    """Approvare un negative deve chiamare add_negative_keyword() automaticamente."""
    negatives = {
        "date": "2026-03-11",
        "negatives": [{
            "search_term": "noleggio auto privati",
            "campaign": "Noleggio",
            "ad_group": "Generico",
            "ad_group_resource_name": "customers/123/adGroups/111",
            "category": "Irrelevant",
            "status": "pending",
            "impressions": 50, "clicks": 5, "cost": 2.5, "conversions": 0,
        }],
    }
    neg_dir = tmp_path / "negatives"
    neg_dir.mkdir()
    (neg_dir / "2026-03-11.json").write_text(json.dumps(negatives))
    (tmp_path / "proposals").mkdir()

    mock_add = MagicMock(return_value={"resource_name": "x"})
    monkeypatch.setattr("dashboard.server.add_negative_keyword", mock_add)

    import os
    os.environ["NEGATIVES_DIR"] = str(neg_dir)
    os.environ["PROPOSALS_DIR"] = str(tmp_path / "proposals")
    os.environ["LANDING_PAGES_PATH"] = str(tmp_path / "landing-pages.json")
    os.environ["ANTHROPIC_API_KEY"] = "fake"
    from dashboard.server import app
    from fastapi.testclient import TestClient
    client = TestClient(app)
    client.post("/api/negatives/approve", json={
        "date": "2026-03-11", "index": 0, "action": "approved"
    })
    mock_add.assert_called_once()


def test_budget_update_route_calls_update_campaign_budget(monkeypatch, tmp_path):
    """POST /api/budget/update deve chiamare update_campaign_budget()."""
    mock_update = MagicMock(return_value={"resource_name": "customers/123/campaignBudgets/999"})
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    (tmp_path / "proposals").mkdir()
    import os
    os.environ["PROPOSALS_DIR"] = str(tmp_path / "proposals")
    os.environ["LANDING_PAGES_PATH"] = str(tmp_path / "landing-pages.json")
    os.environ["ANTHROPIC_API_KEY"] = "fake"
    from dashboard.server import app
    from fastapi.testclient import TestClient
    client = TestClient(app)
    response = client.post("/api/budget/update", json={
        "campaign_budget_resource_name": "customers/123/campaignBudgets/999",
        "new_daily_budget_euros": 15.0,
    })
    assert response.status_code == 200
    mock_update.assert_called_once()


def test_export_negatives_csv_returns_csv_content(tmp_negatives):
    # Prima approva il negative
    client = get_test_client_with_negatives(tmp_negatives)
    client.post("/api/negatives/approve", json={
        "date": "2026-03-11", "index": 0, "action": "approved"
    })
    response = client.post("/api/negatives/export", json={"date": "2026-03-11"})
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "noleggio auto privati" in response.text
    assert "Campaign" in response.text
