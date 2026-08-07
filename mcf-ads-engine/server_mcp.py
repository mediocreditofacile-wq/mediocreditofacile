#!/usr/bin/env python3
"""
MCP server per mcf-ads-engine.

Espone 8 tool come prima passata:
  Letture (5):
    - mcf_ads_keyword_performance
    - mcf_ads_search_terms
    - mcf_ads_campaign_budgets
    - mcf_ads_auction_insights
    - mcf_ads_daily_metrics
  Report (3):
    - mcf_ads_daily_report   (build only, salva HTML)
    - mcf_ads_weekly_report  (build only, salva HTML)
    - mcf_ads_send_report    (invia via email con allowlist)

Configurazione via env in .claude.json:
  - ANTHROPIC_API_KEY        (per analisi/raccomandazioni)
  - RESEND_API_KEY           (per send_report)
  - GOOGLE_ADS_CUSTOMER_ID   (default 5572178058 da config.yaml)

Transport: stdio (come nano-banana, wapp, mcf-image).
Logging: stderr (stdout e' usato dal transport MCP).
"""

import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Carica .env del progetto (ANTHROPIC_API_KEY, RESEND_API_KEY, NOTIFICATION_EMAIL)
ENGINE_DIR = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    # override=True: sovrascrive eventuali env vars vuote ereditate dalla shell
    # (capita se Claude Code passa ANTHROPIC_API_KEY='' nell'env del server)
    load_dotenv(ENGINE_DIR / ".env", override=True)
except ImportError:
    pass

import yaml

# SDK MCP high-level
from mcp.server.fastmcp import FastMCP

# Moduli engine (gia' verificati funzionanti)
from collector.google_ads import (
    fetch_keyword_performance,
    fetch_search_terms,
    fetch_campaign_budgets,
    fetch_auction_insights,
    fetch_daily_metrics,
)
from analyzer.scorer import score_keywords, load_exclusions
from analyzer.anomaly import detect_anomalies, compute_account_totals
from notifier.email import (
    build_daily_html,
    build_weekly_html,
    build_anomaly_html,
    send_daily_report as _send_daily_report,
)

# ---------- config ----------

logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                    format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("mcf-ads-mcp")

YAML_PATH = str(ENGINE_DIR / "google-ads.yaml")
CONFIG_PATH = ENGINE_DIR / "config.yaml"

with open(CONFIG_PATH) as f:
    _ENGINE_CONFIG = yaml.safe_load(f)

CUSTOMER_ID = os.environ.get(
    "GOOGLE_ADS_CUSTOMER_ID",
    _ENGINE_CONFIG.get("google_ads", {}).get("customer_id", "5572178058"),
)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")

# Allowlist email per send_report (safety guard)
ALLOWED_EMAILS = {
    "mediocreditofacile@gmail.com",
    os.environ.get("NOTIFICATION_EMAIL", "").lower(),
} - {""}

REPORT_DIR = Path("/Users/alberto/Desktop/_AI/output/report")
REPORT_DIR.mkdir(parents=True, exist_ok=True)

EXCLUSIONS_PATH = ENGINE_DIR / _ENGINE_CONFIG.get("exclusions", {}).get(
    "file", "data/exclusions.yaml"
)

mcp = FastMCP("mcf-ads-engine")

log.info(f"Server avviato. customer_id={CUSTOMER_ID}, yaml={YAML_PATH}")


# ---------- helpers ----------

def _today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _load_exclusions_safe() -> dict:
    try:
        return load_exclusions(str(EXCLUSIONS_PATH))
    except Exception as e:
        log.warning(f"Impossibile caricare exclusions: {e}. Procedo senza.")
        return {}


def _build_proposals(scores: dict, date_str: str) -> dict:
    """Replica la logica di main.build_proposals senza dover importare main.py."""
    return {
        "date": date_str,
        "customer_id": CUSTOMER_ID,
        "to_pause": scores.get("to_pause", []),
        "to_review": scores.get("to_review", []),
        "to_reward": scores.get("to_reward", []),
        "totals": {
            "to_pause_count": len(scores.get("to_pause", [])),
            "to_review_count": len(scores.get("to_review", [])),
            "to_reward_count": len(scores.get("to_reward", [])),
        },
    }


# ---------- LETTURE (5) ----------

@mcp.tool()
def mcf_ads_keyword_performance() -> dict:
    """Restituisce la performance delle keyword di Mediocredito Facile su Google Ads negli ultimi 30 giorni.
    Ogni riga contiene: campagna, ad_group, keyword, match_type, impressioni, click, costo, CTR, CPC, conversioni.
    Da usare per: analisi performance keyword, identificare keyword da pausare/premiare, valutare costi.
    """
    log.info("Tool: keyword_performance")
    data = fetch_keyword_performance(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH)
    return {"customer_id": CUSTOMER_ID, "row_count": len(data), "rows": data}


@mcp.tool()
def mcf_ads_search_terms(days: int = 30) -> dict:
    """Restituisce i search terms reali (cosa ha digitato l'utente) ultimi N giorni.
    Default 30 giorni. Massimo consigliato 90.
    Ogni riga contiene: campagna, search_term, impressioni, click, costo, conversioni, keyword matchata.
    Da usare per: identificare termini da escludere come negative, scoprire opportunita' di nuove keyword.
    """
    log.info(f"Tool: search_terms (days={days})")
    days = max(1, min(int(days), 90))
    data = fetch_search_terms(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH, days=days)
    return {"customer_id": CUSTOMER_ID, "days": days, "row_count": len(data), "rows": data}


@mcp.tool()
def mcf_ads_campaign_budgets() -> dict:
    """Restituisce budget e spesa attuale per ogni campagna attiva.
    Ogni riga contiene: campagna, budget_giornaliero, spesa_corrente, lost_impression_share_per_budget,
    lost_impression_share_per_rank.
    Da usare per: verificare campagne sotto-budget (lost IS alto), identificare dove aumentare bid o budget.
    """
    log.info("Tool: campaign_budgets")
    data = fetch_campaign_budgets(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH)
    return {"customer_id": CUSTOMER_ID, "row_count": len(data), "rows": data}


@mcp.tool()
def mcf_ads_auction_insights() -> dict:
    """Restituisce auction insights: chi compete con MCF sulle stesse aste pubblicitarie.
    Ogni riga contiene: dominio_concorrente, impression_share, overlap_rate, position_above_rate, top_of_page_rate.
    Da usare per: valutare il panorama competitivo, identificare nuovi concorrenti, calibrare strategia bid.
    """
    log.info("Tool: auction_insights")
    data = fetch_auction_insights(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH)
    return {"customer_id": CUSTOMER_ID, "row_count": len(data), "rows": data}


@mcp.tool()
def mcf_ads_daily_metrics() -> dict:
    """Restituisce metriche aggregate giornaliere account-wide degli ultimi giorni.
    Ogni riga: data, costo, click, impressioni, conversioni, CPC, CTR per campagna.
    Da usare per: trend andamento account, individuazione picchi/cali, analisi anomalie.
    """
    log.info("Tool: daily_metrics")
    data = fetch_daily_metrics(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH)
    return {"customer_id": CUSTOMER_ID, "row_count": len(data), "rows": data}


# ---------- REPORT (3) ----------

@mcp.tool()
def mcf_ads_daily_report(date_str: Optional[str] = None) -> dict:
    """Genera il report giornaliero HTML di Google Ads (analisi keyword + proposte pausa/review/reward + anomalie).
    Salva il file in ~/Desktop/_AI/output/report/mcf-ads-daily-YYYY-MM-DD.html.
    NON invia email — usa mcf_ads_send_report dopo se vuoi inviarlo.
    Argomenti:
      date_str: data di riferimento YYYY-MM-DD (default: oggi)
    """
    date_str = date_str or _today_str()
    log.info(f"Tool: daily_report (date={date_str})")

    keywords = fetch_keyword_performance(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH)
    daily = fetch_daily_metrics(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH)
    exclusions = _load_exclusions_safe()
    scores = score_keywords(keywords, _ENGINE_CONFIG, exclusions)
    proposals = _build_proposals(scores, date_str)

    # Nota: compute_recommendations richiede auction_insights+budgets+kws_30d (firma diversa
    # da quella attesa). Lo ometto in questa v1, il report base e' gia' completo. Da
    # aggiungere come tool dedicato in v2 se serve.
    html_main = build_daily_html(proposals, date_str, recommendations=None)

    anomalies_section = ""
    try:
        thresholds = _ENGINE_CONFIG.get("anomaly", {})
        anomaly_result = detect_anomalies(daily, thresholds)
        if anomaly_result.get("anomalies"):
            anomalies_section = "<hr><h2>Anomalie</h2>" + build_anomaly_html(anomaly_result, date_str)
    except Exception as e:
        log.warning(f"detect_anomalies fallito (non bloccante): {e}")

    full_html = html_main + anomalies_section
    out_path = REPORT_DIR / f"mcf-ads-daily-{date_str}.html"
    out_path.write_text(full_html, encoding="utf-8")
    log.info(f"Daily report salvato: {out_path}")

    return {
        "report_path": str(out_path),
        "report_url": f"file://{out_path}",
        "date": date_str,
        "totals": proposals.get("totals", {}),
        "anomalies": (
            anomaly_result.get("anomalies", []) if anomalies_section else []
        ),
    }


@mcp.tool()
def mcf_ads_weekly_report(date_str: Optional[str] = None) -> dict:
    """Genera il report settimanale HTML (search terms + proposte negative + ricap performance settimana).
    Salva in ~/Desktop/_AI/output/report/mcf-ads-weekly-YYYY-MM-DD.html.
    NON invia email — usa mcf_ads_send_report dopo se vuoi inviarlo.
    Argomenti:
      date_str: data di riferimento YYYY-MM-DD (default: oggi)
    """
    date_str = date_str or _today_str()
    log.info(f"Tool: weekly_report (date={date_str})")

    search_terms_data = fetch_search_terms(customer_id=CUSTOMER_ID, yaml_path=YAML_PATH, days=7)

    weekly_payload = {
        "date": date_str,
        "customer_id": CUSTOMER_ID,
        "search_terms": search_terms_data,
        "search_term_count": len(search_terms_data),
    }

    html = build_weekly_html(weekly_payload, date_str)
    out_path = REPORT_DIR / f"mcf-ads-weekly-{date_str}.html"
    out_path.write_text(html, encoding="utf-8")
    log.info(f"Weekly report salvato: {out_path}")

    return {
        "report_path": str(out_path),
        "report_url": f"file://{out_path}",
        "date": date_str,
        "search_term_count": len(search_terms_data),
    }


@mcp.tool()
def mcf_ads_send_report(report_path: str, to_email: str, subject: str) -> dict:
    """Invia via email un report HTML gia' generato.
    SAFETY GUARD: l'email destinataria deve essere nella allowlist (default: mediocreditofacile@gmail.com
    e NOTIFICATION_EMAIL da .env). Se non e' in allowlist, si rifiuta e chiede conferma esplicita.
    Argomenti:
      report_path: path completo al file HTML del report
      to_email: indirizzo destinatario
      subject: oggetto email
    """
    log.info(f"Tool: send_report (to={to_email}, subject={subject})")

    if not RESEND_API_KEY:
        return {"sent": False, "error": "RESEND_API_KEY non configurata"}

    to_email_norm = (to_email or "").lower().strip()
    if to_email_norm not in ALLOWED_EMAILS:
        return {
            "sent": False,
            "error": "destinatario non in allowlist",
            "allowlist": sorted(ALLOWED_EMAILS),
            "hint": "Per inviare a indirizzi diversi, aggiungi NOTIFICATION_EMAIL al .env del progetto "
                    "oppure modifica ALLOWED_EMAILS in server_mcp.py.",
        }

    p = Path(report_path)
    if not p.is_file():
        return {"sent": False, "error": f"file non trovato: {report_path}"}

    html_body = p.read_text(encoding="utf-8")

    try:
        import resend
        resend.api_key = RESEND_API_KEY
        result = resend.Emails.send({
            "from": "MCF Ads Engine <onboarding@resend.dev>",
            "to": [to_email_norm],
            "subject": subject,
            "html": html_body,
        })
        email_id = result.get("id") if isinstance(result, dict) else None
        log.info(f"Email inviata. id={email_id}")
        return {"sent": True, "email_id": email_id, "to": to_email_norm}
    except Exception as e:
        log.error(f"Invio email fallito: {e}")
        return {"sent": False, "error": str(e)}


# ---------- main ----------

if __name__ == "__main__":
    log.info("Avvio MCP server (stdio transport)")
    mcp.run(transport="stdio")
