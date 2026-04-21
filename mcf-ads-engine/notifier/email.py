# mcf-ads-engine/notifier/email.py
from typing import Optional, List

import resend


def _recommendations_summary_html(recommendations: Optional[List[dict]]) -> str:
    """Blocco HTML con le prime 3 raccomandazioni strategiche per priorita."""
    if not recommendations:
        return ""
    top3 = recommendations[:3]
    items = []
    action_labels = {
        "budget_increase": "Aumenta budget",
        "bid_increase": "Aumenta bid (ad group pilastro)",
        "bid_decrease": "Riduci bid",
        "budget_increase_then_bid_review": "Budget prima, bid dopo",
    }
    for r in top3:
        action = action_labels.get(r["action_type"], r["action_type"])
        current = r["current_budget"]
        recommended = r["recommended_budget"]
        if recommended != current and current > 0:
            delta_pct = (recommended - current) / current * 100
            sign = "+" if delta_pct >= 0 else ""
            budget_str = (
                "EUR %.2f &rarr; EUR %.2f (%s%.0f%%)"
                % (current, recommended, sign, delta_pct)
            )
        else:
            bid_pct = r.get("bid_change_pct") or 0.0
            if bid_pct != 0:
                sign = "+" if bid_pct > 0 else ""
                budget_str = "bid %s%d%%" % (sign, int(round(bid_pct * 100)))
            else:
                budget_str = "invariato"
        alert = ""
        if r.get("alert_aggressive"):
            alert = " <span style='color:red;font-weight:bold'>[ALERT]</span>"
        items.append(
            "<li><strong>%s</strong>%s &mdash; %s (%s)<br>"
            "<span style='color:#555;font-size:0.9em'>%s</span></li>"
            % (r["campaign"], alert, action, budget_str, r["reason"])
        )
    return (
        "<h3>Raccomandazioni strategiche (top 3)</h3>"
        "<ol>" + "".join(items) + "</ol>"
    )


def build_daily_html(
    proposals: dict,
    date_str: str,
    recommendations: Optional[List[dict]] = None,
) -> str:
    n_pause = sum(1 for x in proposals.get("to_pause", []) if x["status"] == "pending")
    n_landing = sum(1 for x in proposals.get("landing_proposals", []) if x["status"] == "pending")
    n_campaigns = sum(1 for x in proposals.get("campaign_drafts", []) if x["status"] == "pending")
    total = n_pause + n_landing + n_campaigns
    recs_block = _recommendations_summary_html(recommendations)
    return f"""
<h2>MCF Ads Engine — Report {date_str}</h2>
{recs_block}
<p><strong>{total} azioni da approvare</strong></p>
<ul>
  <li>⏸️ {n_pause} KW da mettere in pausa</li>
  <li>🚀 {n_landing} landing page proposte</li>
  <li>📢 {n_campaigns} bozze campagna</li>
</ul>
<p><a href="http://127.0.0.1:5001">→ Apri Dashboard</a></p>
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
<p><a href="http://127.0.0.1:5001">→ Apri Dashboard</a></p>
"""


def send_daily_report(
    proposals: dict,
    api_key: str,
    to_email: str,
    date_str: str,
    recommendations: Optional[List[dict]] = None,
) -> None:
    resend.api_key = api_key
    n_total = (
        sum(1 for x in proposals.get("to_pause", []) if x["status"] == "pending")
        + sum(1 for x in proposals.get("landing_proposals", []) if x["status"] == "pending")
        + sum(1 for x in proposals.get("campaign_drafts", []) if x["status"] == "pending")
    )
    n_recs = len(recommendations or [])
    subject_tag = f" | {n_recs} racc. strategiche" if n_recs > 0 else ""
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — Report {date_str} | {n_total} azioni da approvare{subject_tag}",
        "html": build_daily_html(proposals, date_str, recommendations=recommendations),
    })


def send_weekly_report(data: dict, api_key: str, to_email: str, date_str: str) -> None:
    resend.api_key = api_key
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — Report Settimanale {date_str}",
        "html": build_weekly_html(data, date_str),
    })


def build_anomaly_html(result: dict, date_str: str) -> str:
    account = result["account"]

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
<p><a href="http://127.0.0.1:5001">&#8594; Apri Dashboard</a></p>
"""


def build_weekly_search_terms_html(negatives_data: dict, date_str: str) -> str:
    n_total = negatives_data.get("total_terms_analyzed", 0)
    n_neg = len(negatives_data.get("negatives", []))
    rows = "".join(
        f"<tr><td>{n['search_term']}</td><td>{n['campaign']}</td>"
        f"<td>{n.get('category', '-')}</td><td>{n['impressions']}</td>"
        f"<td>€{n['cost']}</td></tr>"
        for n in negatives_data.get("negatives", [])
    )
    return f"""
<h2>MCF Ads Engine — Search Terms {date_str}</h2>
<p>Analizzati <strong>{n_total}</strong> search term degli ultimi 30 giorni.</p>
<p><strong>{n_neg} keyword negative candidate</strong> da approvare in dashboard.</p>
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Search Term</th><th>Campagna</th><th>Categoria</th><th>Impressioni</th><th>Costo</th></tr>
  {rows}
</table>
<p><a href="http://127.0.0.1:5001">→ Apri Dashboard per approvare</a></p>
"""


def send_weekly_search_terms_report(negatives_data: dict, api_key: str, to_email: str, date_str: str) -> None:
    resend.api_key = api_key
    n_neg = len(negatives_data.get("negatives", []))
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — {n_neg} negative KW candidate — {date_str}",
        "html": build_weekly_search_terms_html(negatives_data, date_str),
    })


def build_audit_html(audit_data: dict, date_str: str) -> str:
    rows = ""
    issues_html = ""
    for c in audit_data.get("campaigns", []):
        cpa_str = f"€{c['cpa']}" if c["cpa"] > 0 else "—"
        rows += (
            f"<tr>"
            f"<td><b>{c['name']}</b></td>"
            f"<td>€{c['budget']}/gg</td>"
            f"<td>{c['bidding']}</td>"
            f"<td>{c['impressions']:,}</td>"
            f"<td>{c['clicks']:,}</td>"
            f"<td>€{c['cost']}</td>"
            f"<td>{c['conversions']:.0f}</td>"
            f"<td>{c['ctr']}%</td>"
            f"<td>{cpa_str}</td>"
            f"</tr>"
        )
        # Segnala annunci disapprovati
        for ag in c.get("ad_groups", []):
            for ad in ag.get("ads", []):
                if ad["approval"] == "DISAPPROVED":
                    topics = ", ".join(ad["policy_topics"])
                    issues_html += (
                        f"<li>⚠️ <b>{c['name']}</b> › {ag['name']}: "
                        f"Ad disapprovato — {topics}</li>"
                    )

    return f"""
<h2>MCF Ads Engine — Audit Campagne {date_str}</h2>
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse">
  <tr style="background:#f5f5f5">
    <th>Campagna</th><th>Budget</th><th>Bidding</th>
    <th>Impr</th><th>Click</th><th>Costo</th>
    <th>Conv</th><th>CTR</th><th>CPA</th>
  </tr>
  {rows}
</table>
{"<h3>⚠️ Problemi rilevati</h3><ul>" + issues_html + "</ul>" if issues_html else "<p>✅ Nessun problema rilevato.</p>"}
<p><a href="http://127.0.0.1:5001/audit">→ Vedi audit completo in Dashboard</a></p>
"""


def send_weekly_audit(audit_data: dict, api_key: str, to_email: str, date_str: str) -> None:
    resend.api_key = api_key
    n_campaigns = len(audit_data.get("campaigns", []))
    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — Audit {n_campaigns} campagne — {date_str}",
        "html": build_audit_html(audit_data, date_str),
    })


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
