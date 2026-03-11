# tests/test_anomaly.py
from unittest.mock import patch, MagicMock
from collector.google_ads import fetch_daily_metrics


def _make_row(campaign, date, cost_micros, clicks, impressions, conversions):
    row = MagicMock()
    row.campaign.name = campaign
    row.segments.date = date
    row.metrics.cost_micros = cost_micros
    row.metrics.clicks = clicks
    row.metrics.impressions = impressions
    row.metrics.conversions = conversions
    return row


def test_fetch_daily_metrics_returns_list():
    mock_row = _make_row("Camp A", "2026-03-10", 10_000_000, 50, 1000, 2.0)
    with patch("collector.google_ads.GoogleAdsClient") as MockClient:
        mock_service = MagicMock()
        MockClient.load_from_storage.return_value.get_service.return_value = mock_service
        mock_service.search.return_value = [mock_row]
        result = fetch_daily_metrics("1234567890", "google-ads.yaml")
    assert len(result) == 1
    row = result[0]
    assert row["campaign"] == "Camp A"
    assert row["date"] == "2026-03-10"
    assert row["cost"] == 10.0
    assert row["clicks"] == 50
    assert row["impressions"] == 1000
    assert row["conversions"] == 2.0
    assert row["cpc"] == round(10.0 / 50, 4)
    assert row["ctr"] == round(50 / 1000, 4)


from analyzer.anomaly import compute_account_totals


def test_compute_account_totals_aggregates_by_date():
    daily_data = [
        {"date": "2026-03-10", "campaign": "A", "cost": 10.0, "clicks": 20,
         "impressions": 400, "conversions": 1.0, "cpc": 0.5, "ctr": 0.05},
        {"date": "2026-03-10", "campaign": "B", "cost": 5.0, "clicks": 10,
         "impressions": 200, "conversions": 0.0, "cpc": 0.5, "ctr": 0.05},
        {"date": "2026-03-11", "campaign": "A", "cost": 20.0, "clicks": 40,
         "impressions": 800, "conversions": 2.0, "cpc": 0.5, "ctr": 0.05},
    ]
    totals = compute_account_totals(daily_data)
    assert set(totals.keys()) == {"2026-03-10", "2026-03-11"}
    assert totals["2026-03-10"]["cost"] == 15.0
    assert totals["2026-03-10"]["clicks"] == 30
    assert totals["2026-03-10"]["impressions"] == 600
    assert totals["2026-03-10"]["conversions"] == 1.0
    assert totals["2026-03-11"]["cost"] == 20.0
    # cpc = cost/clicks, ctr = clicks/impressions — recomputed from totals
    assert totals["2026-03-10"]["cpc"] == round(15.0 / 30, 4)
    assert totals["2026-03-10"]["ctr"] == round(30 / 600, 4)
