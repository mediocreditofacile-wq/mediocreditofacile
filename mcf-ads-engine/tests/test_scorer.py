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
