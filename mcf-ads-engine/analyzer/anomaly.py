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


def _campaign_totals_by_date(daily_data: list, campaign: str) -> dict:
    """Filtra i dati per una campagna e aggrega (in questo caso 1 campagna = 1 riga/giorno)."""
    filtered = [r for r in daily_data if r["campaign"] == campaign]
    return compute_account_totals(filtered)


def _check_metric(today_val, avg_val, metric, thresholds) -> dict:
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
