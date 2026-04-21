# tests/test_budget_advisor.py
"""
Test per analyzer/budget_advisor.

Casi coperti:
 1. lost_budget alto + CPL nel target  -> raccomanda aumento budget
 2. lost_rank alto + CPL nel target    -> raccomanda aumento bid (ad group pilastro)
 3. entrambi alti                      -> budget prima, bid dopo (priorita 1)
 4. CPL sopra target                   -> riduzione bid, non aumento
 5. aumento totale > soglia aggressiva -> flag alert su tutte le racc. budget
 6. conv==0, CPC come proxy in range   -> usa CPC proxy, raccomanda aumento budget
 7. build_daily_html e build_report    -> retrocompatibili (recommendations=None)
"""
from analyzer.budget_advisor import compute_recommendations


def _cfg(**overrides) -> dict:
    base = {
        "budget_advisor": {
            "lost_budget_threshold": 0.50,
            "lost_rank_threshold": 0.40,
            "bid_increase_pct": 0.30,
            "budget_increase_aggressive_threshold": 0.50,
            "expected_cvr": 0.10,
            "cpl_targets": {
                "Diventa Partner": [8, 40],
                "Finanza Veloce": [4, 25],
            },
            "pillar_adgroups": {
                "Diventa Partner": "Vendi a Rate",
                "Finanza Veloce": "Noleggio Operativo",
            },
        }
    }
    base["budget_advisor"].update(overrides)
    return base


def _kws(campaign: str, cost: float, clicks: int, impressions: int, conversions: float) -> list:
    """Una singola riga keyword che rappresenta i totali campagna."""
    return [{
        "keyword": "seed",
        "match_type": "PHRASE",
        "campaign": campaign,
        "ad_group": "Generico",
        "cost": cost,
        "clicks": clicks,
        "impressions": impressions,
        "conversions": conversions,
        "cpc": round(cost / clicks, 4) if clicks > 0 else 0.0,
        "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
    }]


# ---------------------------------------------------------------- CASO 1 ----
def test_lost_budget_high_cpl_in_target_recommends_budget_increase():
    """
    Finanza Veloce con lost_budget 60% e CPL 10 EUR (target 4-25) -> aumento budget +50%.
    """
    auction = [{
        "campaign": "Finanza Veloce",
        "lost_budget_pct": 0.60,
        "lost_rank_pct": 0.10,
        "impression_share": 0.30,
    }]
    budgets = [{"campaign": "Finanza Veloce", "daily_budget_euros": 10.0}]
    # CPL = 50 / 5 = 10 EUR, dentro range 4-25
    kws = _kws("Finanza Veloce", cost=50.0, clicks=50, impressions=2000, conversions=5.0)

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 1
    r = recs[0]
    assert r["campaign"] == "Finanza Veloce"
    assert r["trigger"] == "lost_budget_high"
    assert r["action_type"] == "budget_increase"
    assert r["current_budget"] == 10.0
    # lost_budget 60% e in 50-75 -> x1.5 -> 15 EUR
    assert r["recommended_budget"] == 15.0
    assert r["priority"] == 2
    assert "Lost budget 60%" in r["reason"]
    assert r.get("alert_aggressive") is not True


# ---------------------------------------------------------------- CASO 2 ----
def test_lost_rank_high_cpl_in_target_recommends_bid_increase_on_pillar():
    """
    Diventa Partner con lost_rank 50% e CPL 15 EUR (target 8-40) -> bid +30% su 'Vendi a Rate'.
    """
    auction = [{
        "campaign": "Diventa Partner - Vendor",
        "lost_budget_pct": 0.10,
        "lost_rank_pct": 0.50,
        "impression_share": 0.40,
    }]
    budgets = [{"campaign": "Diventa Partner - Vendor", "daily_budget_euros": 20.0}]
    # CPL = 30 / 2 = 15 EUR, dentro range 8-40
    kws = _kws("Diventa Partner - Vendor", cost=30.0, clicks=30, impressions=1500, conversions=2.0)

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 1
    r = recs[0]
    assert r["trigger"] == "lost_rank_high"
    assert r["action_type"] == "bid_increase"
    assert r["bid_change_pct"] == 0.30
    assert r["pillar_adgroup"] == "Vendi a Rate"
    assert r["current_budget"] == r["recommended_budget"] == 20.0
    assert "Lost rank 50%" in r["reason"]
    assert "Vendi a Rate" in r["reason"]


# ---------------------------------------------------------------- CASO 3 ----
def test_both_high_recommends_budget_first_then_bid():
    """
    Finanza Veloce con lost_budget 60% e lost_rank 45% -> budget prima, bid dopo (priorita 1).
    """
    auction = [{
        "campaign": "Finanza Veloce",
        "lost_budget_pct": 0.60,
        "lost_rank_pct": 0.45,
        "impression_share": 0.10,
    }]
    budgets = [{"campaign": "Finanza Veloce", "daily_budget_euros": 10.0}]
    kws = _kws("Finanza Veloce", cost=50.0, clicks=50, impressions=2000, conversions=5.0)

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 1
    r = recs[0]
    assert r["trigger"] == "lost_budget_and_rank_high"
    assert r["action_type"] == "budget_increase_then_bid_review"
    assert r["recommended_budget"] == 15.0
    assert r["bid_change_pct"] == 0.30
    assert r["priority"] == 1
    assert "budget +50%" in r["reason"]
    assert "Bid in revisione" in r["reason"]


# ---------------------------------------------------------------- CASO 4 ----
def test_cpl_over_target_recommends_bid_decrease_not_increase():
    """
    Finanza Veloce con CPL 40 EUR (target max 25) -> riduzione bid, anche se lost_budget alto.
    """
    auction = [{
        "campaign": "Finanza Veloce",
        "lost_budget_pct": 0.70,
        "lost_rank_pct": 0.30,
        "impression_share": 0.10,
    }]
    budgets = [{"campaign": "Finanza Veloce", "daily_budget_euros": 10.0}]
    # CPL = 40 / 1 = 40 EUR, sopra il massimo 25
    kws = _kws("Finanza Veloce", cost=40.0, clicks=20, impressions=800, conversions=1.0)

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 1
    r = recs[0]
    assert r["trigger"] == "cost_over_target"
    assert r["action_type"] == "bid_decrease"
    assert r["bid_change_pct"] == -0.15
    assert r["recommended_budget"] == r["current_budget"]  # niente aumento budget
    assert "sopra target massimo" in r["reason"]


# ---------------------------------------------------------------- CASO 5 ----
def test_aggressive_total_increase_flags_alert_on_all_budget_recommendations():
    """
    Due campagne, entrambe con lost_budget >75% -> x2.0 -> aumento aggregato +100% > 50% soglia.
    Entrambe le raccomandazioni di aumento budget devono avere alert_aggressive=True.
    """
    auction = [
        {
            "campaign": "Finanza Veloce",
            "lost_budget_pct": 0.80,
            "lost_rank_pct": 0.10,
            "impression_share": 0.10,
        },
        {
            "campaign": "Diventa Partner",
            "lost_budget_pct": 0.78,
            "lost_rank_pct": 0.12,
            "impression_share": 0.10,
        },
    ]
    budgets = [
        {"campaign": "Finanza Veloce", "daily_budget_euros": 10.0},
        {"campaign": "Diventa Partner", "daily_budget_euros": 10.0},
    ]
    kws = (
        _kws("Finanza Veloce", cost=50.0, clicks=50, impressions=2000, conversions=5.0)
        + _kws("Diventa Partner", cost=30.0, clicks=30, impressions=1500, conversions=2.0)
    )

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 2
    for r in recs:
        assert r["action_type"] == "budget_increase"
        assert r["recommended_budget"] == r["current_budget"] * 2.0
        assert r.get("alert_aggressive") is True
        assert "ALERT" in r["reason"]


# ---------------------------------------------------------------- CASO 6 ----
def test_conversions_zero_uses_cpc_proxy():
    """
    Quando conversions=0 il classifier usa il CPC. Se il CPC e sotto il proxy target
    (cpl_max * expected_cvr), il costo e 'in_range' e scatta la logica normale.

    Finanza Veloce: cpl_max=25, cvr=10% -> cpc_max_proxy=2.5 EUR.
    CPC=1.80 EUR -> in_range. lost_budget 60% -> aumento budget.
    """
    auction = [{
        "campaign": "Finanza Veloce",
        "lost_budget_pct": 0.60,
        "lost_rank_pct": 0.10,
        "impression_share": 0.30,
    }]
    budgets = [{"campaign": "Finanza Veloce", "daily_budget_euros": 10.0}]
    # cost=90, clicks=50 -> CPC=1.80; conv=0 -> proxy CPC mode
    kws = _kws("Finanza Veloce", cost=90.0, clicks=50, impressions=2500, conversions=0.0)

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 1
    r = recs[0]
    assert r["trigger"] == "lost_budget_high"
    assert r["action_type"] == "budget_increase"
    assert "stima via CPC" in r["reason"]  # la reason dichiara il fallback CPC


# ---------------------------------------------------------------- CASO 7 ----
def test_no_recommendation_when_below_thresholds():
    """Campagna con lost_budget e lost_rank entrambi sotto soglia: nessuna raccomandazione."""
    auction = [{
        "campaign": "Finanza Veloce",
        "lost_budget_pct": 0.30,
        "lost_rank_pct": 0.20,
        "impression_share": 0.50,
    }]
    budgets = [{"campaign": "Finanza Veloce", "daily_budget_euros": 10.0}]
    kws = _kws("Finanza Veloce", cost=50.0, clicks=50, impressions=2000, conversions=5.0)

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert recs == []


# ---------------------------------------------------------------- CASO 8 ----
def test_priority_sort_puts_urgent_recommendations_first():
    """
    Tre campagne: una con CPL sopra target (pri 1), una con lost_budget+rank (pri 1),
    una con solo lost_budget (pri 2). L'ordinamento deve rispettare la priorita.
    """
    auction = [
        {
            "campaign": "Finanza Veloce",
            "lost_budget_pct": 0.60,
            "lost_rank_pct": 0.10,
            "impression_share": 0.30,
        },  # pri 2
        {
            "campaign": "Diventa Partner",
            "lost_budget_pct": 0.80,
            "lost_rank_pct": 0.50,
            "impression_share": 0.10,
        },  # pri 1
    ]
    budgets = [
        {"campaign": "Finanza Veloce", "daily_budget_euros": 10.0},
        {"campaign": "Diventa Partner", "daily_budget_euros": 20.0},
    ]
    kws = (
        _kws("Finanza Veloce", cost=50.0, clicks=50, impressions=2000, conversions=5.0)
        + _kws("Diventa Partner", cost=60.0, clicks=40, impressions=1500, conversions=3.0)
    )

    recs = compute_recommendations(auction, budgets, kws, _cfg())
    assert len(recs) == 2
    assert recs[0]["priority"] == 1
    assert recs[1]["priority"] == 2


# ---------------------------------------------------------------- RETROCOMP ----
def test_build_daily_html_backwards_compatible_without_recommendations():
    """build_daily_html deve continuare a funzionare senza il parametro recommendations."""
    from notifier.email import build_daily_html
    proposals = {
        "to_pause": [{"status": "pending"}],
        "landing_proposals": [],
        "campaign_drafts": [],
    }
    html = build_daily_html(proposals, "2026-04-21")
    assert "2026-04-21" in html
    assert "1 KW" in html
    # Nessun blocco raccomandazioni quando il parametro e omesso
    assert "Raccomandazioni strategiche" not in html


def test_build_daily_html_includes_top3_recommendations():
    """build_daily_html mostra solo le prime 3 raccomandazioni e evidenzia l'alert."""
    from notifier.email import build_daily_html
    recs = [
        {
            "campaign": "Finanza Veloce",
            "trigger": "lost_budget_and_rank_high",
            "action_type": "budget_increase_then_bid_review",
            "current_budget": 10.0,
            "recommended_budget": 20.0,
            "bid_change_pct": 0.30,
            "pillar_adgroup": "Noleggio Operativo",
            "reason": "Lost budget 80%, lost rank 50%.",
            "priority": 1,
            "alert_aggressive": True,
        },
        {
            "campaign": "Diventa Partner",
            "trigger": "lost_rank_high",
            "action_type": "bid_increase",
            "current_budget": 20.0,
            "recommended_budget": 20.0,
            "bid_change_pct": 0.30,
            "pillar_adgroup": "Vendi a Rate",
            "reason": "Lost rank 50%.",
            "priority": 2,
        },
        {
            "campaign": "Camp C",
            "trigger": "lost_budget_high",
            "action_type": "budget_increase",
            "current_budget": 5.0,
            "recommended_budget": 7.5,
            "bid_change_pct": 0.0,
            "pillar_adgroup": None,
            "reason": "Lost budget 55%.",
            "priority": 2,
        },
        {
            "campaign": "Camp D — non deve apparire",
            "trigger": "lost_budget_high",
            "action_type": "budget_increase",
            "current_budget": 5.0,
            "recommended_budget": 7.5,
            "bid_change_pct": 0.0,
            "pillar_adgroup": None,
            "reason": "Lost budget 55%.",
            "priority": 2,
        },
    ]
    proposals = {"to_pause": [], "landing_proposals": [], "campaign_drafts": []}
    html = build_daily_html(proposals, "2026-04-21", recommendations=recs)
    assert "Raccomandazioni strategiche" in html
    assert "Finanza Veloce" in html
    assert "Diventa Partner" in html
    assert "Camp C" in html
    assert "Camp D" not in html  # solo top 3
    assert "[ALERT]" in html


def test_build_report_backwards_compatible_without_recommendations(tmp_path):
    """build_report deve funzionare anche senza il nuovo parametro recommendations."""
    from generator.report_docx import build_report
    kws = [{
        "keyword": "test", "match_type": "PHRASE",
        "campaign": "Camp", "ad_group": "AG",
        "cost": 10.0, "clicks": 20, "impressions": 400, "conversions": 1.0,
        "cpc": 0.5, "ctr": 0.05,
    }]
    output = tmp_path / "r.docx"
    proposals = {"to_pause": [], "to_review": [], "to_reward": []}
    path = build_report(
        kws_30d=kws, kws_7d=[], proposals=proposals,
        date_str="2026-04-21", output_path=str(output),
    )
    assert output.exists()
    assert str(output) == path
