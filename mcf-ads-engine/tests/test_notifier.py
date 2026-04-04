# mcf-ads-engine/tests/test_notifier.py
from notifier.email import build_daily_html, build_weekly_html, build_weekly_search_terms_html


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


def test_build_weekly_search_terms_html_shows_counts():
    negatives_data = {
        "total_terms_analyzed": 120,
        "negatives": [
            {"search_term": "noleggio auto privati", "campaign": "Noleggio",
             "ad_group": "Gen", "category": "Irrelevant", "impressions": 50, "cost": 2.5},
            {"search_term": "mutuo prima casa", "campaign": "Finanziamento",
             "ad_group": "Gen", "category": "Irrelevant", "impressions": 30, "cost": 1.2},
        ],
    }
    html = build_weekly_search_terms_html(negatives_data, "2026-03-11")
    assert "120" in html
    assert "2" in html
    assert "noleggio auto privati" in html
    assert "2026-03-11" in html
