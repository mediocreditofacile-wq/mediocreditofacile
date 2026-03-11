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
<p><a href="http://127.0.0.1:5000">→ Apri Dashboard</a></p>
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
<p><a href="http://127.0.0.1:5000">→ Apri Dashboard</a></p>
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
