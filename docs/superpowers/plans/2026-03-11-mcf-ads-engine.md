# MCF Ads Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated Google Ads campaign management system for Mediocredito Facile with keyword analysis, landing page generation, and a local approval dashboard.

**Architecture:** Python monorepo (`mcf-ads-engine/`) with four modules (Collector, Analyzer, Generator, Dashboard) connected via a shared `data/proposals/YYYY-MM-DD.json` file. The dashboard (FastAPI + Alpine.js on localhost:5000) is the human approval gate before any write action reaches Google Ads or Git.

**Tech Stack:** Python 3.12 · google-ads · anthropic · FastAPI · uvicorn · Resend · PyYAML · python-dotenv · pytest · Alpine.js (CDN)

---

## File Map

| File | Responsibility |
|---|---|
| `mcf-ads-engine/pyproject.toml` | deps + scripts |
| `mcf-ads-engine/config.yaml` | scoring thresholds, schedule, non-secret config |
| `mcf-ads-engine/.env.example` | template for secrets |
| `mcf-ads-engine/google-ads.yaml.example` | template for Google Ads credentials |
| `mcf-ads-engine/.gitignore` | excludes .env, google-ads.yaml, data/ |
| `mcf-ads-engine/main.py` | daily run entry point |
| `mcf-ads-engine/setup_auth.py` | one-time OAuth2 interactive token flow |
| `mcf-ads-engine/collector/google_ads.py` | fetch KW performance via GAQL |
| `mcf-ads-engine/analyzer/scorer.py` | classify KWs into to_pause/to_reward/to_review |
| `mcf-ads-engine/analyzer/suggester.py` | Claude API: suggest KW long-tail variants |
| `mcf-ads-engine/generator/landing.py` | Claude API: generate landing JSON |
| `mcf-ads-engine/generator/campaign.py` | build campaign draft with UTM URL |
| `mcf-ads-engine/generator/copy.py` | Claude API: generate RSA headlines/descriptions |
| `mcf-ads-engine/dashboard/server.py` | FastAPI routes for dashboard |
| `mcf-ads-engine/dashboard/templates/index.html` | Alpine.js UI (3 tabs) |
| `mcf-ads-engine/notifier/email.py` | Resend email reports |
| `mcf-ads-engine/scheduler/it.mediocreditofacile.adsengine.plist` | macOS launchd config |
| `mcf-ads-engine/data/exclusions.yaml` | KW exclusion list |
| `mcf-ads-engine/tests/test_scorer.py` | unit tests for scorer |
| `mcf-ads-engine/tests/test_generator_landing.py` | unit tests for landing generator |
| `mcf-ads-engine/tests/test_generator_campaign.py` | unit tests for campaign builder |
| `mcf-ads-engine/tests/test_server.py` | FastAPI route tests |

---

## Chunk 1: Project Setup + Collector

### Task 1: Initialize project structure

**Files:**
- Create: `mcf-ads-engine/pyproject.toml`
- Create: `mcf-ads-engine/config.yaml`
- Create: `mcf-ads-engine/.env.example`
- Create: `mcf-ads-engine/google-ads.yaml.example`
- Create: `mcf-ads-engine/.gitignore`
- Create: `mcf-ads-engine/data/exclusions.yaml`
- Create: `mcf-ads-engine/data/raw/.gitkeep`
- Create: `mcf-ads-engine/data/proposals/.gitkeep`

- [ ] **Step 1: Create directory structure**

```bash
cd /Users/alberto/mediocreditofacile
mkdir -p mcf-ads-engine/{collector,analyzer,generator,dashboard/templates,notifier,scheduler,tests,data/raw,data/proposals}
touch mcf-ads-engine/{collector,analyzer,generator,dashboard,notifier,tests}/__init__.py
touch mcf-ads-engine/data/raw/.gitkeep mcf-ads-engine/data/proposals/.gitkeep
```

- [ ] **Step 2: Create `pyproject.toml`**

```toml
# mcf-ads-engine/pyproject.toml
[project]
name = "mcf-ads-engine"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "google-ads>=24.0.0",
    "google-auth-oauthlib>=1.2",
    "anthropic>=0.30.0",
    "fastapi>=0.111.0",
    "uvicorn>=0.30.0",
    "resend>=2.0.0",
    "pyyaml>=6.0",
    "python-dotenv>=1.0",
    "numpy>=1.26",
    "jinja2>=3.1",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "httpx>=0.27"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Create `config.yaml`**

```yaml
# mcf-ads-engine/config.yaml
google_ads:
  customer_id: "SOSTITUISCI_CON_IL_TUO_CUSTOMER_ID"

scoring:
  pause_threshold_cost: 10.00
  reward_cpc_percentile: 40
  reward_ctr_percentile: 60
  review_min_conversions: 1
  auto_approve_pause: false

exclusions:
  file: data/exclusions.yaml

landing_pages_path: ../mediocreditofacile/src/data/landing-pages.json

schedule:
  daily_run: "08:00"
  weekly_report_day: "monday"
  monthly_report_day: 1
```

- [ ] **Step 4: Create `.env.example`**

```bash
# mcf-ads-engine/.env.example
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
NOTIFICATION_EMAIL=alberto@mediocreditofacile.it
```

- [ ] **Step 5: Create `google-ads.yaml.example`**

```yaml
# mcf-ads-engine/google-ads.yaml.example
developer_token: "SOSTITUISCI"
client_id: "SOSTITUISCI.apps.googleusercontent.com"
client_secret: "SOSTITUISCI"
refresh_token: "GENERATO_DA_setup_auth.py"
login_customer_id: "SOSTITUISCI_ID_MANAGER"
use_proto_plus: true
```

- [ ] **Step 6: Create `.gitignore`**

```gitignore
# mcf-ads-engine/.gitignore
.env
google-ads.yaml
data/raw/
data/proposals/
__pycache__/
*.pyc
.venv/
```

- [ ] **Step 7: Create `data/exclusions.yaml`**

```yaml
# mcf-ads-engine/data/exclusions.yaml
excluded_terms:
  - privati
  - consumatori
  - mutuo prima casa
  - prestito personale
  - cessione del quinto

excluded_sectors:
  - agricoltura
  - startup pre-revenue
```

- [ ] **Step 8: Install dependencies**

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Expected: no errors, `pip list` shows google-ads, anthropic, fastapi.

- [ ] **Step 9: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/
git commit -m "feat: initialize mcf-ads-engine project structure"
```

---

### Task 2: Collector — Google Ads API fetch

**Files:**
- Create: `mcf-ads-engine/collector/google_ads.py`
- Create: `mcf-ads-engine/setup_auth.py`
- Test: `mcf-ads-engine/tests/test_collector.py`

- [ ] **Step 1: Write failing test**

```python
# mcf-ads-engine/tests/test_collector.py
from collector.google_ads import parse_gaql_row

def test_parse_gaql_row_computes_cpc():
    """CPC = cost / clicks. Cost in micros → euros."""
    fake_row = {
        "keyword": "noleggio operativo pmi",
        "match_type": "PHRASE",
        "campaign": "Noleggio Operativo",
        "ad_group": "Generico",
        "impressions": 100,
        "clicks": 10,
        "cost_micros": 5_000_000,   # €5.00
        "conversions": 1,
    }
    result = parse_gaql_row(fake_row)
    assert result["cost"] == 5.0
    assert result["cpc"] == 0.5
    assert result["ctr"] == 0.1

def test_parse_gaql_row_zero_clicks_no_division_error():
    fake_row = {
        "keyword": "test", "match_type": "BROAD",
        "campaign": "X", "ad_group": "Y",
        "impressions": 50, "clicks": 0,
        "cost_micros": 0, "conversions": 0,
    }
    result = parse_gaql_row(fake_row)
    assert result["cpc"] == 0.0
    assert result["ctr"] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
source .venv/bin/activate
pytest tests/test_collector.py -v
```

Expected: `ImportError: cannot import name 'parse_gaql_row'`

- [ ] **Step 3: Implement `collector/google_ads.py`**

```python
# mcf-ads-engine/collector/google_ads.py
from google.ads.googleads.client import GoogleAdsClient

GAQL = """
SELECT
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.resource_name,
  campaign.name,
  ad_group.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM keyword_view
WHERE segments.date DURING LAST_30_DAYS
  AND ad_group_criterion.status = 'ENABLED'
  AND campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
"""
# NOTE: quality_score is NOT compatible with segments.date in keyword_view.
# It requires a separate query without date segmentation. Not implemented in Phase 1.


def parse_gaql_row(row: dict) -> dict:
    """Convert a raw GAQL row dict to a clean keyword dict."""
    clicks = row["clicks"]
    impressions = row["impressions"]
    cost = row["cost_micros"] / 1_000_000
    return {
        "keyword": row["keyword"],
        "match_type": row["match_type"],
        "campaign": row["campaign"],
        "ad_group": row["ad_group"],
        "impressions": impressions,
        "clicks": clicks,
        "cost": round(cost, 4),
        "conversions": row["conversions"],
        "cpc": round(cost / clicks, 4) if clicks > 0 else 0.0,
        "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
        "resource_name": row.get("resource_name", ""),
    }


def fetch_keyword_performance(customer_id: str, yaml_path: str = "google-ads.yaml") -> list[dict]:
    """Fetch last 30 days keyword performance from Google Ads API."""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=GAQL)

    keywords = []
    for api_row in response:
        kw = api_row.ad_group_criterion.keyword
        m = api_row.metrics
        raw = {
            "keyword": kw.text,
            "match_type": kw.match_type.name,  # proto enum → string e.g. "PHRASE"
            "resource_name": api_row.ad_group_criterion.resource_name,
            "campaign": api_row.campaign.name,
            "ad_group": api_row.ad_group.name,
            "impressions": m.impressions,
            "clicks": m.clicks,
            "cost_micros": m.cost_micros,
            "conversions": m.conversions,
        }
        keywords.append(parse_gaql_row(raw))
    return keywords
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_collector.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Create `setup_auth.py`**

```python
# mcf-ads-engine/setup_auth.py
"""
One-time script to obtain Google Ads OAuth2 refresh token.
Run once: python setup_auth.py
Then copy the printed refresh_token into google-ads.yaml.
"""
import json
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/adwords"]

# Load client_id and client_secret from a downloaded OAuth2 JSON file
# Download from: Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs
CLIENT_SECRETS_FILE = "client_secrets.json"

def main():
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
    credentials = flow.run_local_server(port=8080)
    print("\n=== REFRESH TOKEN ===")
    print(credentials.refresh_token)
    print("Copia questo valore in google-ads.yaml come 'refresh_token'")

if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/collector/ mcf-ads-engine/setup_auth.py mcf-ads-engine/tests/test_collector.py
git commit -m "feat: add Google Ads collector with GAQL fetch and parse_gaql_row"
```

---

## Chunk 2: Analyzer — Scorer + Suggester

### Task 3: KW Scorer

**Files:**
- Create: `mcf-ads-engine/analyzer/scorer.py`
- Test: `mcf-ads-engine/tests/test_scorer.py`

- [ ] **Step 1: Write failing tests**

```python
# mcf-ads-engine/tests/test_scorer.py
import pytest
from analyzer.scorer import score_keywords, load_exclusions, is_excluded

# --- Fixtures ---
BASE_CONFIG = {
    "scoring": {
        "pause_threshold_cost": 10.0,
        "reward_cpc_percentile": 40,
        "reward_ctr_percentile": 60,
        "review_min_conversions": 1,
        "auto_approve_pause": False,
    }
}

EXCLUSIONS = {
    "excluded_terms": ["privati", "mutuo prima casa"],
    "excluded_sectors": ["agricoltura"],
}


def make_kw(**kwargs):
    defaults = {
        "keyword": "noleggio operativo pmi",
        "campaign": "Test", "ad_group": "Test",
        "match_type": "PHRASE",
        "cost": 3.0, "cpc": 0.5, "ctr": 0.05,
        "conversions": 0, "impressions": 100, "clicks": 6,
        "resource_name": "customers/123/adGroupCriteria/456~789",
    }
    return {**defaults, **kwargs}


# --- Tests ---

def test_expensive_kw_with_zero_conversions_goes_to_pause():
    kws = [make_kw(cost=15.0, conversions=0)]
    result = score_keywords(kws, BASE_CONFIG, EXCLUSIONS)
    assert len(result["to_pause"]) == 1
    assert result["to_pause"][0]["reason"] == "costo_elevato_zero_conversioni"


def test_excluded_term_goes_to_pause():
    kws = [make_kw(keyword="mutuo prima casa azienda")]
    result = score_keywords(kws, BASE_CONFIG, EXCLUSIONS)
    assert any(p["reason"] == "fuori_target" for p in result["to_pause"])


def test_kw_with_conversions_goes_to_review():
    """Precedence: review wins over reward. A converting KW is never also in to_reward."""
    kws = [make_kw(conversions=2, cost=8.0)]
    result = score_keywords(kws, BASE_CONFIG, EXCLUSIONS)
    assert len(result["to_review"]) == 1
    assert result["to_review"][0]["conversions"] == 2
    assert len(result["to_reward"]) == 0  # converting KW excluded from reward path


def test_low_cpc_high_ctr_goes_to_reward():
    # Need multiple KWs to compute percentiles
    kws = [
        make_kw(keyword="kw-cheap", cpc=0.20, ctr=0.10, cost=2.0),   # low CPC, high CTR
        make_kw(keyword="kw-mid",   cpc=0.80, ctr=0.04, cost=4.0),
        make_kw(keyword="kw-exp",   cpc=1.50, ctr=0.02, cost=5.0),
        make_kw(keyword="kw-exp2",  cpc=1.80, ctr=0.01, cost=6.0),
        make_kw(keyword="kw-exp3",  cpc=2.00, ctr=0.01, cost=7.0),
    ]
    result = score_keywords(kws, BASE_CONFIG, EXCLUSIONS)
    rewarded = [r["keyword"] for r in result["to_reward"]]
    assert "kw-cheap" in rewarded


def test_cost_per_conversion_computed_correctly():
    kws = [make_kw(conversions=4, cost=20.0)]
    result = score_keywords(kws, BASE_CONFIG, EXCLUSIONS)
    assert result["to_review"][0]["cost_per_conversion"] == 5.0


def test_kw_above_cpc_threshold_not_rewarded():
    """KW with CPC above the 40th percentile must NOT go to to_reward."""
    kws = [
        make_kw(keyword="kw-cheap", cpc=0.20, ctr=0.10, cost=2.0),
        make_kw(keyword="kw-mid",   cpc=0.80, ctr=0.04, cost=4.0),
        make_kw(keyword="kw-exp",   cpc=1.50, ctr=0.02, cost=5.0),
        make_kw(keyword="kw-exp2",  cpc=1.80, ctr=0.01, cost=6.0),
        make_kw(keyword="kw-exp3",  cpc=2.00, ctr=0.01, cost=7.0),
    ]
    result = score_keywords(kws, BASE_CONFIG, EXCLUSIONS)
    rewarded = [r["keyword"] for r in result["to_reward"]]
    assert "kw-exp3" not in rewarded   # high CPC should NOT be rewarded
    assert "kw-exp2" not in rewarded


def test_is_excluded_case_insensitive():
    assert is_excluded("Prestito Privati", {"excluded_terms": ["privati"], "excluded_sectors": []})
    assert not is_excluded("noleggio pmi", {"excluded_terms": ["privati"], "excluded_sectors": []})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
source .venv/bin/activate
pytest tests/test_scorer.py -v
```

Expected: `ImportError: cannot import name 'score_keywords'`

- [ ] **Step 3: Implement `analyzer/scorer.py`**

```python
# mcf-ads-engine/analyzer/scorer.py
import yaml
import numpy as np
from pathlib import Path


def load_exclusions(exclusions_file: str) -> dict:
    with open(exclusions_file) as f:
        return yaml.safe_load(f)


def is_excluded(keyword: str, exclusions: dict) -> bool:
    kw_lower = keyword.lower()
    for term in exclusions.get("excluded_terms", []):
        if term.lower() in kw_lower:
            return True
    for sector in exclusions.get("excluded_sectors", []):
        if sector.lower() in kw_lower:
            return True
    return False


def score_keywords(keywords: list[dict], config: dict, exclusions: dict) -> dict:
    """
    Classify keywords into three lists.

    Precedence (mutually exclusive per KW):
      1. Fuori target → to_pause (excluded terms/sectors)
      2. Costo elevato, zero conversioni → to_pause
      3. Ha conversioni → to_review (takes priority over reward;
         a converting KW is not also rewarded — quality review comes first)
      4. CPC basso + CTR alto + zero conversioni → to_reward
      5. All others: ignored (not in any list)
    """
    scoring = config["scoring"]
    to_pause, to_reward, to_review = [], [], []

    cpcs = [kw["cpc"] for kw in keywords if kw["cpc"] > 0]
    ctrs = [kw["ctr"] for kw in keywords if kw["ctr"] > 0]
    cpc_threshold = float(np.percentile(cpcs, scoring["reward_cpc_percentile"])) if cpcs else float("inf")
    ctr_threshold = float(np.percentile(ctrs, scoring["reward_ctr_percentile"])) if ctrs else 0.0

    for kw in keywords:
        if is_excluded(kw["keyword"], exclusions):
            to_pause.append(_pause_entry(kw, "fuori_target"))
            continue

        if kw["cost"] > scoring["pause_threshold_cost"] and kw["conversions"] == 0:
            to_pause.append(_pause_entry(kw, "costo_elevato_zero_conversioni"))
            continue

        if kw["conversions"] >= scoring["review_min_conversions"]:
            # Precedence: review > reward for converting KWs
            cost_per_conv = round(kw["cost"] / kw["conversions"], 2)
            to_review.append({
                "keyword": kw["keyword"],
                "conversions": kw["conversions"],
                "cost_per_conversion": cost_per_conv,
                "quality_note": f"CPC: €{kw['cpc']:.2f}, CTR: {kw['ctr']:.1%}",
                "alberto_feedback": None,
                "status": "pending",
            })
            continue

        if kw["cpc"] <= cpc_threshold and kw["ctr"] >= ctr_threshold:
            to_reward.append({
                "keyword": kw["keyword"],
                "campaign": kw["campaign"],
                "ad_group": kw["ad_group"],
                "match_type": kw["match_type"],
                "cpc": kw["cpc"],
                "ctr": kw["ctr"],
                "suggested_landing_slug": None,
                "suggested_kw_variants": [],
                "status": "pending",
            })

    return {"to_pause": to_pause, "to_reward": to_reward, "to_review": to_review}


def _pause_entry(kw: dict, reason: str) -> dict:
    return {
        "keyword": kw["keyword"],
        "campaign": kw["campaign"],
        "ad_group": kw["ad_group"],
        "cost": kw["cost"],
        "conversions": kw["conversions"],
        "match_type": kw["match_type"],
        "reason": reason,
        "status": "pending",
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_scorer.py -v
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/analyzer/scorer.py mcf-ads-engine/tests/test_scorer.py
git commit -m "feat: add KW scorer with pause/reward/review classification"
```

---

### Task 4: KW Suggester (Claude API)

**Files:**
- Create: `mcf-ads-engine/analyzer/suggester.py`
- Test: `mcf-ads-engine/tests/test_suggester.py`

- [ ] **Step 1: Write failing test**

```python
# mcf-ads-engine/tests/test_suggester.py
from unittest.mock import patch, MagicMock
from analyzer.suggester import suggest_kw_variants, parse_variants_response


def test_parse_variants_response_valid_json():
    raw = '{"variants": ["noleggio operativo impianti pmi", "fotovoltaico aziendale zero anticipo"]}'
    result = parse_variants_response(raw)
    assert len(result) == 2
    assert "noleggio operativo impianti pmi" in result


def test_parse_variants_response_strips_markdown():
    raw = '```json\n{"variants": ["test kw"]}\n```'
    result = parse_variants_response(raw)
    assert result == ["test kw"]


def test_suggest_kw_variants_calls_claude(monkeypatch):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text='{"variants": ["kw a", "kw b", "kw c"]}')]
    )
    monkeypatch.setattr("analyzer.suggester.anthropic.Anthropic", lambda api_key: mock_client)

    result = suggest_kw_variants("noleggio operativo", "Campagna Test", "fake-key")
    assert len(result) == 3
    mock_client.messages.create.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_suggester.py -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement `analyzer/suggester.py`**

```python
# mcf-ads-engine/analyzer/suggester.py
import re
import json
import anthropic

SUGGEST_PROMPT = """\
Sei un esperto SEO/SEM per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).

Keyword attiva con buone performance: "{keyword}"
Campagna: {campaign}

Genera 5 varianti long-tail specifiche per questo business.
Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{"variants": ["stringa", "stringa", "stringa", "stringa", "stringa"]}}

Regole:
- Mantieni l'intento commerciale (non informazionale)
- Target PMI, aziende, imprese (non privati/consumatori)
- Varianti realisticamente cercate su Google Italia
"""


def parse_variants_response(raw: str) -> list[str]:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)["variants"]


def suggest_kw_variants(keyword: str, campaign: str, api_key: str) -> list[str]:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": SUGGEST_PROMPT.format(keyword=keyword, campaign=campaign),
        }],
    )
    return parse_variants_response(message.content[0].text)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_suggester.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/analyzer/suggester.py mcf-ads-engine/tests/test_suggester.py
git commit -m "feat: add KW variant suggester via Claude API"
```

---

## Chunk 3: Notifier + main.py (Phase 1 complete)

### Task 5: Email Notifier

**Files:**
- Create: `mcf-ads-engine/notifier/email.py`
- Test: `mcf-ads-engine/tests/test_notifier.py`

- [ ] **Step 1: Write failing test**

```python
# mcf-ads-engine/tests/test_notifier.py
from notifier.email import build_daily_html, build_weekly_html


def test_build_daily_html_shows_action_counts():
    proposals = {
        "to_pause": [{"status": "pending"}, {"status": "pending"}],
        "landing_proposals": [{"status": "pending"}],
        "campaign_drafts": [],
    }
    html = build_daily_html(proposals, "2026-03-11")
    assert "2026-03-11" in html
    assert "2" in html   # 2 pause
    assert "1" in html   # 1 landing


def test_build_daily_html_counts_only_pending():
    proposals = {
        "to_pause": [{"status": "approved"}, {"status": "pending"}],
        "landing_proposals": [],
        "campaign_drafts": [],
    }
    html = build_daily_html(proposals, "2026-03-11")
    # Only 1 pending pause
    assert "1 KW" in html


def test_build_weekly_html_includes_ctr_and_cpc():
    data = {"ctr_avg": "4.2%", "cpc_avg": "1.80", "conversions": 7,
            "improving_kws": ["kw A"], "grey_zone_kws": ["kw B"]}
    html = build_weekly_html(data, "2026-03-11")
    assert "4.2%" in html
    assert "kw A" in html
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_notifier.py -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement `notifier/email.py`**

```python
# mcf-ads-engine/notifier/email.py
import resend


def build_daily_html(proposals: dict, date_str: str) -> str:
    n_pause = sum(1 for x in proposals.get("to_pause", []) if x["status"] == "pending")
    n_landing = sum(1 for x in proposals.get("landing_proposals", []) if x["status"] == "pending")
    n_campaigns = sum(1 for x in proposals.get("campaign_drafts", []) if x["status"] == "pending")
    total = n_pause + n_landing + n_campaigns
    return f"""
<h2>MCF Ads Engine — Report {date_str}</h2>
<p><strong>{total} azioni da approvare</strong></p>
<ul>
  <li>⏸️ {n_pause} KW da mettere in pausa</li>
  <li>🚀 {n_landing} landing page proposte</li>
  <li>📢 {n_campaigns} bozze campagna</li>
</ul>
<p><a href="http://localhost:5000">→ Apri Dashboard</a></p>
"""


def build_weekly_html(data: dict, date_str: str) -> str:
    improving = "".join(f"<li>{kw}</li>" for kw in data.get("improving_kws", []))
    grey = "".join(f"<li>{kw}</li>" for kw in data.get("grey_zone_kws", []))
    return f"""
<h2>MCF Ads Engine — Report Settimanale {date_str}</h2>
<h3>Performance</h3>
<ul>
  <li>CTR medio: {data.get('ctr_avg', 'N/A')}</li>
  <li>CPC medio: €{data.get('cpc_avg', 'N/A')}</li>
  <li>Conversioni: {data.get('conversions', 'N/A')}</li>
</ul>
<h3>KW in miglioramento</h3><ul>{improving}</ul>
<h3>KW da monitorare</h3><ul>{grey}</ul>
<p><a href="http://localhost:5000">→ Apri Dashboard</a></p>
"""


def send_daily_report(proposals: dict, api_key: str, to_email: str, date_str: str) -> None:
    resend.api_key = api_key
    n_total = (
        sum(1 for x in proposals.get("to_pause", []) if x["status"] == "pending")
        + sum(1 for x in proposals.get("landing_proposals", []) if x["status"] == "pending")
        + sum(1 for x in proposals.get("campaign_drafts", []) if x["status"] == "pending")
    )
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — Report {date_str} | {n_total} azioni da approvare",
        "html": build_daily_html(proposals, date_str),
    })


def send_weekly_report(data: dict, api_key: str, to_email: str, date_str: str) -> None:
    resend.api_key = api_key
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — Report Settimanale {date_str}",
        "html": build_weekly_html(data, date_str),
    })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_notifier.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/notifier/email.py mcf-ads-engine/tests/test_notifier.py
git commit -m "feat: add email notifier with daily and weekly HTML reports"
```

---

### Task 6: main.py — Daily run orchestrator

**Files:**
- Create: `mcf-ads-engine/main.py`
- Test: `mcf-ads-engine/tests/test_main.py`

- [ ] **Step 1: Write failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_main.py -v
```

- [ ] **Step 3: Implement `main.py`**

```python
# mcf-ads-engine/main.py
import json
import os
import sys
import yaml
from datetime import date
from pathlib import Path
from dotenv import load_dotenv

from collector.google_ads import fetch_keyword_performance
from analyzer.scorer import score_keywords, load_exclusions
from analyzer.suggester import suggest_kw_variants
from notifier.email import send_daily_report

load_dotenv()


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def build_proposals(scores: dict, date_str: str) -> dict:
    return {
        "date": date_str,
        "to_pause": scores["to_pause"],
        "to_reward": scores["to_reward"],
        "to_review": scores["to_review"],
        "landing_proposals": [],
        "campaign_drafts": [],
    }


def save_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def run_daily():
    config = load_config()
    today = date.today().isoformat()
    api_key = os.environ["ANTHROPIC_API_KEY"]

    print(f"[{today}] Fetching keyword data from Google Ads...")
    try:
        keywords = fetch_keyword_performance(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
        )
    except Exception as e:
        print(f"[ERROR] Google Ads API failed: {e}")
        sys.exit(1)

    save_json(keywords, Path(f"data/raw/{today}.json"))
    print(f"[{today}] {len(keywords)} keywords fetched.")

    exclusions = load_exclusions(config["exclusions"]["file"])
    scores = score_keywords(keywords, config, exclusions)

    print(f"[{today}] Suggesting KW variants for {len(scores['to_reward'])} rewarded KWs...")
    for kw in scores["to_reward"]:
        try:
            kw["suggested_kw_variants"] = suggest_kw_variants(
                kw["keyword"], kw["campaign"], api_key
            )
        except Exception as e:
            print(f"[WARN] Variant suggestion failed for '{kw['keyword']}': {e}")
            kw["suggested_kw_variants"] = []

    proposals = build_proposals(scores, today)
    save_json(proposals, Path(f"data/proposals/{today}.json"))
    print(f"[{today}] Proposals saved.")

    send_daily_report(
        proposals=proposals,
        api_key=os.environ["RESEND_API_KEY"],
        to_email=os.environ["NOTIFICATION_EMAIL"],
        date_str=today,
    )
    print(f"[{today}] Daily report sent. Done.")


if __name__ == "__main__":
    run_daily()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_main.py -v
```

Expected: 1 test PASS.

- [ ] **Step 5: Smoke test Phase 1 (requires real credentials)**

> Salta se non hai ancora le credenziali Google Ads API configurate. Torna qui dopo il setup_auth.py.

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
source .venv/bin/activate
cp .env.example .env   # fill in real values
cp google-ads.yaml.example google-ads.yaml  # fill in real values
python main.py
```

Expected: no errors, file `data/raw/YYYY-MM-DD.json` and `data/proposals/YYYY-MM-DD.json` created, email received.

- [ ] **Step 6: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/main.py mcf-ads-engine/tests/test_main.py
git commit -m "feat: add main.py daily orchestrator — Phase 1 complete"
```

---

## Chunk 4: Generator — Landing + Campaign + Copy

### Task 7: Landing Generator

**Files:**
- Create: `mcf-ads-engine/generator/landing.py`
- Test: `mcf-ads-engine/tests/test_generator_landing.py`

- [ ] **Step 1: Write failing tests**

```python
# mcf-ads-engine/tests/test_generator_landing.py
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock
from generator.landing import (
    parse_landing_response,
    validate_landing,
    load_existing_slugs,
    append_landing_to_file,
)


VALID_LANDING = {
    "slug": "fotovoltaico-capannone-affitto",
    "metaTitle": "Fotovoltaico per Capannoni in Affitto | Mediocredito Facile",
    "metaDescription": "Impianto fotovoltaico anche se il capannone è in affitto. Noleggio operativo senza anticipo.",
    "heroTitle": "Fotovoltaico Anche con Capannone in Affitto",
    "heroSubtitle": "Il tetto non è tuo? Con il noleggio operativo l'impianto resta della società di noleggio.",
    "ctaText": "Verifica la Fattibilità",
    "benefits": [
        {"icon": "home_work", "title": "Impianto non tuo", "description": "L'impianto è di proprietà della società."},
        {"icon": "folder", "title": "Doc gestita", "description": "Ti aiutiamo con l'accordo col proprietario."},
        {"icon": "swap_horiz", "title": "Trasferibile", "description": "Se cambi sede, il contratto si gestisce."},
    ],
}


def test_parse_landing_response_valid():
    raw = json.dumps(VALID_LANDING)
    result = parse_landing_response(raw)
    assert result["slug"] == "fotovoltaico-capannone-affitto"


def test_parse_landing_response_strips_markdown():
    raw = f"```json\n{json.dumps(VALID_LANDING)}\n```"
    result = parse_landing_response(raw)
    assert result["slug"] == "fotovoltaico-capannone-affitto"


def test_validate_landing_passes_valid():
    validate_landing(VALID_LANDING)  # should not raise


def test_validate_landing_fails_missing_slug():
    bad = {**VALID_LANDING}
    del bad["slug"]
    try:
        validate_landing(bad)
        assert False, "Should have raised"
    except ValueError:
        pass


def test_validate_landing_fails_too_long_meta_title():
    bad = {**VALID_LANDING, "metaTitle": "A" * 61}
    try:
        validate_landing(bad)
        assert False, "Should have raised"
    except ValueError:
        pass


def test_load_existing_slugs(tmp_path):
    lp = tmp_path / "landing-pages.json"
    lp.write_text(json.dumps([{"slug": "existing-slug"}]))
    slugs = load_existing_slugs(str(lp))
    assert slugs == ["existing-slug"]


def test_append_landing_to_file(tmp_path):
    lp = tmp_path / "landing-pages.json"
    lp.write_text(json.dumps([{"slug": "existing"}]))
    append_landing_to_file(VALID_LANDING, str(lp))
    pages = json.loads(lp.read_text())
    assert len(pages) == 2
    assert pages[-1]["slug"] == "fotovoltaico-capannone-affitto"


def test_append_landing_fails_duplicate_slug(tmp_path):
    lp = tmp_path / "landing-pages.json"
    lp.write_text(json.dumps([{"slug": "fotovoltaico-capannone-affitto"}]))
    try:
        append_landing_to_file(VALID_LANDING, str(lp))
        assert False, "Should have raised"
    except ValueError:
        pass
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_generator_landing.py -v
```

- [ ] **Step 3: Implement `generator/landing.py`**

```python
# mcf-ads-engine/generator/landing.py
import re
import json
import anthropic
from pathlib import Path

LANDING_PROMPT = """\
Sei un esperto di marketing per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).

Slug già esistenti (NON riutilizzare): {existing_slugs}

Genera una landing page per questa keyword o angolo:
"{input}"

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{
  "slug": "stringa-con-trattini-max-50-char",
  "metaTitle": "max 60 caratteri",
  "metaDescription": "max 155 caratteri",
  "heroTitle": "titolo principale H1",
  "heroSubtitle": "sottotitolo che sviluppa il pain point",
  "ctaText": "testo CTA",
  "benefits": [
    {{"icon": "nome_material_symbol", "title": "max 40 char", "description": "max 120 char"}},
    {{"icon": "nome_material_symbol", "title": "max 40 char", "description": "max 120 char"}},
    {{"icon": "nome_material_symbol", "title": "max 40 char", "description": "max 120 char"}}
  ]
}}

Icone Material Symbols valide: savings, receipt, speed, shield, schedule, eco, verified,
account_balance, home_work, folder, swap_horiz, build, event, update, checklist, hub,
compare_arrows, person, lock, visibility, all_inclusive, date_range.
"""

REQUIRED_KEYS = ["slug", "metaTitle", "metaDescription", "heroTitle", "heroSubtitle", "benefits"]
CHAR_LIMITS = {"metaTitle": 60, "metaDescription": 155}
BENEFIT_LIMITS = {"title": 40, "description": 120}


def parse_landing_response(raw: str) -> dict:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)


def validate_landing(landing: dict) -> None:
    for key in REQUIRED_KEYS:
        if key not in landing:
            raise ValueError(f"Landing manca campo obbligatorio: {key}")
    for field, limit in CHAR_LIMITS.items():
        if len(landing.get(field, "")) > limit:
            raise ValueError(f"{field} supera {limit} caratteri: {len(landing[field])}")
    for benefit in landing.get("benefits", []):
        for field, limit in BENEFIT_LIMITS.items():
            if len(benefit.get(field, "")) > limit:
                raise ValueError(f"Benefit {field} supera {limit} caratteri")


def generate_landing(input_text: str, existing_slugs: list[str], api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": LANDING_PROMPT.format(
                input=input_text,
                existing_slugs=", ".join(existing_slugs) or "nessuno",
            ),
        }],
    )
    landing = parse_landing_response(message.content[0].text)
    validate_landing(landing)
    return landing


def load_existing_slugs(landing_pages_path: str) -> list[str]:
    path = Path(landing_pages_path)
    if not path.exists():
        return []
    with open(path) as f:
        return [p["slug"] for p in json.load(f)]


def append_landing_to_file(landing: dict, landing_pages_path: str) -> None:
    path = Path(landing_pages_path)
    with open(path) as f:
        pages = json.load(f)
    if any(p["slug"] == landing["slug"] for p in pages):
        raise ValueError(f"Slug già esistente: {landing['slug']}")
    pages.append(landing)
    with open(path, "w") as f:
        json.dump(pages, f, ensure_ascii=False, indent=2)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_generator_landing.py -v
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/generator/landing.py mcf-ads-engine/tests/test_generator_landing.py
git commit -m "feat: add landing generator with Claude API and validation"
```

---

### Task 8: RSA Copy Generator + Campaign Builder

**Files:**
- Create: `mcf-ads-engine/generator/copy.py`
- Create: `mcf-ads-engine/generator/campaign.py`
- Test: `mcf-ads-engine/tests/test_generator_campaign.py`

- [ ] **Step 1: Write failing tests**

```python
# mcf-ads-engine/tests/test_generator_campaign.py
from generator.campaign import build_utm_url, build_campaign_draft
from generator.copy import validate_rsa_copy, parse_copy_response
import json


def test_build_utm_url_format():
    url = build_utm_url("fotovoltaico-pmi", "Fotovoltaico Aziendale")
    assert url.startswith("https://mediocreditofacile.it/fotovoltaico-pmi")
    assert "utm_source=google" in url
    assert "utm_medium=cpc" in url
    assert "utm_content=fotovoltaico-pmi" in url
    assert "{keyword}" in url


def test_build_utm_url_spaces_in_campaign_name():
    url = build_utm_url("test-slug", "Noleggio Operativo Angoli")
    assert " " not in url


def test_validate_rsa_copy_passes_valid():
    copy = {
        "headlines": ["H" * 10] * 12,       # 12 headlines, each 10 chars
        "descriptions": ["D" * 80] * 4,     # 4 descriptions, each 80 chars
    }
    validate_rsa_copy(copy)  # should not raise


def test_validate_rsa_copy_fails_too_few_headlines():
    copy = {"headlines": ["H"] * 9, "descriptions": ["D"] * 4}
    try:
        validate_rsa_copy(copy)
        assert False
    except ValueError:
        pass


def test_validate_rsa_copy_fails_headline_too_long():
    copy = {"headlines": ["H" * 31] + ["H"] * 11, "descriptions": ["D"] * 4}
    try:
        validate_rsa_copy(copy)
        assert False
    except ValueError:
        pass


def test_parse_copy_response_strips_markdown():
    data = {"headlines": ["H"] * 12, "descriptions": ["D"] * 4}
    raw = f"```json\n{json.dumps(data)}\n```"
    result = parse_copy_response(raw)
    assert len(result["headlines"]) == 12


def test_build_campaign_draft_structure():
    landing = {"slug": "test-slug", "heroTitle": "Test Title"}
    copy = {"headlines": ["H"] * 12, "descriptions": ["D"] * 4}
    draft = build_campaign_draft(landing, ["kw1", "kw2"], "Test Campaign", copy)
    assert draft["landing_slug"] == "test-slug"
    assert draft["ad_group_name"] == "Test Title"
    assert draft["status"] == "pending"
    assert "utm_source=google" in draft["final_url"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_generator_campaign.py -v
```

- [ ] **Step 3: Implement `generator/copy.py`**

```python
# mcf-ads-engine/generator/copy.py
import re
import json
import anthropic

COPY_PROMPT = """\
Sei un esperto di Google Ads per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).

Genera copy RSA per il gruppo annunci:
Landing slug: {landing_slug}
HeroTitle: {hero_title}
Keywords principali: {keywords}

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{
  "headlines": ["max 30 char", ...],
  "descriptions": ["max 90 char", ...]
}}

Regole headline (ESATTAMENTE 12, max 30 caratteri ciascuna):
- Varietà semantica (evita parole ripetute)
- Includi keyword in 2-3 headline
- Mix benefici, urgency, domande, CTA breve

Regole description (ESATTAMENTE 4, max 90 caratteri ciascuna):
- Ogni description autonoma come messaggio
- CTA esplicita in 2 description
"""


def parse_copy_response(raw: str) -> dict:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)


def validate_rsa_copy(copy: dict) -> None:
    headlines = copy.get("headlines", [])
    descriptions = copy.get("descriptions", [])
    if len(headlines) < 10:
        raise ValueError(f"Servono almeno 10 headline, trovate: {len(headlines)}")
    if len(headlines) > 15:
        raise ValueError(f"Max 15 headline, trovate: {len(headlines)}")
    if len(descriptions) != 4:
        raise ValueError(f"Servono esattamente 4 description, trovate: {len(descriptions)}")
    for h in headlines:
        if len(h) > 30:
            raise ValueError(f"Headline troppo lunga ({len(h)} char): '{h}'")
    for d in descriptions:
        if len(d) > 90:
            raise ValueError(f"Description troppo lunga ({len(d)} char): '{d}'")


def generate_rsa_copy(landing_slug: str, hero_title: str, keywords: list[str], api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": COPY_PROMPT.format(
                landing_slug=landing_slug,
                hero_title=hero_title,
                keywords=", ".join(keywords[:5]),
            ),
        }],
    )
    copy = parse_copy_response(message.content[0].text)
    validate_rsa_copy(copy)
    return copy
```

- [ ] **Step 4: Implement `generator/campaign.py`**

```python
# mcf-ads-engine/generator/campaign.py
from generator.copy import generate_rsa_copy


def build_utm_url(slug: str, campaign_name: str) -> str:
    campaign_param = campaign_name.replace(" ", "_")
    return (
        f"https://mediocreditofacile.it/{slug}"
        f"?utm_source=google"
        f"&utm_medium=cpc"
        f"&utm_campaign={campaign_param}"
        f"&utm_content={slug}"
        f"&utm_term={{keyword}}"
    )


def build_campaign_draft(landing: dict, keywords: list[str], campaign_name: str, copy: dict) -> dict:
    return {
        "campaign_name": campaign_name,
        "ad_group_name": landing["heroTitle"][:50],
        "keywords": keywords,
        "landing_slug": landing["slug"],
        "final_url": build_utm_url(landing["slug"], campaign_name),
        "headlines": copy["headlines"],
        "descriptions": copy["descriptions"],
        "status": "pending",
    }


def generate_campaign_draft(landing: dict, keywords: list[str], campaign_name: str, api_key: str) -> dict:
    copy = generate_rsa_copy(
        landing_slug=landing["slug"],
        hero_title=landing["heroTitle"],
        keywords=keywords,
        api_key=api_key,
    )
    return build_campaign_draft(landing, keywords, campaign_name, copy)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_generator_campaign.py -v
```

Expected: 7 tests PASS.

- [ ] **Step 6: Run all tests**

```bash
pytest -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/generator/ mcf-ads-engine/tests/test_generator_campaign.py
git commit -m "feat: add RSA copy generator and campaign draft builder"
```

---

## Chunk 5: Dashboard — FastAPI + Alpine.js UI

### Task 9: Dashboard server routes

**Files:**
- Create: `mcf-ads-engine/dashboard/server.py`
- Test: `mcf-ads-engine/tests/test_server.py`

- [ ] **Step 1: Write failing tests**

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_server.py -v
```

- [ ] **Step 3: Implement `dashboard/server.py`**

```python
# mcf-ads-engine/dashboard/server.py
import json
import os
import subprocess
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel

from generator.landing import generate_landing, load_existing_slugs, append_landing_to_file, validate_landing
from generator.campaign import generate_campaign_draft

app = FastAPI(title="MCF Ads Engine Dashboard")
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def get_proposals_dir() -> Path:
    return Path(os.environ.get("PROPOSALS_DIR", "data/proposals"))


def get_landing_pages_path() -> str:
    return os.environ.get("LANDING_PAGES_PATH", "../mediocreditofacile/src/data/landing-pages.json")


def load_proposals(date_str: str) -> dict:
    path = get_proposals_dir() / f"{date_str}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No proposals for {date_str}")
    with open(path) as f:
        return json.load(f)


def save_proposals(proposals: dict, date_str: str) -> None:
    path = get_proposals_dir() / f"{date_str}.json"
    with open(path, "w") as f:
        json.dump(proposals, f, ensure_ascii=False, indent=2)


def latest_date() -> str:
    proposals_dir = get_proposals_dir()
    files = sorted(proposals_dir.glob("*.json"), reverse=True)
    if not files:
        raise HTTPException(status_code=404, detail="No proposals found")
    return files[0].stem


# --- Routes ---

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/proposals/latest")
async def get_latest_proposals():
    date_str = latest_date()
    return load_proposals(date_str)


class ApproveAction(BaseModel):
    date: str
    list: Literal["to_pause", "to_reward", "to_review", "landing_proposals", "campaign_drafts"]
    index: int
    action: Literal["approved", "rejected"]


@app.post("/api/actions/approve")
async def approve_action(body: ApproveAction):
    proposals = load_proposals(body.date)
    lst = proposals.get(body.list, [])
    if body.index >= len(lst):
        raise HTTPException(status_code=400, detail="Invalid index")
    lst[body.index]["status"] = body.action
    save_proposals(proposals, body.date)
    return {"ok": True, "status": body.action}


class GenerateLandingBody(BaseModel):
    angle: str
    date: str


@app.post("/api/landings/generate")
async def generate_landing_endpoint(body: GenerateLandingBody):
    api_key = os.environ["ANTHROPIC_API_KEY"]
    existing_slugs = load_existing_slugs(get_landing_pages_path())
    landing = generate_landing(body.angle, existing_slugs, api_key)
    proposals = load_proposals(body.date)
    proposals["landing_proposals"].append({
        "source": "manual",
        "trigger_keyword": None,
        "angle_input": body.angle,
        "landing_json": landing,
        "status": "pending",
    })
    save_proposals(proposals, body.date)
    return landing


class ApproveLandingBody(BaseModel):
    date: str
    index: int


@app.post("/api/landings/approve")
async def approve_landing(body: ApproveLandingBody):
    proposals = load_proposals(body.date)
    proposal = proposals["landing_proposals"][body.index]
    landing = proposal["landing_json"]

    # Append to landing-pages.json
    append_landing_to_file(landing, get_landing_pages_path())

    # Git commit
    landing_path = get_landing_pages_path()
    subprocess.run(["git", "add", landing_path], check=True,
                   cwd=str(Path(landing_path).parent.parent.parent))
    subprocess.run(
        ["git", "commit", "-m", f"feat: add landing page {landing['slug']}"],
        check=True, cwd=str(Path(landing_path).parent.parent.parent)
    )

    # Generate campaign draft
    api_key = os.environ["ANTHROPIC_API_KEY"]
    campaign_draft = generate_campaign_draft(
        landing=landing,
        keywords=[],
        campaign_name=f"{landing['heroTitle'][:30]} — Angoli",
        api_key=api_key,
    )
    proposals["campaign_drafts"].append(campaign_draft)
    proposal["status"] = "approved"
    save_proposals(proposals, body.date)

    return {"ok": True, "slug": landing["slug"], "campaign_draft_added": True}


class FeedbackBody(BaseModel):
    date: str
    index: int
    feedback: str


@app.post("/api/review/feedback")
async def save_review_feedback(body: FeedbackBody):
    proposals = load_proposals(body.date)
    proposals["to_review"][body.index]["alberto_feedback"] = body.feedback
    proposals["to_review"][body.index]["status"] = "reviewed"
    save_proposals(proposals, body.date)
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_server.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/dashboard/server.py mcf-ads-engine/tests/test_server.py
git commit -m "feat: add FastAPI dashboard server with approval routes"
```

---

### Task 10: Dashboard UI (Alpine.js)

**Files:**
- Create: `mcf-ads-engine/dashboard/templates/index.html`

> Questa task non ha test automatici — la verifica è visiva.

- [ ] **Step 1: Create `dashboard/templates/index.html`**

```html
<!-- mcf-ads-engine/dashboard/templates/index.html -->
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>MCF Ads Engine</title>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #222; }
    header { background: #1a73e8; color: white; padding: 16px 24px; }
    header h1 { font-size: 1.2rem; }
    .tabs { display: flex; gap: 0; background: white; border-bottom: 2px solid #e0e0e0; }
    .tab { padding: 12px 24px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
    .tab.active { border-color: #1a73e8; color: #1a73e8; font-weight: 600; }
    .content { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #e0e0e0; font-size: .85rem; color: #555; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: .9rem; }
    .btn { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: .85rem; }
    .btn-pause { background: #fce8e6; color: #c5221f; }
    .btn-reward { background: #e6f4ea; color: #137333; }
    .btn-approve { background: #1a73e8; color: white; }
    .btn-reject { background: #f1f3f4; color: #444; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: .75rem; }
    .badge-pending { background: #fef7e0; color: #b06000; }
    .badge-approved { background: #e6f4ea; color: #137333; }
    .badge-rejected { background: #fce8e6; color: #c5221f; }
    textarea { width: 100%; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-size: .9rem; resize: vertical; }
    input[type=text] { width: 100%; border: 1px solid #ddd; border-radius: 4px; padding: 10px; font-size: .95rem; }
    .empty { color: #999; font-style: italic; padding: 16px 0; }
    .loading { color: #1a73e8; }
  </style>
</head>
<body x-data="dashboard()" x-init="loadProposals()">

<header>
  <h1>MCF Ads Engine Dashboard</h1>
</header>

<div class="tabs">
  <div class="tab" :class="{ active: tab === 'kw' }" @click="tab = 'kw'">
    KW Review <span x-text="countPending('to_pause')"></span>
  </div>
  <div class="tab" :class="{ active: tab === 'landing' }" @click="tab = 'landing'">
    Landing <span x-text="countPending('landing_proposals')"></span>
  </div>
  <div class="tab" :class="{ active: tab === 'campaign' }" @click="tab = 'campaign'">
    Campagne <span x-text="countPending('campaign_drafts')"></span>
  </div>
</div>

<div class="content">
  <div x-show="loading" class="loading">Caricamento...</div>
  <div x-show="error" style="color:red" x-text="error"></div>

  <!-- TAB 1: KW Review -->
  <div x-show="tab === 'kw' && !loading">

    <!-- to_pause -->
    <div class="card">
      <h3 style="margin-bottom:12px">KW da gestire</h3>
      <div x-show="proposals.to_pause?.length === 0" class="empty">Nessuna KW da gestire</div>
      <table x-show="proposals.to_pause?.length > 0">
        <tr><th>Keyword</th><th>Campagna</th><th>Costo</th><th>Conv.</th><th>Motivo</th><th>Stato</th><th>Azioni</th></tr>
        <template x-for="(kw, i) in proposals.to_pause" :key="i">
          <tr>
            <td x-text="kw.keyword"></td>
            <td x-text="kw.campaign" style="color:#666;font-size:.85rem"></td>
            <td x-text="'€' + kw.cost.toFixed(2)"></td>
            <td x-text="kw.conversions"></td>
            <td x-text="kw.reason"></td>
            <td><span class="badge" :class="'badge-' + kw.status" x-text="kw.status"></span></td>
            <td>
              <button class="btn btn-pause" x-show="kw.status === 'pending'"
                @click="approve('to_pause', i, 'approved')">Pausa</button>
              <button class="btn btn-reject" x-show="kw.status === 'pending'"
                @click="approve('to_pause', i, 'rejected')">Salta</button>
            </td>
          </tr>
        </template>
      </table>
    </div>

    <!-- to_review -->
    <div class="card">
      <h3 style="margin-bottom:12px">KW con conversioni — Feedback qualità</h3>
      <div x-show="proposals.to_review?.length === 0" class="empty">Nessuna KW con conversioni</div>
      <template x-for="(kw, i) in proposals.to_review" :key="i">
        <div style="border-bottom:1px solid #f0f0f0; padding: 12px 0">
          <strong x-text="kw.keyword"></strong>
          <span style="color:#666;margin-left:12px" x-text="kw.conversions + ' conv. · €' + kw.cost_per_conversion + '/conv.'"></span>
          <div style="margin-top:8px">
            <textarea rows="2" :placeholder="'Note su questa KW... (es. qualità lead, settore cliente)'"
              x-model="kw.alberto_feedback"></textarea>
            <button class="btn btn-approve" style="margin-top:6px"
              @click="saveFeedback(i)">Salva feedback</button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- TAB 2: Landing -->
  <div x-show="tab === 'landing' && !loading">

    <!-- Generate new landing -->
    <div class="card">
      <h3 style="margin-bottom:12px">Genera nuova landing da angolo</h3>
      <input type="text" x-model="newAngle" placeholder="Es: PMI che hanno avuto rifiuti bancari e cercano alternative..." />
      <button class="btn btn-approve" style="margin-top:10px" @click="generateLanding()" :disabled="generating">
        <span x-show="!generating">Genera Landing →</span>
        <span x-show="generating">Generazione in corso...</span>
      </button>
    </div>

    <!-- Landing proposals -->
    <template x-for="(lp, i) in proposals.landing_proposals" :key="i">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <strong x-text="lp.landing_json?.heroTitle"></strong>
            <div style="color:#666;font-size:.85rem;margin-top:4px" x-text="'/' + lp.landing_json?.slug"></div>
            <div style="color:#888;font-size:.8rem;margin-top:2px" x-text="lp.angle_input || lp.trigger_keyword"></div>
          </div>
          <span class="badge" :class="'badge-' + lp.status" x-text="lp.status"></span>
        </div>
        <div style="margin-top:12px;color:#555;font-size:.9rem" x-text="lp.landing_json?.heroSubtitle"></div>
        <div style="display:flex;gap:8px;margin-top:12px" x-show="lp.status === 'pending'">
          <button class="btn btn-approve" @click="approveLanding(i)">Approva e Pubblica</button>
          <button class="btn btn-reject" @click="approve('landing_proposals', i, 'rejected')">Rifiuta</button>
        </div>
      </div>
    </template>
    <div x-show="proposals.landing_proposals?.length === 0" class="empty card">Nessuna landing proposta</div>
  </div>

  <!-- TAB 3: Campagne -->
  <div x-show="tab === 'campaign' && !loading">
    <template x-for="(cd, i) in proposals.campaign_drafts" :key="i">
      <div class="card">
        <div style="display:flex;justify-content:space-between">
          <div>
            <strong x-text="cd.ad_group_name"></strong>
            <div style="color:#666;font-size:.85rem" x-text="cd.campaign_name"></div>
            <div style="color:#888;font-size:.8rem;margin-top:4px" x-text="cd.keywords.length + ' keyword · ' + cd.landing_slug"></div>
          </div>
          <span class="badge" :class="'badge-' + cd.status" x-text="cd.status"></span>
        </div>
        <div style="margin-top:12px">
          <strong style="font-size:.85rem">Headline RSA:</strong>
          <div style="font-size:.85rem;color:#444;margin-top:4px" x-text="cd.headlines?.slice(0,3).join(' | ')"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px" x-show="cd.status === 'pending'">
          <button class="btn btn-approve" @click="approve('campaign_drafts', i, 'approved')">Approva Campagna</button>
          <button class="btn btn-reject" @click="approve('campaign_drafts', i, 'rejected')">Rifiuta</button>
        </div>
      </div>
    </template>
    <div x-show="proposals.campaign_drafts?.length === 0" class="empty card">Nessuna bozza campagna</div>
  </div>
</div>

<script>
function dashboard() {
  return {
    tab: 'kw',
    loading: true,
    error: null,
    proposals: {},
    newAngle: '',
    generating: false,

    async loadProposals() {
      try {
        const r = await fetch('/api/proposals/latest');
        if (!r.ok) throw new Error(await r.text());
        this.proposals = await r.json();
      } catch (e) {
        this.error = 'Errore caricamento: ' + e.message;
      } finally {
        this.loading = false;
      }
    },

    countPending(list) {
      const items = this.proposals[list] || [];
      const n = items.filter(x => x.status === 'pending').length;
      return n > 0 ? `(${n})` : '';
    },

    async approve(list, index, action) {
      await fetch('/api/actions/approve', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ date: this.proposals.date, list, index, action })
      });
      this.proposals[list][index].status = action;
    },

    async saveFeedback(index) {
      const kw = this.proposals.to_review[index];
      await fetch('/api/review/feedback', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ date: this.proposals.date, index, feedback: kw.alberto_feedback })
      });
      kw.status = 'reviewed';
    },

    async generateLanding() {
      if (!this.newAngle.trim()) return;
      this.generating = true;
      try {
        const r = await fetch('/api/landings/generate', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ angle: this.newAngle, date: this.proposals.date })
        });
        if (!r.ok) throw new Error(await r.text());
        await this.loadProposals();
        this.newAngle = '';
        this.tab = 'landing';
      } catch (e) {
        alert('Errore generazione: ' + e.message);
      } finally {
        this.generating = false;
      }
    },

    async approveLanding(index) {
      if (!confirm('Pubblica questa landing su Vercel e crea bozza campagna?')) return;
      const r = await fetch('/api/landings/approve', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ date: this.proposals.date, index })
      });
      if (!r.ok) { alert('Errore approvazione: ' + await r.text()); return; }
      await this.loadProposals();
    },
  }
}
</script>
</body>
</html>
```

- [ ] **Step 2: Test the dashboard manually**

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
source .venv/bin/activate
uvicorn dashboard.server:app --reload --port 5000
# Open browser at http://localhost:5000
```

Expected: dashboard loads, tabs visible, proposals shown.

- [ ] **Step 3: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/dashboard/templates/index.html
git commit -m "feat: add Alpine.js dashboard UI with 3 tabs"
```

---

## Chunk 6: Scheduler + Integration

### Task 11: macOS launchd scheduler

**Files:**
- Create: `mcf-ads-engine/scheduler/it.mediocreditofacile.adsengine.plist`

- [ ] **Step 1: Create plist**

```xml
<!-- mcf-ads-engine/scheduler/it.mediocreditofacile.adsengine.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>it.mediocreditofacile.adsengine</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/alberto/mediocreditofacile/mcf-ads-engine/.venv/bin/python</string>
    <string>/Users/alberto/mediocreditofacile/mcf-ads-engine/main.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/alberto/mediocreditofacile/mcf-ads-engine</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/alberto/mediocreditofacile/mcf-ads-engine/logs/daily.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/alberto/mediocreditofacile/mcf-ads-engine/logs/daily.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ANTHROPIC_API_KEY</key>
    <string>SOSTITUISCI</string>
    <key>RESEND_API_KEY</key>
    <string>SOSTITUISCI</string>
    <key>NOTIFICATION_EMAIL</key>
    <string>alberto@mediocreditofacile.it</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 2: Create logs directory**

```bash
mkdir -p /Users/alberto/mediocreditofacile/mcf-ads-engine/logs
touch /Users/alberto/mediocreditofacile/mcf-ads-engine/logs/.gitkeep
```

- [ ] **Step 3: Install scheduler (after credentials are configured)**

```bash
# Fill in real API keys in the plist first!
cp /Users/alberto/mediocreditofacile/mcf-ads-engine/scheduler/it.mediocreditofacile.adsengine.plist \
   ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/it.mediocreditofacile.adsengine.plist
# Verify:
launchctl list | grep mediocreditofacile
```

Expected: entry appears in launchctl list.

- [ ] **Step 4: Commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/scheduler/ mcf-ads-engine/logs/.gitkeep
git commit -m "feat: add macOS launchd scheduler for daily 8:00 run"
```

---

### Task 12: Full integration test + README

**Files:**
- Create: `mcf-ads-engine/README.md`

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
source .venv/bin/activate
pytest -v --tb=short
```

Expected: all tests PASS.

- [ ] **Step 2: Create README.md**

```markdown
# MCF Ads Engine

Automazione campagne Google Ads per Mediocredito Facile.

## Setup

1. Copia e compila i file di configurazione:
   ```bash
   cp .env.example .env
   cp google-ads.yaml.example google-ads.yaml
   ```

2. Ottieni le credenziali Google Ads:
   - [Developer Token](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
   - [OAuth2 Client ID](https://console.cloud.google.com/)
   - Scarica `client_secrets.json` da Google Cloud Console
   - Esegui: `python setup_auth.py` e copia il refresh token in `google-ads.yaml`

3. Installa dipendenze:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -e ".[dev]"
   ```

## Uso

**Run manuale:**
```bash
source .venv/bin/activate
python main.py
```

**Apri dashboard:**
```bash
uvicorn dashboard.server:app --port 5000
# Vai su http://localhost:5000
```

**Installa scheduler (run automatico ogni giorno alle 8:00):**
```bash
# Prima compila le variabili in scheduler/it.mediocreditofacile.adsengine.plist
cp scheduler/it.mediocreditofacile.adsengine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/it.mediocreditofacile.adsengine.plist
```

## Test

```bash
pytest -v
```

## Fasi di Rollout

| Fase | Cosa fa | Rischio |
|---|---|---|
| 1 (attuale) | Analisi + email report | Zero |
| 2 | Generazione landing + dashboard | Basso |
| 3 | Aggiornamento URL annunci | Medio |
| 4 | Creazione campagne complete | Alto |
```

- [ ] **Step 3: Final commit**

```bash
cd /Users/alberto/mediocreditofacile
git add mcf-ads-engine/README.md
git commit -m "docs: add mcf-ads-engine README with setup instructions"
```

---

## Credenziali da configurare prima di partire

Prima di eseguire qualsiasi task che richiede API reali:

1. **Google Ads Developer Token** — richiedi su [Google Ads API Center](https://ads.google.com/aw/apicenter). Processo: ~1 settimana.
2. **OAuth2 Client ID/Secret** — crea in [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials > OAuth 2.0 Client IDs (tipo: Desktop app)
3. **Anthropic API Key** — crea su [console.anthropic.com](https://console.anthropic.com/)
4. **Resend API Key** — crea su [resend.com](https://resend.com/) (piano gratuito)
