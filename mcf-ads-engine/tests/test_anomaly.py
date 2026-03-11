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
