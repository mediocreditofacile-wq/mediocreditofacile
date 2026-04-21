# Anomaly Detection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect anomalous variations in Google Ads campaign performance (cost spikes, CPC increases, CTR/conversion drops) and send a separate alert email when anomalies are found.

**Architecture:** A new GAQL query fetches 8 days of daily data; `analyzer/anomaly.py` computes 7-day baselines and detects deviations; `notifier/email.py` gets two new functions for the alert email; `main.py` runs the check after the normal daily fetch. No existing flow is altered — the anomaly alert is purely additive.

**Tech Stack:** Python 3.9, google-ads SDK (GAQL), PyYAML, resend

---

**Spec:** `docs/superpowers/specs/2026-03-11-anomaly-detection-design.md`

**Working directory for all commands:** `mcf-ads-engine/` (activate venv first: `source .venv/bin/activate`)

---

## Chunk 1: collector + analyzer

### Task 1: `fetch_daily_metrics()` in collector/google_ads.py

**Files:**
- Modify: `collector/google_ads.py` (append after line 67)
- Test: `tests/test_anomaly.py` (create)

- [ ] **Step 1: Create `tests/test_anomaly.py` with the collector test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
source .venv/bin/activate
pytest tests/test_anomaly.py::test_fetch_daily_metrics_returns_list -v
```
Expected: FAIL with `ImportError` or `AttributeError: fetch_daily_metrics`

- [ ] **Step 3: Implement `fetch_daily_metrics()` — append to `collector/google_ads.py`**

Add after the last line of the file:

```python

DAILY_GAQL = """
SELECT
  campaign.name,
  segments.date,
  metrics.cost_micros,
  metrics.clicks,
  metrics.impressions,
  metrics.conversions
FROM campaign
WHERE segments.date DURING LAST_8_DAYS
  AND campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
ORDER BY segments.date ASC
"""


def fetch_daily_metrics(customer_id: str, yaml_path: str = "google-ads.yaml") -> list:
    """Scarica 8 giorni di dati giornalieri per campagna per il rilevamento anomalie."""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=DAILY_GAQL)

    rows = []
    for api_row in response:
        m = api_row.metrics
        cost = m.cost_micros / 1_000_000
        clicks = m.clicks
        impressions = m.impressions
        rows.append({
            "campaign": api_row.campaign.name,
            "date": api_row.segments.date,
            "cost": round(cost, 4),
            "clicks": clicks,
            "impressions": impressions,
            "conversions": m.conversions,
            "cpc": round(cost / clicks, 4) if clicks > 0 else 0.0,
            "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
        })
    return rows
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_anomaly.py::test_fetch_daily_metrics_returns_list -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add collector/google_ads.py tests/test_anomaly.py
git commit -m "feat: add fetch_daily_metrics() for anomaly detection"
```

---

### Task 2: `analyzer/anomaly.py` — `compute_account_totals()`

**Files:**
- Create: `analyzer/anomaly.py`
- Test: `tests/test_anomaly.py` (append)

- [ ] **Step 1: Add test for `compute_account_totals()`**

Append to `tests/test_anomaly.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_anomaly.py::test_compute_account_totals_aggregates_by_date -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'analyzer.anomaly'`

- [ ] **Step 3: Create `analyzer/anomaly.py` with `compute_account_totals()`**

```python
# analyzer/anomaly.py
from collections import defaultdict


def compute_account_totals(daily_data: list) -> dict:
    """Aggrega i dati di tutte le campagne per data, restituisce totali account."""
    acc = defaultdict(lambda: {"cost": 0.0, "clicks": 0, "impressions": 0, "conversions": 0.0})
    for row in daily_data:
        d = row["date"]
        acc[d]["cost"] = round(acc[d]["cost"] + row["cost"], 4)
        acc[d]["clicks"] += row["clicks"]
        acc[d]["impressions"] += row["impressions"]
        acc[d]["conversions"] += row["conversions"]

    result = {}
    for d, v in acc.items():
        clicks = v["clicks"]
        impressions = v["impressions"]
        result[d] = {
            "cost": v["cost"],
            "clicks": clicks,
            "impressions": impressions,
            "conversions": v["conversions"],
            "cpc": round(v["cost"] / clicks, 4) if clicks > 0 else 0.0,
            "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
        }
    return result
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_anomaly.py::test_compute_account_totals_aggregates_by_date -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add analyzer/anomaly.py tests/test_anomaly.py
git commit -m "feat: add compute_account_totals() in analyzer/anomaly"
```

---

### Task 3: `detect_anomalies()` in analyzer/anomaly.py

**Files:**
- Modify: `analyzer/anomaly.py`
- Test: `tests/test_anomaly.py` (append)

- [ ] **Step 1: Add tests for `detect_anomalies()`**

Append to `tests/test_anomaly.py`:

```python
from analyzer.anomaly import detect_anomalies


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
```

Also add `import pytest` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_anomaly.py -k "detect_anomalies" -v
```
Expected: FAIL with `ImportError: cannot import name 'detect_anomalies'`

- [ ] **Step 3: Implement `detect_anomalies()` — append to `analyzer/anomaly.py`**

```python

def _campaign_totals_by_date(daily_data: list, campaign: str) -> dict:
    """Filtra i dati per una campagna e aggrega (in questo caso 1 campagna = 1 riga/giorno)."""
    filtered = [r for r in daily_data if r["campaign"] == campaign]
    return compute_account_totals(filtered)


def _check_metric(today_val, avg_val, metric, thresholds) -> dict | None:
    """Restituisce un'anomalia se la deviazione supera la soglia, altrimenti None."""
    if avg_val == 0:
        return None
    delta_pct = (today_val - avg_val) / avg_val * 100

    increase_metrics = {
        "cost": thresholds.get("cost_increase_pct", 50),
        "cpc": thresholds.get("cpc_increase_pct", 30),
    }
    decrease_metrics = {
        "ctr": thresholds.get("ctr_decrease_pct", 40),
        "conversions": thresholds.get("conversions_decrease_pct", 50),
    }

    if metric in increase_metrics and delta_pct > increase_metrics[metric]:
        return {"metric": metric, "today": today_val, "avg_7d": round(avg_val, 4),
                "delta_pct": round(delta_pct, 1)}
    if metric in decrease_metrics and delta_pct < -decrease_metrics[metric]:
        return {"metric": metric, "today": today_val, "avg_7d": round(avg_val, 4),
                "delta_pct": round(delta_pct, 1)}
    return None


def detect_anomalies(daily_data: list, thresholds: dict) -> dict:
    """
    Rileva anomalie rispetto alla media degli ultimi 7 giorni.

    Args:
        daily_data: lista di righe {date, campaign, cost, clicks, impressions,
                    conversions, cpc, ctr}
        thresholds: dict con cost_increase_pct, cpc_increase_pct,
                    ctr_decrease_pct, conversions_decrease_pct
    Returns:
        dict con date, account (today, avg_7d, anomalies), campaigns (lista campagne anomale)
    """
    if not daily_data:
        return {"date": None, "account": {"today": {}, "avg_7d": {}, "anomalies": []},
                "campaigns": []}

    account_totals = compute_account_totals(daily_data)
    sorted_dates = sorted(account_totals.keys())

    if len(sorted_dates) < 2:
        return {"date": sorted_dates[0] if sorted_dates else None,
                "account": {"today": {}, "avg_7d": {}, "anomalies": []},
                "campaigns": []}

    today_date = sorted_dates[-1]
    baseline_dates = sorted_dates[:-1]

    today_account = account_totals[today_date]
    metrics_to_check = ["cost", "cpc", "ctr", "conversions"]

    # Calcola medie 7gg account
    avg_7d = {}
    for m in metrics_to_check:
        vals = [account_totals[d][m] for d in baseline_dates]
        avg_7d[m] = sum(vals) / len(vals)

    account_anomalies = []
    for m in metrics_to_check:
        anomaly = _check_metric(today_account[m], avg_7d[m], m, thresholds)
        if anomaly:
            account_anomalies.append(anomaly)

    # Analisi per campagna
    campaigns_with_anomalies = []
    campaign_names = {r["campaign"] for r in daily_data}
    for camp in sorted(campaign_names):
        camp_totals = _campaign_totals_by_date(daily_data, camp)
        camp_dates = sorted(camp_totals.keys())
        if len(camp_dates) < 2:
            continue
        camp_today_date = camp_dates[-1]
        if camp_today_date != today_date:
            continue
        camp_baseline = camp_dates[:-1]
        camp_today = camp_totals[camp_today_date]
        camp_avg = {}
        for m in metrics_to_check:
            vals = [camp_totals[d][m] for d in camp_baseline]
            camp_avg[m] = sum(vals) / len(vals)
        camp_anomalies = []
        for m in metrics_to_check:
            anomaly = _check_metric(camp_today[m], camp_avg[m], m, thresholds)
            if anomaly:
                camp_anomalies.append(anomaly)
        if camp_anomalies:
            campaigns_with_anomalies.append({
                "campaign": camp,
                "today": camp_today,
                "avg_7d": {m: round(camp_avg[m], 4) for m in metrics_to_check},
                "anomalies": camp_anomalies,
            })

    return {
        "date": today_date,
        "account": {
            "today": today_account,
            "avg_7d": {m: round(avg_7d[m], 4) for m in metrics_to_check},
            "anomalies": account_anomalies,
        },
        "campaigns": campaigns_with_anomalies,
    }
```

- [ ] **Step 4: Run all anomaly analyzer tests**

```bash
pytest tests/test_anomaly.py -k "compute_account_totals or detect_anomalies" -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add analyzer/anomaly.py tests/test_anomaly.py
git commit -m "feat: implement detect_anomalies() with account and campaign-level detection"
```

---

## Chunk 2: notifier + config + main integration

### Task 4: `build_anomaly_html()` and `send_anomaly_alert()` in notifier/email.py

**Files:**
- Modify: `notifier/email.py` (append after line 61)
- Test: `tests/test_anomaly.py` (append)

- [ ] **Step 1: Add test for `build_anomaly_html()`**

Append to `tests/test_anomaly.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_anomaly.py -k "build_anomaly_html" -v
```
Expected: FAIL with `ImportError: cannot import name 'build_anomaly_html'`

- [ ] **Step 3: Append `build_anomaly_html()` and `send_anomaly_alert()` to `notifier/email.py`**

```python


def build_anomaly_html(result: dict, date_str: str) -> str:
    account = result["account"]
    today = account["today"]
    avg = account["avg_7d"]

    def delta_style(delta_pct: float) -> str:
        return "color:red;font-weight:bold" if delta_pct > 0 else "color:green;font-weight:bold"

    account_rows = "".join(
        f"<tr><td>{a['metric']}</td>"
        f"<td>{a['today']}</td>"
        f"<td>{a['avg_7d']}</td>"
        f"<td style='{delta_style(a['delta_pct'])}'>{a['delta_pct']:+.1f}%</td></tr>"
        for a in account["anomalies"]
    )

    campaigns_html = ""
    for camp in result.get("campaigns", []):
        camp_rows = "".join(
            f"<tr><td>{a['metric']}</td>"
            f"<td>{a['today']}</td>"
            f"<td>{a['avg_7d']}</td>"
            f"<td style='{delta_style(a['delta_pct'])}'>{a['delta_pct']:+.1f}%</td></tr>"
            for a in camp["anomalies"]
        )
        campaigns_html += f"""
<h3>Campagna: {camp['campaign']}</h3>
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Metrica</th><th>Oggi</th><th>Media 7gg</th><th>Delta</th></tr>
  {camp_rows}
</table>"""

    return f"""
<h2>&#9888;&#65039; Anomalia campagne — {date_str}</h2>
<h3>Riepilogo Account</h3>
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Metrica</th><th>Oggi</th><th>Media 7gg</th><th>Delta</th></tr>
  {account_rows}
</table>
{campaigns_html}
<p><a href="http://127.0.0.1:5000">&#8594; Apri Dashboard</a></p>
"""


def send_anomaly_alert(result: dict, api_key: str, to_email: str, date_str: str) -> None:
    if not result["account"]["anomalies"] and not result["campaigns"]:
        return
    resend.api_key = api_key
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"⚠️ Anomalia campagne — {date_str}",
        "html": build_anomaly_html(result, date_str),
    })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_anomaly.py -k "build_anomaly_html" -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add notifier/email.py tests/test_anomaly.py
git commit -m "feat: add build_anomaly_html() and send_anomaly_alert() to notifier"
```

---

### Task 5: Add `anomaly:` section to config.yaml

**Files:**
- Modify: `config.yaml`

- [ ] **Step 1: Append the `anomaly:` section to `config.yaml`**

Append after the `schedule:` block:

```yaml

anomaly:
  cost_increase_pct: 50
  cpc_increase_pct: 30
  ctr_decrease_pct: 40
  conversions_decrease_pct: 50
```

- [ ] **Step 2: Verify YAML is valid**

```bash
python -c "import yaml; yaml.safe_load(open('config.yaml'))" && echo "OK"
```
Expected: `OK` (no errors)

- [ ] **Step 3: Commit**

```bash
git add config.yaml
git commit -m "config: add anomaly thresholds section"
```

---

### Task 6: Integrate anomaly check in main.py

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Update imports in `main.py`**

Make two changes:

**Change 1** — extend the collector import (line 10):
```python
# Before:
from collector.google_ads import fetch_keyword_performance
# After:
from collector.google_ads import fetch_keyword_performance, fetch_daily_metrics
```

**Change 2** — extend the notifier import and add analyzer import (lines 13-14):
```python
# Before:
from notifier.email import send_daily_report
# After:
from analyzer.anomaly import detect_anomalies
from notifier.email import send_daily_report, send_anomaly_alert
```

Note: `resend` is already imported inside `notifier/email.py` at line 2 — no change needed there.

- [ ] **Step 2: Add the anomaly block inside `run_daily()` after `save_json(proposals, ...)`**

After line:
```python
    print(f"[{today}] Proposals saved.")
```

Add:
```python
    # Anomaly detection — addizionale, non blocca il report normale
    try:
        daily_data = fetch_daily_metrics(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
        )
        anomaly_thresholds = config.get("anomaly", {})
        anomaly_result = detect_anomalies(daily_data, anomaly_thresholds)
        if anomaly_result["account"]["anomalies"] or anomaly_result["campaigns"]:
            send_anomaly_alert(
                result=anomaly_result,
                api_key=os.environ["RESEND_API_KEY"],
                to_email=os.environ["NOTIFICATION_EMAIL"],
                date_str=today,
            )
            print(f"[{today}] Anomaly alert sent.")
        else:
            print(f"[{today}] No anomalies detected.")
    except Exception as e:
        print(f"[WARN] Anomaly check failed (skipping): {e}")
```

- [ ] **Step 3: Run full test suite to check no regressions**

```bash
pytest -v
```
Expected: all existing tests PASS + new anomaly tests PASS

- [ ] **Step 4: Commit**

```bash
git add main.py
git commit -m "feat: integrate anomaly detection into daily run"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run the complete test suite one final time**

```bash
pytest -v
```
Expected: all tests PASS (no failures, no errors)

- [ ] **Step 2: Dry-run import check (no API calls)**

```bash
python -c "
from collector.google_ads import fetch_daily_metrics
from analyzer.anomaly import compute_account_totals, detect_anomalies
from notifier.email import build_anomaly_html, send_anomaly_alert
import yaml
cfg = yaml.safe_load(open('config.yaml'))
assert 'anomaly' in cfg
print('All imports OK, config OK')
"
```
Expected: `All imports OK, config OK`

- [ ] **Step 3: Commit (if any last changes)**

```bash
git add -p
git commit -m "chore: final anomaly detection cleanup"
```
(Skip if nothing to commit.)
