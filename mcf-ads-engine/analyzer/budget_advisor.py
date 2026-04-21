# mcf-ads-engine/analyzer/budget_advisor.py
"""
Advisor strategico budget e bid.

Dato un set di metriche di asta (auction insights), budget giornalieri e
performance keyword a 30gg, produce raccomandazioni quantificate su:
  - aumento/riduzione budget giornaliero
  - aumento/riduzione bid sull'ad group pilastro
  - priorita di esecuzione (prima budget se entrambi alti)

Quando le conversioni sono a zero (conversion tracking non ancora attivo),
usa il CPC come proxy di costo. Il target CPC proxy si deriva da
CPL_target x expected_cvr (default 10%): se il CPL target massimo e 25 EUR e
la cvr attesa e 0.10, il CPC massimo accettabile e 2.50 EUR.

Funzioni pubbliche:
  compute_recommendations(auction_insights, budgets, kws_30d, config) -> list
      Funzione pura, testabile senza toccare la Google Ads API.
  recommend(customer_id, config, yaml_path) -> list
      Wrapper che fetcha i dati dai collector esistenti e li passa alla pura.
"""
from collections import defaultdict
from typing import Optional, List, Dict, Tuple


# Mappa CPL target di default per nome campagna (match case-insensitive su
# substring). Valori in euro. Coerente con CLAUDE.md: Diventa Partner 8-40,
# Finanza Veloce 4-25.
DEFAULT_CPL_TARGETS: Dict[str, Tuple[float, float]] = {
    "diventa partner": (8.0, 40.0),
    "finanza veloce": (4.0, 25.0),
}
DEFAULT_CPL_TARGET: Tuple[float, float] = (5.0, 30.0)

# Conversion rate assunto per derivare il CPC target quando conversions == 0.
# Valore conservativo: il 10% dei click diventa contatto (form o telefonata).
DEFAULT_EXPECTED_CVR = 0.10

# Ad group pilastro per campagna: e la prima leva su cui alzare i bid quando
# l'impression share viene persa per rank.
DEFAULT_PILLAR_ADGROUPS: Dict[str, str] = {
    "diventa partner": "Vendi a Rate",
    "finanza veloce": "Noleggio Operativo",
}

# Recupero atteso: se aumentiamo il budget, ragioniamo che recupereremo il
# 60% del lost_budget (gli altri persi per fluttuazioni d'asta, concorrenza,
# ore di picco). E una stima conservativa usata nelle reason string.
RECOVERY_PCT = 0.60


def _match_campaign_key(campaign_name: str, mapping: dict) -> Optional[str]:
    if not campaign_name:
        return None
    lowered = campaign_name.lower()
    for key in mapping:
        if key.lower() in lowered:
            return key
    return None


def _get_cpl_target(
    campaign_name: str,
    cpl_targets: Dict[str, Tuple[float, float]],
) -> Tuple[float, float]:
    key = _match_campaign_key(campaign_name, cpl_targets)
    if key:
        return cpl_targets[key]
    return DEFAULT_CPL_TARGET


def _get_pillar_adgroup(
    campaign_name: str,
    pillars: Dict[str, str],
) -> Optional[str]:
    key = _match_campaign_key(campaign_name, pillars)
    if key:
        return pillars[key]
    return None


def _aggregate_campaign_metrics(kws_30d: list) -> Dict[str, dict]:
    """Aggrega le metriche per campagna dai dati keyword a 30gg."""
    camps = defaultdict(lambda: {
        "cost": 0.0, "clicks": 0, "impressions": 0, "conversions": 0.0,
    })
    for k in kws_30d:
        c = camps[k["campaign"]]
        c["cost"] += k["cost"]
        c["clicks"] += k["clicks"]
        c["impressions"] += k["impressions"]
        c["conversions"] += k["conversions"]
    result = {}
    for name, s in camps.items():
        clicks = s["clicks"]
        conv = s["conversions"]
        impr = s["impressions"]
        result[name] = {
            "cost": round(s["cost"], 2),
            "clicks": clicks,
            "impressions": impr,
            "conversions": round(conv, 1),
            "cpc": round(s["cost"] / clicks, 2) if clicks > 0 else 0.0,
            "ctr": round(clicks / impr, 4) if impr > 0 else 0.0,
            "cpl": round(s["cost"] / conv, 2) if conv > 0 else 0.0,
        }
    return result


def _classify_cost_vs_target(
    metrics: dict,
    cpl_target: Tuple[float, float],
    expected_cvr: float,
) -> str:
    """
    Classifica il costo effettivo rispetto al target.
    Ritorna 'over' | 'in_range' | 'under' | 'unknown'.

    - Se conversions > 0 usa CPL reale vs cpl_target.
    - Altrimenti usa CPC vs cpc_proxy derivato da cpl_target x expected_cvr.
    - Se non ci sono nemmeno click, ritorna 'unknown'.
    """
    cpl_min, cpl_max = cpl_target
    if metrics["conversions"] > 0:
        cpl = metrics["cpl"]
        if cpl > cpl_max:
            return "over"
        if cpl < cpl_min:
            return "under"
        return "in_range"
    if metrics["clicks"] == 0:
        return "unknown"
    cpc = metrics["cpc"]
    cpc_max_proxy = cpl_max * expected_cvr
    cpc_min_proxy = cpl_min * expected_cvr
    if cpc > cpc_max_proxy:
        return "over"
    if cpc < cpc_min_proxy:
        return "under"
    return "in_range"


def _budget_increase_multiplier(lost_budget_pct: float) -> float:
    """
    Moltiplicatore proporzionale al lost budget.
    50-75% -> +50% (x1.5). Oltre 75% -> +100% (x2.0).
    """
    if lost_budget_pct > 0.75:
        return 2.0
    return 1.5


def _estimate_recoverable_clicks(
    clicks_30d: int,
    lost_budget: float,
    lost_rank: float,
) -> int:
    """
    Stima i click recuperabili su 30gg aumentando il budget.
    Formula: nuovo_IS / IS_attuale - 1 applicato ai click osservati.
    """
    current_is = max(0.01, 1.0 - lost_budget - lost_rank)
    new_is = current_is + RECOVERY_PCT * lost_budget
    recoverable = clicks_30d * (new_is / current_is - 1.0)
    return int(max(0, round(recoverable)))


def _cpl_range_estimate(
    metrics: dict,
    cpl_target: Tuple[float, float],
    expected_cvr: float,
) -> str:
    """
    Stringa con il range CPL atteso dopo l'aumento di budget.
    - Se conv > 0: CPL attuale +/- 20%.
    - Altrimenti: CPC / cvr_attesa con range +/- 30%.
    """
    if metrics["conversions"] > 0:
        cpl = metrics["cpl"]
        low = round(cpl * 0.80, 1)
        high = round(cpl * 1.20, 1)
        return "%s-%s EUR" % (low, high)
    if metrics["clicks"] > 0:
        implied_cpl = metrics["cpc"] / expected_cvr
        low = round(implied_cpl * 0.70, 1)
        high = round(implied_cpl * 1.30, 1)
        return "%s-%s EUR (stima via CPC, conv tracking non attivo)" % (low, high)
    cpl_min, cpl_max = cpl_target
    return "%s-%s EUR (target teorico)" % (cpl_min, cpl_max)


def _reason_budget_only(
    metrics: dict,
    lost_budget: float,
    multiplier: float,
    cpl_target: Tuple[float, float],
    expected_cvr: float,
) -> str:
    recoverable = _estimate_recoverable_clicks(metrics["clicks"], lost_budget, 0.0)
    cpl_range = _cpl_range_estimate(metrics, cpl_target, expected_cvr)
    increase = int(round((multiplier - 1.0) * 100))
    clicks_month = int(round(recoverable * RECOVERY_PCT))
    cpc = metrics["cpc"]
    ctr = metrics["ctr"] * 100
    return (
        "Lost budget %d%%, CPC %.2f EUR, CTR %.1f%%. "
        "Aumento budget +%d%%: recuperando il %d%% del lost budget si stimano "
        "+%d click/mese a CPL atteso %s."
    ) % (
        round(lost_budget * 100), cpc, ctr, increase,
        int(RECOVERY_PCT * 100), clicks_month, cpl_range,
    )


def _reason_rank_only(
    metrics: dict,
    lost_rank: float,
    bid_increase_pct: float,
    pillar_adgroup: Optional[str],
    cpl_target: Tuple[float, float],
    expected_cvr: float,
) -> str:
    cpl_range = _cpl_range_estimate(metrics, cpl_target, expected_cvr)
    target = pillar_adgroup or "ad group piu performante"
    cpc = metrics["cpc"]
    ctr = metrics["ctr"] * 100
    return (
        "Lost rank %d%%, CPC %.2f EUR, CTR %.1f%%. "
        "Aumento bid +%d%% sull'ad group pilastro '%s' per migliorare il "
        "posizionamento in asta. CPL atteso post-aumento %s. Valutare il "
        "budget in seconda battuta."
    ) % (
        round(lost_rank * 100), cpc, ctr,
        int(round(bid_increase_pct * 100)), target, cpl_range,
    )


def _reason_both_high(
    metrics: dict,
    lost_budget: float,
    lost_rank: float,
    multiplier: float,
    cpl_target: Tuple[float, float],
    expected_cvr: float,
) -> str:
    recoverable = _estimate_recoverable_clicks(
        metrics["clicks"], lost_budget, lost_rank,
    )
    cpl_range = _cpl_range_estimate(metrics, cpl_target, expected_cvr)
    increase = int(round((multiplier - 1.0) * 100))
    clicks_month = int(round(recoverable * RECOVERY_PCT))
    return (
        "Lost budget %d%% e lost rank %d%% entrambi alti. Prima leva: "
        "budget +%d%% per non sprecare bid alti su un budget che si esaurisce "
        "a meta giornata. Stima +%d click/mese a CPL %s. Bid in revisione "
        "settimanale dopo stabilizzazione del budget."
    ) % (
        round(lost_budget * 100), round(lost_rank * 100), increase,
        clicks_month, cpl_range,
    )


def _reason_over_target(
    metrics: dict,
    cpl_target: Tuple[float, float],
    expected_cvr: float,
    lost_budget: float,
    lost_rank: float,
) -> str:
    cpl_min, cpl_max = cpl_target
    if metrics["conversions"] > 0:
        cpl = metrics["cpl"]
        head = "CPL %.2f EUR sopra target massimo %.0f EUR" % (cpl, cpl_max)
    else:
        cpc = metrics["cpc"]
        cpc_max = cpl_max * expected_cvr
        head = (
            "CPC %.2f EUR sopra il proxy target %.2f EUR (derivato da CPL "
            "max %.0f EUR x cvr attesa %d%%)"
        ) % (cpc, cpc_max, cpl_max, int(expected_cvr * 100))
    tail = "Riduci bid -15%% o metti in pausa le worst keyword prima di " \
           "alzare budget. Lost budget %d%%, lost rank %d%%." % (
               round(lost_budget * 100), round(lost_rank * 100),
           )
    return head + ". " + tail


def compute_recommendations(
    auction_insights: List[dict],
    budgets: List[dict],
    kws_30d: list,
    config: dict,
) -> List[dict]:
    """
    Produce raccomandazioni strategiche su budget e bid.

    Args:
        auction_insights: output di collector.google_ads.fetch_auction_insights().
        budgets: output di collector.google_ads.fetch_campaign_budgets().
        kws_30d: output di collector.google_ads.fetch_keyword_performance().
        config: dict intero (usa solo la chiave 'budget_advisor').

    Returns:
        Lista di dict raccomandazione, ordinata per priority (1 = piu urgente).
        Ogni raccomandazione contiene: campaign, trigger, action_type,
        current_budget, recommended_budget, bid_change_pct, pillar_adgroup,
        reason, priority; eventualmente alert_aggressive=True se l'aumento
        totale richiesto supera la soglia.
    """
    advisor_cfg = config.get("budget_advisor", {}) or {}
    lost_budget_threshold = advisor_cfg.get("lost_budget_threshold", 0.50)
    lost_rank_threshold = advisor_cfg.get("lost_rank_threshold", 0.40)
    bid_increase_pct = advisor_cfg.get("bid_increase_pct", 0.30)
    aggressive_threshold = advisor_cfg.get(
        "budget_increase_aggressive_threshold", 0.50,
    )
    expected_cvr = advisor_cfg.get("expected_cvr", DEFAULT_EXPECTED_CVR)

    cpl_targets = DEFAULT_CPL_TARGETS.copy()
    raw_targets = advisor_cfg.get("cpl_targets") or {}
    for k, v in raw_targets.items():
        if isinstance(v, (list, tuple)) and len(v) == 2:
            cpl_targets[k] = (float(v[0]), float(v[1]))

    pillars = DEFAULT_PILLAR_ADGROUPS.copy()
    pillars_cfg = advisor_cfg.get("pillar_adgroups") or {}
    pillars.update(pillars_cfg)

    budget_by_camp = {b["campaign"]: b for b in budgets}
    camp_metrics = _aggregate_campaign_metrics(kws_30d)

    recs: List[dict] = []
    for ai in auction_insights:
        camp_name = ai["campaign"]
        lost_budget = ai.get("lost_budget_pct", 0.0) or 0.0
        lost_rank = ai.get("lost_rank_pct", 0.0) or 0.0

        metrics = camp_metrics.get(camp_name, {
            "cost": 0.0, "clicks": 0, "impressions": 0,
            "conversions": 0.0, "cpc": 0.0, "ctr": 0.0, "cpl": 0.0,
        })
        budget_info = budget_by_camp.get(camp_name, {"daily_budget_euros": 0.0})
        current_budget = float(budget_info.get("daily_budget_euros", 0.0) or 0.0)

        cpl_target = _get_cpl_target(camp_name, cpl_targets)
        classification = _classify_cost_vs_target(metrics, cpl_target, expected_cvr)
        pillar_adgroup = _get_pillar_adgroup(camp_name, pillars)

        lost_budget_high = lost_budget > lost_budget_threshold
        lost_rank_high = lost_rank > lost_rank_threshold

        # Regola 1: costo sopra target -> ridurre bid prima di alzare qualsiasi cosa.
        if classification == "over":
            recs.append({
                "campaign": camp_name,
                "trigger": "cost_over_target",
                "action_type": "bid_decrease",
                "current_budget": current_budget,
                "recommended_budget": current_budget,
                "bid_change_pct": -0.15,
                "pillar_adgroup": pillar_adgroup,
                "reason": _reason_over_target(
                    metrics, cpl_target, expected_cvr, lost_budget, lost_rank,
                ),
                "priority": 1,
            })
            continue

        # Regola 2: entrambi alti -> budget prima, bid in revisione settimanale.
        if lost_budget_high and lost_rank_high:
            multiplier = _budget_increase_multiplier(lost_budget)
            recommended = round(current_budget * multiplier, 2)
            recs.append({
                "campaign": camp_name,
                "trigger": "lost_budget_and_rank_high",
                "action_type": "budget_increase_then_bid_review",
                "current_budget": current_budget,
                "recommended_budget": recommended,
                "bid_change_pct": bid_increase_pct,
                "pillar_adgroup": pillar_adgroup,
                "reason": _reason_both_high(
                    metrics, lost_budget, lost_rank, multiplier,
                    cpl_target, expected_cvr,
                ),
                "priority": 1,
            })
            continue

        # Regola 3: solo lost_budget alto -> aumenta budget.
        if lost_budget_high:
            multiplier = _budget_increase_multiplier(lost_budget)
            recommended = round(current_budget * multiplier, 2)
            recs.append({
                "campaign": camp_name,
                "trigger": "lost_budget_high",
                "action_type": "budget_increase",
                "current_budget": current_budget,
                "recommended_budget": recommended,
                "bid_change_pct": 0.0,
                "pillar_adgroup": pillar_adgroup,
                "reason": _reason_budget_only(
                    metrics, lost_budget, multiplier, cpl_target, expected_cvr,
                ),
                "priority": 2,
            })
            continue

        # Regola 4: solo lost_rank alto -> aumenta bid sull'ad group pilastro.
        if lost_rank_high:
            recs.append({
                "campaign": camp_name,
                "trigger": "lost_rank_high",
                "action_type": "bid_increase",
                "current_budget": current_budget,
                "recommended_budget": current_budget,
                "bid_change_pct": bid_increase_pct,
                "pillar_adgroup": pillar_adgroup,
                "reason": _reason_rank_only(
                    metrics, lost_rank, bid_increase_pct, pillar_adgroup,
                    cpl_target, expected_cvr,
                ),
                "priority": 2,
            })
            continue

    # Flag aggressivo: se l'aumento di budget aggregato supera la soglia,
    # marca tutte le raccomandazioni budget come "scelta strategica".
    budget_recs = [
        r for r in recs if r["action_type"].startswith("budget")
    ]
    total_current = sum(r["current_budget"] for r in budget_recs)
    total_recommended = sum(r["recommended_budget"] for r in budget_recs)
    if total_current > 0:
        total_increase_pct = (total_recommended - total_current) / total_current
    else:
        total_increase_pct = 0.0

    if total_increase_pct > aggressive_threshold:
        alert_msg = (
            " [ALERT: aumento aggregato richiesto %d%% oltre la soglia %d%%. "
            "Scelta strategica — approvazione esplicita richiesta in dashboard, "
            "non eseguire in automatico.]"
        ) % (
            round(total_increase_pct * 100),
            round(aggressive_threshold * 100),
        )
        for r in budget_recs:
            r["alert_aggressive"] = True
            r["reason"] = r["reason"] + alert_msg

    recs.sort(key=lambda r: (r["priority"], -(r.get("current_budget") or 0)))
    return recs


def annotate_for_dashboard(
    recommendations: List[dict],
    budgets: List[dict],
) -> List[dict]:
    """
    Arricchisce le raccomandazioni per il flusso dashboard/approvazione:
      - status = 'pending'
      - campaign_budget_resource_name dal mapping dei budget

    Mutate in place e ritorna la lista (per convenienza di chaining).
    La funzione e idempotente: se campi esistono non li sovrascrive.
    """
    budget_by_name = {b["campaign"]: b for b in budgets}
    for r in recommendations:
        r.setdefault("status", "pending")
        b = budget_by_name.get(r["campaign"])
        if b and b.get("campaign_budget_resource_name"):
            r.setdefault(
                "campaign_budget_resource_name",
                b["campaign_budget_resource_name"],
            )
    return recommendations


def recommend(
    customer_id: str,
    config: dict,
    yaml_path: str = "google-ads.yaml",
) -> List[dict]:
    """
    Wrapper che fetcha i dati live dalla Google Ads API, produce le
    raccomandazioni via compute_recommendations e le arricchisce per il
    flusso dashboard (status + campaign_budget_resource_name).
    """
    from collector.google_ads import (
        fetch_auction_insights,
        fetch_campaign_budgets,
        fetch_keyword_performance,
    )
    auction_insights = fetch_auction_insights(customer_id, yaml_path=yaml_path)
    budgets = fetch_campaign_budgets(customer_id, yaml_path=yaml_path)
    kws_30d = fetch_keyword_performance(customer_id, yaml_path=yaml_path)
    recs = compute_recommendations(auction_insights, budgets, kws_30d, config)
    return annotate_for_dashboard(recs, budgets)
