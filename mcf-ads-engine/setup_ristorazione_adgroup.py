#!/usr/bin/env python3
"""
Crea ad group "Ristorazione HORECA" in FInanza Veloce con:
- 7 keyword specifiche HORECA
- RSA con final_url → /noleggio-operativo-ristorazione

Uso:
  python setup_ristorazione_adgroup.py --dry-run
  python setup_ristorazione_adgroup.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import yaml
from google.ads.googleads.client import GoogleAdsClient
from writer.google_ads import create_ad_group, add_positive_keyword, create_rsa

CAMPAIGN_NAME = "FInanza Veloce"
AD_GROUP_NAME = "Ristorazione HORECA"
LANDING_URL = "https://mediocreditofacile.it/noleggio-operativo-ristorazione"

KEYWORDS = [
    # (testo, match_type, cpc_euros)
    ("leasing attrezzature ristorazione",          "PHRASE", 1.80),  # CTR 39% storico
    ("leasing attrezzature ristorazione",          "EXACT",  1.50),
    ("noleggio operativo attrezzature ristorazione","PHRASE", 1.50),  # CTR 24% storico
    ("finanziamento attrezzature ristorazione",    "PHRASE", 1.00),  # 0 impr, copertura
    ("noleggio operativo attrezzature HORECA",     "EXACT",  1.50),
    ("noleggio operativo attrezzature HORECA",     "PHRASE", 1.50),
    ("noleggio operativo cucine professionali",    "PHRASE", 1.50),
]

HEADLINES = [
    "Attrezzature Ristorazione",
    "Leasing Cucine Professionali",
    "Zero Anticipo per il Locale",
    "Noleggio Operativo HORECA",
    "Forni e Frigo a Canone Fisso",
    "100% Deducibile Fiscalmente",
    "Manutenzione Inclusa",
    "Preventivo Gratuito in 24h",
    "Finanzia la Tua Cucina",
    "Attrezzature per Ristoranti",
    "Canone Fisso Mensile",
    "Mediocredito Facile HORECA",
    "Attrezzature Bar e Pizzeria",
    "Risposta in 48 Ore",
    "Nessun Investimento Iniziale",
]

DESCRIPTIONS = [
    "Forni, frigoriferi e cucine professionali a canone fisso. Zero anticipo, 100% deducibile.",
    "Leasing attrezzature ristorazione: manutenzione inclusa, canone fisso mensile. Per PMI.",
    "Noleggio operativo HORECA: nessun debito in bilancio, nessuna burocrazia. Risposta in 48h.",
    "Finanzia forni, banconi frigo, lavastoviglie e cucine industriali. Preventivo gratuito.",
]


def fetch_campaign_resource(customer_id: str, name: str,
                             yaml_path: str = "google-ads.yaml") -> str:
    client = GoogleAdsClient.load_from_storage(yaml_path)
    svc = client.get_service("GoogleAdsService")
    rows = list(svc.search(customer_id=customer_id, query="""
SELECT campaign.resource_name, campaign.name
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
"""))
    for r in rows:
        if r.campaign.name == name:
            return r.campaign.resource_name
    return ""


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    customer_id = config["google_ads"]["customer_id"]

    prefix = "[DRY-RUN] " if args.dry_run else ""
    print(f"{prefix}Setup Ad Group '{AD_GROUP_NAME}' in '{CAMPAIGN_NAME}'\n")

    # 1. Trova campaign resource_name
    print("[1] Fetch campaign resource_name...")
    campaign_rn = fetch_campaign_resource(customer_id, CAMPAIGN_NAME)
    if not campaign_rn:
        print(f"  [ERROR] Campagna '{CAMPAIGN_NAME}' non trovata")
        sys.exit(1)
    print(f"  {campaign_rn}")

    # 2. Crea ad group
    print(f"\n[2] Crea ad group '{AD_GROUP_NAME}'...")
    if not args.dry_run:
        result = create_ad_group(
            customer_id=customer_id,
            campaign_resource_name=campaign_rn,
            ad_group_name=AD_GROUP_NAME,
            cpc_bid_micros=1_500_000,  # default €1.50
        )
        ag_rn = result["ad_group_resource_name"]
        print(f"  ✓ {ag_rn}")
    else:
        ag_rn = f"customers/{customer_id}/adGroups/DRY_RUN"
        print(f"  [DRY-RUN] create_ad_group({AD_GROUP_NAME}, cpc=€1.50)")

    # 3. Aggiungi keyword
    print(f"\n[3] Aggiungi {len(KEYWORDS)} keyword:")
    for text, match, cpc in KEYWORDS:
        print(f"  [{match}] \"{text}\" → €{cpc:.2f}")
        if not args.dry_run:
            try:
                add_positive_keyword(
                    customer_id=customer_id,
                    ad_group_resource_name=ag_rn,
                    keyword_text=text,
                    match_type=match,
                    cpc_bid_micros=int(cpc * 1_000_000),
                )
                print(f"    ✓")
            except Exception as e:
                print(f"    ✗ {e}")

    # 4. Crea RSA
    print(f"\n[4] Crea RSA ({len(HEADLINES)} headlines, {len(DESCRIPTIONS)} descriptions)...")
    print(f"  final_url: {LANDING_URL}")
    if not args.dry_run:
        try:
            result = create_rsa(
                customer_id=customer_id,
                ad_group_resource_name=ag_rn,
                final_url=LANDING_URL,
                headlines=HEADLINES,
                descriptions=DESCRIPTIONS,
            )
            print(f"  ✓ {result['resource_name']}")
        except Exception as e:
            print(f"  ✗ {e}")
    else:
        for h in HEADLINES:
            print(f"  H: {h} ({len(h)} chars)")
        for d in DESCRIPTIONS:
            print(f"  D: {d} ({len(d)} chars)")

    print(f"\n{prefix}Completato.")
    if args.dry_run:
        print("Riesegui senza --dry-run per applicare.")


if __name__ == "__main__":
    main()
