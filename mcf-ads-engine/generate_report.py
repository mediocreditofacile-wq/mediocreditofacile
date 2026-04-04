#!/usr/bin/env python3
"""
Genera i report DOCX di analisi Google Ads e li invia via email.
Uso:
  python generate_report.py                  # usa dati 30gg cached + fetch 7gg
  python generate_report.py --no-email       # solo genera i file, non invia
"""
import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))

from collector.google_ads import fetch_keyword_performance_period
from generator.report_docx import build_report


def load_config(path: str = "config.yaml") -> dict:
    import yaml
    with open(path) as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-email", action="store_true", help="Non inviare email, solo genera file")
    args = parser.parse_args()

    config = load_config()
    customer_id = config["google_ads"]["customer_id"]
    today = date.today()
    today_str = today.isoformat()

    output_dir = Path("data/reports")
    output_dir.mkdir(parents=True, exist_ok=True)

    # ---- Carica dati 30gg (già fetchati da run_daily) ----
    raw_path = Path(f"data/raw/{today_str}.json")
    if not raw_path.exists():
        # Cerca il file più recente
        files = sorted(Path("data/raw").glob("*.json"), reverse=True)
        if not files:
            print("[ERROR] Nessun file raw trovato. Esegui prima python main.py")
            sys.exit(1)
        raw_path = files[0]
        today_str = raw_path.stem
        print(f"[INFO] Usando dati del {today_str}")

    with open(raw_path) as f:
        kws_30d = json.load(f)
    print(f"[INFO] Dati 30gg: {len(kws_30d)} keyword da {raw_path}")

    proposals_path = Path(f"data/proposals/{today_str}.json")
    if not proposals_path.exists():
        files = sorted(Path("data/proposals").glob("*.json"), reverse=True)
        proposals_path = files[0] if files else None

    proposals = {}
    if proposals_path and proposals_path.exists():
        with open(proposals_path) as f:
            proposals = json.load(f)
        print(f"[INFO] Proposals caricate da {proposals_path}")

    # ---- Fetch dati 7gg (ultimi 7 giorni) ----
    end_date = today
    start_date = today - timedelta(days=7)
    print(f"[INFO] Fetch dati 7gg ({start_date.isoformat()} → {end_date.isoformat()})...")
    try:
        kws_7d = fetch_keyword_performance_period(
            customer_id=customer_id,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
            yaml_path="google-ads.yaml",
        )
        print(f"[INFO] Dati 7gg: {len(kws_7d)} keyword")
        # Salva per riferimento
        with open(output_dir / f"raw_7d_{today_str}.json", "w") as f:
            json.dump(kws_7d, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARN] Fetch 7gg fallito: {e}. Report generato solo con dati 30gg.")
        kws_7d = []

    # ---- Genera DOCX ----
    output_path = str(output_dir / f"report_{today_str}.docx")
    print(f"[INFO] Generando DOCX...")
    build_report(
        kws_30d=kws_30d,
        kws_7d=kws_7d,
        proposals=proposals,
        date_str=today_str,
        output_path=output_path,
    )
    print(f"[OK] Report salvato: {output_path}")

    # ---- Invia via email ----
    if not args.no_email:
        _send_via_email(output_path, today_str, kws_7d)

    return output_path


def _send_via_email(docx_path: str, date_str: str, kws_7d: list):
    import base64
    import resend

    api_key = os.environ.get("RESEND_API_KEY")
    to_email = os.environ.get("NOTIFICATION_EMAIL")
    if not api_key or not to_email:
        print("[WARN] RESEND_API_KEY o NOTIFICATION_EMAIL non configurati. Email non inviata.")
        return

    with open(docx_path, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode()

    resend.api_key = api_key
    n7 = len(kws_7d)
    body = f"""
<h2>MCF Ads Engine — Report Analisi Google Ads</h2>
<p>In allegato il report DOCX con:</p>
<ul>
  <li>Overview account (ultimi 30 giorni)</li>
  {'<li>Confronto ultima settimana vs 30gg (post-modifiche)</li>' if n7 > 0 else ''}
  <li>Analisi campagne e keyword</li>
  <li>Piano d'azione prioritizzato</li>
</ul>
<p><a href="http://127.0.0.1:5001">→ Apri Dashboard</a></p>
"""

    resend.Emails.send({
        "from": "MCF Ads Engine <noreply@mediocreditofacile.it>",
        "to": [to_email],
        "subject": f"MCF Ads Engine — Report Analisi {date_str}",
        "html": body,
        "attachments": [{
            "filename": f"report_{date_str}.docx",
            "content": content_b64,
        }],
    })
    print(f"[OK] Email inviata a {to_email}")


if __name__ == "__main__":
    main()
