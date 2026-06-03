# mcf-ads-engine/gsc_audit.py
"""
Audit della visibilità ORGANICA di mediocreditofacile.it via Google Search Console.
A differenza dell'engine Ads (che vede solo il pagato), qui leggiamo le query
non a pagamento: impression, click, CTR e posizione media.

Report GRAFICO (Chart.js): trend nel tempo, occasioni pos 4-20, distribuzione posizioni.

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
    body = {"startDate": start, "endDate": end, "dimensions": dimensions, "rowLimit": row_limit}
    return svc.searchanalytics().query(siteUrl=site, body=body).execute().get("rows", [])


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def pct(x):
    return f"{x * 100:.1f}%"


def _poscell(p):
    cls = "pos-good" if p <= 3 else ("pos-mid" if p <= 10 else "pos-low")
    return f'<td class="n {cls}">{p:.1f}</td>'


def _qrows(rows):
    out = []
    for r in rows:
        out.append(
            f'<tr><td class="q">{esc(r["keys"][0])}</td><td class="n">{r["clicks"]:.0f}</td>'
            f'<td class="n">{r["impressions"]:.0f}</td><td class="n">{pct(r["ctr"])}</td>'
            f'{_poscell(r["position"])}</tr>'
        )
    return "\n".join(out) or '<tr><td colspan="5" class="pos-low">Nessun dato nel periodo.</td></tr>'


def _prows(rows):
    out = []
    for r in rows:
        url = r["keys"][0].replace("https://www.mediocreditofacile.it", "") or "/"
        out.append(
            f'<tr><td class="q">{esc(url)}</td><td class="n">{r["clicks"]:.0f}</td>'
            f'<td class="n">{r["impressions"]:.0f}</td><td class="n">{pct(r["ctr"])}</td>'
            f'{_poscell(r["position"])}</tr>'
        )
    return "\n".join(out) or '<tr><td colspan="5" class="pos-low">Nessun dato nel periodo.</td></tr>'


def build_html(ctx):
    th = '<tr><th>Query</th><th class="n">Click</th><th class="n">Impr.</th><th class="n">CTR</th><th class="n">Pos.</th></tr>'
    thp = '<tr><th>Pagina</th><th class="n">Click</th><th class="n">Impr.</th><th class="n">CTR</th><th class="n">Pos.</th></tr>'
    t = ctx["totals"]

    template = r"""<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audit Organico GSC — Mediocredito Facile</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#293C5B;max-width:1040px;margin:0 auto;padding:32px 24px;line-height:1.55;background:#fff}
h1{color:#664CCD;font-size:1.7rem;margin:0 0 4px}
h2{color:#0F1020;font-size:1.2rem;margin:36px 0 8px;border-bottom:2px solid #FE6F3A;padding-bottom:4px}
.sub{color:#787782;font-size:.9rem;margin-bottom:24px}
.kpis{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}
.kpi{background:#F8F7FA;border:1px solid #E1DEE3;border-radius:10px;padding:14px 18px;min-width:140px}
.kpi .n{font-size:1.5rem;font-weight:800;color:#FE6F3A}
.kpi .l{font-size:.8rem;color:#787782}
.chartbox{background:#fff;border:1px solid #E1DEE3;border-radius:10px;padding:16px;margin:12px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:760px){.grid2{grid-template-columns:1fr}}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:.88rem}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #E1DEE3}
th{color:#664CCD;font-weight:700;background:#F8F7FA}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.q{color:#293C5B}
.note{background:#FFF3EC;border-left:3px solid #FE6F3A;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:.9rem}
.pos-good{color:#2D8F4E;font-weight:700}.pos-mid{color:#E6A817;font-weight:700}.pos-low{color:#787782}
</style></head><body>
<h1>Audit visibilità organica</h1>
<div class="sub">Mediocredito Facile · Google Search Console · periodo __START__ → __END__ (ricerca NON a pagamento)</div>

<div class="kpis">
  <div class="kpi"><div class="n">__CLICKS__</div><div class="l">Click organici</div></div>
  <div class="kpi"><div class="n">__IMPR__</div><div class="l">Impression</div></div>
  <div class="kpi"><div class="n">__CTR__</div><div class="l">CTR medio</div></div>
  <div class="kpi"><div class="n">__POS__</div><div class="l">Posizione media</div></div>
  <div class="kpi"><div class="n">__NQ__</div><div class="l">Query distinte</div></div>
</div>

<h2>Andamento nel tempo</h2>
<div class="chartbox"><canvas id="trend" height="110"></canvas></div>

<div class="grid2">
  <div>
    <h2>Occasioni — pos. 4-20</h2>
    <div class="chartbox"><canvas id="opp" height="220"></canvas></div>
  </div>
  <div>
    <h2>Dove sei in classifica</h2>
    <div class="chartbox"><canvas id="buckets" height="220"></canvas></div>
  </div>
</div>
<div class="note">Le "occasioni" sono query dove sei già visibile ma non in cima (fondo prima pagina o seconda): migliorarle porta click più in fretta che inseguire query nuove.</div>

<h2>Occasioni da spremere (dettaglio)</h2>
<table>__TH__
__OPP_ROWS__
</table>

<h2>Top query organiche per click</h2>
<table>__TH__
__Q_ROWS__
</table>

<h2>Query di brand (chi ti cerca per nome)</h2>
<table>__TH__
__BRAND_ROWS__
</table>

<h2>Pagine che portano traffico organico</h2>
<table>__THP__
__P_ROWS__
</table>

<div class="sub" style="margin-top:34px">Generato da gsc_audit.py · le pagine SEO nuove (giugno 2026) non compaiono ancora: l'organico le indicizza in qualche settimana.</div>

<script>
const VIOLA='#664CCD', ARANCIO='#FE6F3A';
const dates=__DATES__, impr=__IMPR_SERIES__, clicks=__CLICKS_SERIES__;
const oppLabels=__OPP_LABELS__, oppVals=__OPP_VALUES__, buckets=__BUCKETS__;
new Chart(document.getElementById('trend'),{type:'line',
 data:{labels:dates,datasets:[
  {label:'Impression',data:impr,borderColor:VIOLA,backgroundColor:'rgba(102,76,205,.08)',fill:true,tension:.3,yAxisID:'y'},
  {label:'Click',data:clicks,borderColor:ARANCIO,backgroundColor:'rgba(254,111,58,.1)',fill:true,tension:.3,yAxisID:'y1'}]},
 options:{responsive:true,interaction:{mode:'index',intersect:false},
  scales:{y:{position:'left',title:{display:true,text:'Impression'}},
          y1:{position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'Click'}}}}});
new Chart(document.getElementById('opp'),{type:'bar',
 data:{labels:oppLabels,datasets:[{label:'Impression',data:oppVals,backgroundColor:ARANCIO}]},
 options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{title:{display:true,text:'Impression'}}}}});
new Chart(document.getElementById('buckets'),{type:'doughnut',
 data:{labels:['Pos 1-3','Pos 4-10','Pos 11-20','Pos 21+'],
   datasets:[{data:buckets,backgroundColor:['#2D8F4E','#FE6F3A','#E6A817','#C9C6CE']}]},
 options:{plugins:{legend:{position:'bottom'}}}});
</script>
</body></html>"""

    repl = {
        "__START__": ctx["start"], "__END__": ctx["end"],
        "__CLICKS__": f"{t['clicks']:.0f}", "__IMPR__": f"{t['impressions']:.0f}",
        "__CTR__": pct(t["ctr"]), "__POS__": f"{t['position']:.1f}", "__NQ__": str(t["nqueries"]),
        "__TH__": th, "__THP__": thp,
        "__OPP_ROWS__": _qrows(ctx["opportunities"]),
        "__Q_ROWS__": _qrows(ctx["queries"]),
        "__BRAND_ROWS__": _qrows(ctx["brand_queries"]),
        "__P_ROWS__": _prows(ctx["pages"]),
        "__DATES__": json.dumps(ctx["dates"]),
        "__IMPR_SERIES__": json.dumps(ctx["impr_series"]),
        "__CLICKS_SERIES__": json.dumps(ctx["clicks_series"]),
        "__OPP_LABELS__": json.dumps(ctx["opp_labels"]),
        "__OPP_VALUES__": json.dumps(ctx["opp_values"]),
        "__BUCKETS__": json.dumps(ctx["buckets"]),
    }
    html = template
    for k, v in repl.items():
        html = html.replace(k, v)
    return html


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    end = datetime.date.today() - datetime.timedelta(days=3)  # GSC ha ~2-3gg di lag
    start = end - datetime.timedelta(days=days)
    start_s, end_s = start.isoformat(), end.isoformat()

    svc, site = _service()
    q_rows = fetch(svc, site, start_s, end_s, ["query"])
    p_rows = fetch(svc, site, start_s, end_s, ["page"])
    d_rows = fetch(svc, site, start_s, end_s, ["date"])

    tot_clicks = sum(r["clicks"] for r in q_rows)
    tot_impr = sum(r["impressions"] for r in q_rows)
    avg_pos = (sum(r["position"] * r["impressions"] for r in q_rows) / tot_impr) if tot_impr else 0
    totals = {
        "clicks": tot_clicks, "impressions": tot_impr,
        "ctr": (tot_clicks / tot_impr) if tot_impr else 0,
        "position": avg_pos, "nqueries": len(q_rows),
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

    # serie temporale per il grafico trend
    d_rows.sort(key=lambda r: r["keys"][0])
    dates = [r["keys"][0][5:] for r in d_rows]  # MM-DD
    impr_series = [round(r["impressions"]) for r in d_rows]
    clicks_series = [round(r["clicks"]) for r in d_rows]

    # barre occasioni (top 10, etichetta accorciata)
    opp_top = opportunities[:10]
    opp_labels = [(r["keys"][0][:42] + "…") if len(r["keys"][0]) > 43 else r["keys"][0] for r in opp_top]
    opp_values = [round(r["impressions"]) for r in opp_top]

    # distribuzione posizioni (conteggio query per fascia)
    buckets = [
        sum(1 for r in q_rows if r["position"] <= 3),
        sum(1 for r in q_rows if 3 < r["position"] <= 10),
        sum(1 for r in q_rows if 10 < r["position"] <= 20),
        sum(1 for r in q_rows if r["position"] > 20),
    ]

    ctx = {
        "start": start_s, "end": end_s, "totals": totals,
        "queries": queries, "pages": pages, "opportunities": opportunities,
        "brand_queries": brand_queries, "dates": dates,
        "impr_series": impr_series, "clicks_series": clicks_series,
        "opp_labels": opp_labels, "opp_values": opp_values, "buckets": buckets,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"audit-organico-gsc-{datetime.date.today().isoformat()}.html"
    out.write_text(build_html(ctx))
    print(f"OK report: {out}")
    print(f"Periodo {start_s} -> {end_s} | click {tot_clicks:.0f} | impr {tot_impr:.0f} | "
          f"CTR {totals['ctr']*100:.1f}% | pos media {avg_pos:.1f} | query {len(q_rows)}")


if __name__ == "__main__":
    main()
