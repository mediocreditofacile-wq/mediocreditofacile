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


import pytest
from analyzer.anomaly import compute_account_totals
from analyzer.anomaly import detect_anomalies


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


def _make_daily_data(today_cost, baseline_cost_per_day=20.0, today_date="2026-03-11"):
    """Helper: 7 giorni di baseline + 1 giorno odierno, una sola campagna."""
    rows = []
    dates = [
        "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07",
        "2026-03-08", "2026-03-09", "2026-03-10",
    ]
    for d in dates:
        rows.append({
            "date": d, "campaign": "Camp A",
            "cost": baseline_cost_per_day, "clicks": 100,
            "impressions": 2000, "conversions": 2.0,
            "cpc": baseline_cost_per_day / 100,
            "ctr": round(100 / 2000, 4),
        })
    rows.append({
        "date": today_date, "campaign": "Camp A",
        "cost": today_cost, "clicks": 100,
        "impressions": 2000, "conversions": 2.0,
        "cpc": today_cost / 100,
        "ctr": round(100 / 2000, 4),
    })
    return rows


def test_detect_anomalies_cost_spike():
    # costo oggi = 32 (+60% vs media 20) → soglia 50% → anomalia
    thresholds = {"cost_increase_pct": 50, "cpc_increase_pct": 30,
                  "ctr_decrease_pct": 40, "conversions_decrease_pct": 50}
    data = _make_daily_data(today_cost=32.0)
    result = detect_anomalies(data, thresholds)
    assert result["date"] == "2026-03-11"
    anomaly_metrics = [a["metric"] for a in result["account"]["anomalies"]]
    assert "cost" in anomaly_metrics
    delta = next(a for a in result["account"]["anomalies"] if a["metric"] == "cost")
    assert delta["delta_pct"] == pytest.approx(60.0, abs=0.1)


def test_detect_anomalies_no_anomaly():
    thresholds = {"cost_increase_pct": 50, "cpc_increase_pct": 30,
                  "ctr_decrease_pct": 40, "conversions_decrease_pct": 50}
    data = _make_daily_data(today_cost=21.0)  # +5% — sotto soglia
    result = detect_anomalies(data, thresholds)
    assert result["account"]["anomalies"] == []
    assert result["campaigns"] == []


def test_detect_anomalies_ctr_drop():
    # CTR oggi dimezzato rispetto alla baseline
    rows = []
    dates = [
        "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07",
        "2026-03-08", "2026-03-09", "2026-03-10",
    ]
    for d in dates:
        rows.append({
            "date": d, "campaign": "Camp A",
            "cost": 20.0, "clicks": 100, "impressions": 1000,
            "conversions": 2.0, "cpc": 0.2, "ctr": 0.1,
        })
    rows.append({
        "date": "2026-03-11", "campaign": "Camp A",
        "cost": 20.0, "clicks": 50, "impressions": 1000,
        "conversions": 2.0, "cpc": 0.4, "ctr": 0.05,
    })
    thresholds = {"cost_increase_pct": 50, "cpc_increase_pct": 30,
                  "ctr_decrease_pct": 40, "conversions_decrease_pct": 50}
    result = detect_anomalies(rows, thresholds)
    anomaly_metrics = [a["metric"] for a in result["account"]["anomalies"]]
    assert "ctr" in anomaly_metrics


def test_detect_anomalies_campaign_level():
    # Due campagne: solo Camp B ha anomalia
    rows = []
    dates = [
        "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07",
        "2026-03-08", "2026-03-09", "2026-03-10",
    ]
    for d in dates:
        rows.append({"date": d, "campaign": "Camp A", "cost": 20.0, "clicks": 100,
                     "impressions": 2000, "conversions": 2.0, "cpc": 0.2, "ctr": 0.05})
        rows.append({"date": d, "campaign": "Camp B", "cost": 5.0, "clicks": 50,
                     "impressions": 500, "conversions": 1.0, "cpc": 0.1, "ctr": 0.1})
    # Oggi: Camp A normale, Camp B con spike costo +80%
    rows.append({"date": "2026-03-11", "campaign": "Camp A", "cost": 20.0, "clicks": 100,
                 "impressions": 2000, "conversions": 2.0, "cpc": 0.2, "ctr": 0.05})
    rows.append({"date": "2026-03-11", "campaign": "Camp B", "cost": 9.0, "clicks": 50,
                 "impressions": 500, "conversions": 1.0, "cpc": 0.18, "ctr": 0.1})
    thresholds = {"cost_increase_pct": 50, "cpc_increase_pct": 30,
                  "ctr_decrease_pct": 40, "conversions_decrease_pct": 50}
    result = detect_anomalies(rows, thresholds)
    campaign_names = [c["campaign"] for c in result["campaigns"]]
    assert "Camp B" in campaign_names
    assert "Camp A" not in campaign_names


from notifier.email import build_anomaly_html


def _make_anomaly_result():
    return {
        "date": "2026-03-11",
        "account": {
            "today": {"cost": 45.0, "clicks": 200, "impressions": 4000,
                      "conversions": 3.0, "cpc": 0.225, "ctr": 0.05},
            "avg_7d": {"cost": 28.0, "clicks": 200, "impressions": 4000,
                       "conversions": 3.0, "cpc": 0.14, "ctr": 0.05},
            "anomalies": [{"metric": "cost", "today": 45.0, "avg_7d": 28.0, "delta_pct": 60.7}],
        },
        "campaigns": [
            {
                "campaign": "Fotovoltaico Aziendale",
                "today": {"cost": 45.0, "clicks": 200, "impressions": 4000,
                          "conversions": 3.0, "cpc": 0.225, "ctr": 0.05},
                "avg_7d": {"cost": 28.0, "clicks": 200, "impressions": 4000,
                           "conversions": 3.0, "cpc": 0.14, "ctr": 0.05},
                "anomalies": [{"metric": "cost", "today": 45.0, "avg_7d": 28.0, "delta_pct": 60.7}],
            }
        ],
    }


def test_build_anomaly_html_contains_delta():
    result = _make_anomaly_result()
    html = build_anomaly_html(result, "2026-03-11")
    assert "2026-03-11" in html
    assert "60.7" in html
    assert "cost" in html.lower()
    assert "Fotovoltaico Aziendale" in html


def test_build_anomaly_html_shows_today_vs_avg():
    result = _make_anomaly_result()
    html = build_anomaly_html(result, "2026-03-11")
    assert "45.0" in html   # today cost
    assert "28.0" in html   # avg_7d cost
