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


# --- Recommendations (budget advisor) routes ----------------------------------

def _write_recommendations(tmp_path, recs: list, date_str: str = "2026-04-21") -> Path:
    rec_dir = tmp_path / "recommendations"
    rec_dir.mkdir(parents=True, exist_ok=True)
    (rec_dir / f"{date_str}.json").write_text(
        json.dumps({"date": date_str, "recommendations": recs})
    )
    (tmp_path / "proposals").mkdir(exist_ok=True)
    return tmp_path


def _rec(
    campaign: str,
    action_type: str,
    current: float,
    recommended: float,
    alert_aggressive: bool = False,
    resource: str = "customers/123/campaignBudgets/999",
    **extra,
) -> dict:
    d = {
        "campaign": campaign,
        "trigger": "lost_budget_high",
        "action_type": action_type,
        "current_budget": current,
        "recommended_budget": recommended,
        "bid_change_pct": 0.0,
        "pillar_adgroup": "Pilastro X",
        "reason": "test reason",
        "priority": 2,
        "status": "pending",
        "campaign_budget_resource_name": resource,
    }
    if alert_aggressive:
        d["alert_aggressive"] = True
    d.update(extra)
    return d


def _get_client_with_recs(tmp_path):
    import os
    os.environ["PROPOSALS_DIR"] = str(tmp_path / "proposals")
    os.environ["RECOMMENDATIONS_DIR"] = str(tmp_path / "recommendations")
    os.environ["LANDING_PAGES_PATH"] = str(tmp_path / "landing-pages.json")
    os.environ["ANTHROPIC_API_KEY"] = "fake"
    os.environ["GOOGLE_ADS_CUSTOMER_ID"] = "123"
    from dashboard.server import app
    return TestClient(app)


def test_get_recommendations_latest_returns_file(tmp_path):
    _write_recommendations(tmp_path, [_rec("Camp A", "budget_increase", 10, 15)])
    client = _get_client_with_recs(tmp_path)
    response = client.get("/api/recommendations/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["date"] == "2026-04-21"
    assert len(data["recommendations"]) == 1
    assert data["recommendations"][0]["campaign"] == "Camp A"


def test_recommendations_reject_sets_status_without_api_call(tmp_path, monkeypatch):
    mock_update = MagicMock()
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    _write_recommendations(tmp_path, [_rec("Camp A", "budget_increase", 10, 15)])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "rejected",
    })
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    mock_update.assert_not_called()
    saved = json.loads((tmp_path / "recommendations" / "2026-04-21.json").read_text())
    assert saved["recommendations"][0]["status"] == "rejected"


def test_recommendations_approve_budget_increase_calls_update(tmp_path, monkeypatch):
    """Non-aggressivo: approve => chiama update_campaign_budget + status applied_budget."""
    mock_update = MagicMock(return_value={"resource_name": "x"})
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    _write_recommendations(tmp_path, [_rec("Camp A", "budget_increase", 10, 15)])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
    })
    assert response.status_code == 200
    mock_update.assert_called_once()
    args = mock_update.call_args.args
    # Signature: update_campaign_budget(customer_id, resource, new_daily_budget_euros)
    assert args[0] == "123"
    assert args[1] == "customers/123/campaignBudgets/999"
    assert args[2] == 15.0
    saved = json.loads((tmp_path / "recommendations" / "2026-04-21.json").read_text())
    assert saved["recommendations"][0]["status"] == "applied_budget"
    assert "applied_at" in saved["recommendations"][0]


def test_recommendations_aggressive_requires_force_apply(tmp_path, monkeypatch):
    """Aggressiva + force_apply=False => NON chiama API, requires_manual=True."""
    mock_update = MagicMock()
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    _write_recommendations(tmp_path, [
        _rec("Camp A", "budget_increase", 10, 25, alert_aggressive=True),
    ])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["requires_manual"] is True
    mock_update.assert_not_called()


def test_recommendations_aggressive_with_force_apply_executes(tmp_path, monkeypatch):
    """Aggressiva + force_apply=True => chiama API, status applied_budget."""
    mock_update = MagicMock(return_value={"resource_name": "x"})
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    _write_recommendations(tmp_path, [
        _rec("Camp A", "budget_increase", 10, 25, alert_aggressive=True),
    ])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
        "force_apply": True,
    })
    assert response.status_code == 200
    mock_update.assert_called_once()
    saved = json.loads((tmp_path / "recommendations" / "2026-04-21.json").read_text())
    assert saved["recommendations"][0]["status"] == "applied_budget"


def test_recommendations_bid_change_never_auto_applied(tmp_path, monkeypatch):
    """bid_increase/bid_decrease non devono mai chiamare update_campaign_budget."""
    mock_update = MagicMock()
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    _write_recommendations(tmp_path, [_rec("Camp A", "bid_increase", 20, 20)])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["requires_manual"] is True
    mock_update.assert_not_called()


def test_recommendations_budget_then_bid_review_applies_budget_and_notes_bid(
    tmp_path, monkeypatch,
):
    """Per budget_increase_then_bid_review: applica budget, nota bid manuale."""
    mock_update = MagicMock(return_value={"resource_name": "x"})
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    _write_recommendations(tmp_path, [
        _rec("Camp A", "budget_increase_then_bid_review", 10, 15),
    ])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
    })
    assert response.status_code == 200
    mock_update.assert_called_once()
    saved = json.loads((tmp_path / "recommendations" / "2026-04-21.json").read_text())
    assert saved["recommendations"][0]["status"] == "applied_budget"
    assert "bid" in saved["recommendations"][0]["note"].lower()


def test_recommendations_missing_resource_yields_apply_error(tmp_path, monkeypatch):
    """Senza campaign_budget_resource_name: status approved + apply_error, no API call."""
    mock_update = MagicMock()
    monkeypatch.setattr("dashboard.server.update_campaign_budget", mock_update)
    rec = _rec("Camp A", "budget_increase", 10, 15)
    del rec["campaign_budget_resource_name"]
    _write_recommendations(tmp_path, [rec])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
    })
    assert response.status_code == 200
    assert response.json()["apply_error"] is not None
    mock_update.assert_not_called()


def test_recommendations_api_failure_records_error(tmp_path, monkeypatch):
    """Se update_campaign_budget solleva, l'errore viene persistito."""
    monkeypatch.setattr(
        "dashboard.server.update_campaign_budget",
        MagicMock(side_effect=Exception("API error")),
    )
    _write_recommendations(tmp_path, [_rec("Camp A", "budget_increase", 10, 15)])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 0, "action": "approved",
    })
    assert response.status_code == 200
    saved = json.loads((tmp_path / "recommendations" / "2026-04-21.json").read_text())
    assert saved["recommendations"][0]["status"] == "approved"
    assert "API error" in saved["recommendations"][0]["apply_error"]


def test_recommendations_approve_with_invalid_index_returns_400(tmp_path):
    _write_recommendations(tmp_path, [_rec("Camp A", "budget_increase", 10, 15)])
    client = _get_client_with_recs(tmp_path)
    response = client.post("/api/recommendations/approve", json={
        "date": "2026-04-21", "index": 5, "action": "approved",
    })
    assert response.status_code == 400


def test_annotate_for_dashboard_fills_status_and_resource():
    """Unit test sull'helper di arricchimento (no server)."""
    from analyzer.budget_advisor import annotate_for_dashboard
    recs = [
        {"campaign": "Camp A", "action_type": "budget_increase",
         "current_budget": 10.0, "recommended_budget": 15.0},
    ]
    budgets = [
        {"campaign": "Camp A",
         "campaign_budget_resource_name": "customers/1/campaignBudgets/42",
         "daily_budget_euros": 10.0},
    ]
    out = annotate_for_dashboard(recs, budgets)
    assert out[0]["status"] == "pending"
    assert out[0]["campaign_budget_resource_name"] == "customers/1/campaignBudgets/42"


def test_annotate_for_dashboard_idempotent():
    """Se status o resource gia presenti, non devono essere sovrascritti."""
    from analyzer.budget_advisor import annotate_for_dashboard
    recs = [{
        "campaign": "Camp A", "action_type": "budget_increase",
        "current_budget": 10.0, "recommended_budget": 15.0,
        "status": "approved",
        "campaign_budget_resource_name": "customers/1/campaignBudgets/EXISTING",
    }]
    budgets = [{
        "campaign": "Camp A",
        "campaign_budget_resource_name": "customers/1/campaignBudgets/OTHER",
        "daily_budget_euros": 10.0,
    }]
    out = annotate_for_dashboard(recs, budgets)
    assert out[0]["status"] == "approved"
    assert out[0]["campaign_budget_resource_name"].endswith("EXISTING")
