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
