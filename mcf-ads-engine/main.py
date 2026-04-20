# mcf-ads-engine/main.py
import json
import os
import sys
import yaml
from datetime import date
from pathlib import Path
from dotenv import load_dotenv

from collector.google_ads import fetch_keyword_performance, fetch_daily_metrics, fetch_search_terms, fetch_auction_insights
from analyzer.scorer import score_keywords, load_exclusions
from analyzer.suggester import suggest_kw_variants
from analyzer.anomaly import detect_anomalies
from analyzer.search_terms import classify_search_terms, identify_negatives
from analyzer.negatives import build_negative_proposals
from analyzer.campaign_audit import run_audit
from notifier.email import send_daily_report, send_anomaly_alert, send_weekly_search_terms_report, send_weekly_audit
from utils.claude_md import update_last_run

load_dotenv()


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def build_proposals(scores: dict, date_str: str) -> dict:
    return {
        "date": date_str,
        "to_pause": scores["to_pause"],
        "to_reward": scores["to_reward"],
        "to_review": scores["to_review"],
        "landing_proposals": [],
        "campaign_drafts": [],
    }


def save_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def run_daily():
    config = load_config()
    today = date.today().isoformat()
    api_key = os.environ["ANTHROPIC_API_KEY"]

    print(f"[{today}] Fetching keyword data from Google Ads...")
    try:
        keywords = fetch_keyword_performance(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
        )
    except Exception as e:
        print(f"[ERROR] Google Ads API failed: {e}")
        sys.exit(1)

    save_json(keywords, Path(f"data/raw/{today}.json"))
    print(f"[{today}] {len(keywords)} keywords fetched.")

    # Auction insights — chi compete sulle nostre keyword
    print(f"[{today}] Fetching auction insights...")
    try:
        auction_data = fetch_auction_insights(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
        )
        save_json(auction_data, Path(f"data/raw/{today}_auction.json"))
        print(f"[{today}] {len(auction_data)} auction insight rows fetched.")
    except Exception as e:
        auction_data = []
        print(f"[WARN] Auction insights failed (skipping): {e}")

    exclusions = load_exclusions(config["exclusions"]["file"])
    scores = score_keywords(keywords, config, exclusions)

    print(f"[{today}] Suggesting KW variants for {len(scores['to_reward'])} rewarded KWs...")
    for kw in scores["to_reward"]:
        try:
            kw["suggested_kw_variants"] = suggest_kw_variants(
                kw["keyword"], kw["campaign"], api_key
            )
        except Exception as e:
            print(f"[WARN] Variant suggestion failed for '{kw['keyword']}': {e}")
            kw["suggested_kw_variants"] = []

    proposals = build_proposals(scores, today)
    save_json(proposals, Path(f"data/proposals/{today}.json"))
    print(f"[{today}] Proposals saved.")

    # Anomaly detection — addizionale, non blocca il report normale
    try:
        daily_data = fetch_daily_metrics(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
        )
        anomaly_thresholds = config.get("anomaly", {})
        anomaly_result = detect_anomalies(daily_data, anomaly_thresholds)
        if anomaly_result["account"]["anomalies"] or anomaly_result["campaigns"]:
            send_anomaly_alert(
                result=anomaly_result,
                api_key=os.environ["RESEND_API_KEY"],
                to_email=os.environ["NOTIFICATION_EMAIL"],
                date_str=today,
            )
            print(f"[{today}] Anomaly alert sent.")
        else:
            print(f"[{today}] No anomalies detected.")
    except Exception as e:
        print(f"[WARN] Anomaly check failed (skipping): {e}")

    send_daily_report(
        proposals=proposals,
        api_key=os.environ["RESEND_API_KEY"],
        to_email=os.environ["NOTIFICATION_EMAIL"],
        date_str=today,
    )
    print(f"[{today}] Daily report sent. Done.")

    # Livello 1 auto-detect CLAUDE.md: traccia la data dell'ultimo run riuscito
    try:
        if update_last_run("daily", today):
            print(f"[{today}] CLAUDE.md: campo 'Ultimo run daily' aggiornato.")
    except Exception as e:
        print(f"[WARN] Update CLAUDE.md fallito (non bloccante): {e}")


def run_weekly():
    """Eseguito ogni lunedì: analizza i search term degli ultimi 30 giorni e propone negative keyword."""
    config = load_config()
    today = date.today().isoformat()
    api_key = os.environ["ANTHROPIC_API_KEY"]

    print(f"[{today}] [WEEKLY] Fetching search terms from Google Ads...")
    try:
        terms = fetch_search_terms(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
            days=30,
        )
    except Exception as e:
        print(f"[ERROR] Search terms fetch failed: {e}")
        sys.exit(1)

    print(f"[{today}] [WEEKLY] {len(terms)} search terms fetched. Classifying via Claude...")
    exclusions = load_exclusions(config["exclusions"]["file"])
    try:
        classified = classify_search_terms(terms, api_key)
    except Exception as e:
        print(f"[ERROR] Classification failed: {e}")
        sys.exit(1)

    negative_terms = identify_negatives(classified, exclusions)
    print(f"[{today}] [WEEKLY] {len(negative_terms)} negative keyword candidate trovate.")

    proposals = build_negative_proposals(negative_terms)
    negatives_data = {
        "date": today,
        "negatives": proposals,
        "total_terms_analyzed": len(terms),
    }
    save_json(negatives_data, Path(f"data/negatives/{today}.json"))
    print(f"[{today}] [WEEKLY] Negatives saved.")

    send_weekly_search_terms_report(
        negatives_data=negatives_data,
        api_key=os.environ["RESEND_API_KEY"],
        to_email=os.environ["NOTIFICATION_EMAIL"],
        date_str=today,
    )
    print(f"[{today}] [WEEKLY] Report settimanale search terms inviato.")

    # Campaign audit
    print(f"[{today}] [WEEKLY] Esecuzione campaign audit...")
    try:
        audit_data = run_audit(
            customer_id=config["google_ads"]["customer_id"],
            yaml_path="google-ads.yaml",
        )
        audit_data["date"] = today
        save_json(audit_data, Path(f"data/audits/{today}.json"))
        print(f"[{today}] [WEEKLY] Audit salvato ({len(audit_data['campaigns'])} campagne).")
        send_weekly_audit(
            audit_data=audit_data,
            api_key=os.environ["RESEND_API_KEY"],
            to_email=os.environ["NOTIFICATION_EMAIL"],
            date_str=today,
        )
        print(f"[{today}] [WEEKLY] Audit email inviata. Done.")
    except Exception as e:
        print(f"[WARN] Campaign audit fallito (skipping): {e}")

    # Livello 1 auto-detect CLAUDE.md: traccia la data dell'ultimo run weekly
    try:
        if update_last_run("weekly", today):
            print(f"[{today}] [WEEKLY] CLAUDE.md: campo 'Ultimo run weekly' aggiornato.")
    except Exception as e:
        print(f"[WARN] Update CLAUDE.md fallito (non bloccante): {e}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--weekly", action="store_true", help="Esegui il run settimanale (search terms)")
    args = parser.parse_args()
    if args.weekly:
        run_weekly()
    else:
        run_daily()
