# mcf-ads-engine/gsc_audit.py
"""
Audit della visibilità ORGANICA di mediocreditofacile.it via Google Search Console.
A differenza dell'engine Ads (che vede solo il pagato), qui leggiamo le query
non a pagamento: impression, click, CTR e posizione media.

Uso:
    python gsc_audit.py            # ultimi 90 giorni
    python gsc_audit.py 28         # ultimi N giorni

Output: report HTML in ~/Desktop/_AI/output/report/audit-organico-gsc-YYYY-MM-DD.html
Config: gsc-config.json (client_id, client_secret, refresh_token, site_url)
"""
import json
import sys
import datetime
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CFG_PATH = Path(__file__).parent / "gsc-config.json"
OUT_DIR = Path.home() / "Desktop" / "_AI" / "output" / "report"


def _service():
    cfg = json.loads(CFG_PATH.read_text())
    creds = Credentials(
        token=None,
        refresh_token=cfg["refresh_token"],
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        token_uri=cfg["token_uri"],
    )
    return build("searchconsole", "v1", credentials=creds), cfg["site_url"]


def fetch(svc, site, start, end, dimensions, row_limit=25000):
    body = {
        "startDate": start,
        "endDate": end,
        "dimensions": dimensions,
        "rowLimit": row_limit,
    }
    resp = svc.searchanalytics().query(siteUrl=site, body=body).execute()
    return resp.get("rows", [])


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def pct(x):
    return f"{x * 100:.1f}%"


def build_html(start, end, totals, queries, pages, opportunities, brand_queries):
    css = """
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#293C5B;
    max-width:1040px;margin:0 auto;padding:32px 24px;line-height:1.55;background:#fff}
    h1{color:#664CCD;font-size:1.7rem;margin:0 0 4px}
    h2{color:#0F1020;font-size:1.2rem;margin:36px 0 8px;border-bottom:2px solid #FE6F3A;padding-bottom:4px}
    .sub{color:#787782;font-size:.9rem;margin-bottom:24px}
    .kpis{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}
    .kpi{background:#F8F7FA;border:1px solid #E1DEE3;border-radius:10px;padding:14px 18px;min-width:150px}
    .kpi .n{font-size:1.5rem;font-weight:800;color:#FE6F3A}
    .kpi .l{font-size:.8rem;color:#787782}
    table{border-collapse:collapse;width:100%;margin:10px 0;font-size:.88rem}
    th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #E1DEE3}
    th{color:#664CCD;font-weight:700;background:#F8F7FA}
    td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
    .q{color:#293C5B}
    .note{background:#FFF3EC;border-left:3px solid #FE6F3A;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:.9rem}
    .pos-good{color:#2D8F4E;font-weight:700}.pos-mid{color:#E6A817;font-weight:700}.pos-low{color:#787782}
    """
    def poscell(p):
        cls = "pos-good" if p <= 3 else ("pos-mid" if p <= 10 else "pos-low")
        return f'<td class="n {cls}">{p:.1f}</td>'

    def qrows(rows):
        out = []
        for r in rows:
            q = esc(r["keys"][0])
            out.append(
                f'<tr><td class="q">{q}</td><td class="n">{r["clicks"]:.0f}</td>'
                f'<td class="n">{r["impressions"]:.0f}</td><td class="n">{pct(r["ctr"])}</td>'
                f'{poscell(r["position"])}</tr>'
            )
        return "\n".join(out)

    def prows(rows):
        out = []
        for r in rows:
            url = r["keys"][0].replace("https://www.mediocreditofacile.it", "")
            out.append(
                f'<tr><td class="q">{esc(url)}</td><td class="n">{r["clicks"]:.0f}</td>'
                f'<td class="n">{r["impressions"]:.0f}</td><td class="n">{pct(r["ctr"])}</td>'
                f'{poscell(r["position"])}</tr>'
            )
        return "\n".join(out)

    th = '<tr><th>Query</th><th class="n">Click</th><th class="n">Impr.</th><th class="n">CTR</th><th class="n">Pos.</th></tr>'
    thp = '<tr><th>Pagina</th><th class="n">Click</th><th class="n">Impr.</th><th class="n">CTR</th><th class="n">Pos.</th></tr>'

    return f"""<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audit Organico GSC — Mediocredito Facile</title><style>{css}</style></head><body>
<h1>Audit visibilità organica</h1>
<div class="sub">Mediocredito Facile · Google Search Console · periodo {start} → {end} (ricerca NON a pagamento)</div>

<div class="kpis">
  <div class="kpi"><div class="n">{totals['clicks']:.0f}</div><div class="l">Click organici</div></div>
  <div class="kpi"><div class="n">{totals['impressions']:.0f}</div><div class="l">Impression</div></div>
  <div class="kpi"><div class="n">{pct(totals['ctr'])}</div><div class="l">CTR medio</div></div>
  <div class="kpi"><div class="n">{totals['position']:.1f}</div><div class="l">Posizione media</div></div>
  <div class="kpi"><div class="n">{totals['nqueries']}</div><div class="l">Query distinte</div></div>
</div>

<h2>Occasioni da spremere — pos. 4-20 con domanda</h2>
<div class="note">Query dove sei già visibile ma non in cima: stai in fondo alla prima pagina o in seconda.
Migliorare il contenuto su queste porta i click più velocemente che inseguire query nuove. Ordinate per impression.</div>
<table>{th}
{qrows(opportunities)}
</table>

<h2>Top query organiche per click</h2>
<table>{th}
{qrows(queries)}
</table>

<h2>Query di brand (chi ti cerca per nome)</h2>
<table>{th}
{qrows(brand_queries) if brand_queries else '<tr><td colspan=5 class="pos-low">Nessuna query di brand nel periodo.</td></tr>'}
</table>

<h2>Pagine che portano traffico organico</h2>
<table>{thp}
{prows(pages)}
</table>

<div class="sub" style="margin-top:34px">Generato da gsc_audit.py · le pagine SEO nuove (giugno 2026) non compaiono ancora: l'organico le indicizza in qualche settimana.</div>
</body></html>"""


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    # GSC ha ~2-3 giorni di lag: chiudiamo la finestra 3 giorni fa
    end = datetime.date.today() - datetime.timedelta(days=3)
    start = end - datetime.timedelta(days=days)
    start_s, end_s = start.isoformat(), end.isoformat()

    svc, site = _service()
    q_rows = fetch(svc, site, start_s, end_s, ["query"])
    p_rows = fetch(svc, site, start_s, end_s, ["page"])

    tot_clicks = sum(r["clicks"] for r in q_rows)
    tot_impr = sum(r["impressions"] for r in q_rows)
    # posizione media pesata sulle impression
    avg_pos = (sum(r["position"] * r["impressions"] for r in q_rows) / tot_impr) if tot_impr else 0
    totals = {
        "clicks": tot_clicks,
        "impressions": tot_impr,
        "ctr": (tot_clicks / tot_impr) if tot_impr else 0,
        "position": avg_pos,
        "nqueries": len(q_rows),
    }

    queries = sorted(q_rows, key=lambda r: -r["clicks"])[:30]
    pages = sorted(p_rows, key=lambda r: -r["clicks"])[:20]
    opportunities = sorted(
        [r for r in q_rows if 4 <= r["position"] <= 20 and r["impressions"] >= 3],
        key=lambda r: -r["impressions"],
    )[:25]
    brand_terms = ("mediocredito", "medio credito", "credito facile")
    brand_queries = sorted(
        [r for r in q_rows if any(b in r["keys"][0].lower() for b in brand_terms)],
        key=lambda r: -r["impressions"],
    )[:15]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"audit-organico-gsc-{datetime.date.today().isoformat()}.html"
    out.write_text(build_html(start_s, end_s, totals, queries, pages, opportunities, brand_queries))
    print(f"OK report: {out}")
    print(f"Periodo {start_s} -> {end_s} | click {tot_clicks:.0f} | impr {tot_impr:.0f} | "
          f"CTR {totals['ctr']*100:.1f}% | pos media {avg_pos:.1f} | query {len(q_rows)}")


if __name__ == "__main__":
    main()
