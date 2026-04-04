import yaml
import numpy as np


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
    Classifica le keyword in tre liste.

    Precedenza (mutualmente esclusiva per KW):
      1. Fuori target → to_pause (termini/settori esclusi)
      2. Costo elevato, zero conversioni → to_pause
      3. Ha conversioni → to_review (priorità sul reward;
         una KW che converte non viene anche premiata — prima va valutata la qualità)
      4. CPC basso + CTR alto + zero conversioni → to_reward
      5. Tutte le altre: ignorate
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
