"""
Riattiva le keyword messe in pausa per costo_elevato_zero_conversioni
quando il tracking non funzionava.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from google.ads.googleads.client import GoogleAdsClient
from writer.google_ads import enable_keyword

CUSTOMER_ID = "5572178058"
YAML_PATH = "google-ads.yaml"

KEYWORDS_TO_REACTIVATE = [
    "noleggio operativo per aziende",
    "noleggio hardware",
    "noleggio strumentale",
    "noleggio operativo beni strumentali",
]

def fetch_paused_keywords(client, customer_id: str) -> list:
    """Fetch tutte le keyword in pausa con testo e resource_name."""
    service = client.get_service("GoogleAdsService")
    query = """
        SELECT
            ad_group_criterion.resource_name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.status,
            campaign.name,
            ad_group.name
        FROM ad_group_criterion
        WHERE ad_group_criterion.status = 'PAUSED'
          AND ad_group_criterion.type = 'KEYWORD'
          AND campaign.status != 'REMOVED'
    """
    response = service.search(customer_id=customer_id, query=query)
    results = []
    for row in response:
        results.append({
            "resource_name": row.ad_group_criterion.resource_name,
            "keyword": row.ad_group_criterion.keyword.text,
            "match_type": row.ad_group_criterion.keyword.match_type.name,
            "campaign": row.campaign.name,
            "ad_group": row.ad_group.name,
        })
    return results


def run():
    client = GoogleAdsClient.load_from_storage(YAML_PATH)
    print("Fetching keyword in pausa...")
    paused = fetch_paused_keywords(client, CUSTOMER_ID)
    print(f"Trovate {len(paused)} keyword in pausa totali.")

    to_reactivate = [
        kw for kw in paused
        if kw["keyword"].lower() in [k.lower() for k in KEYWORDS_TO_REACTIVATE]
    ]

    if not to_reactivate:
        print("Nessuna keyword trovata tra quelle da riattivare.")
        return

    print(f"\nKeyword da riattivare ({len(to_reactivate)}):")
    for kw in to_reactivate:
        print(f"  - {kw['keyword']} [{kw['match_type']}] | {kw['campaign']} > {kw['ad_group']}")

    print("\nProcedo con la riattivazione...")
    for kw in to_reactivate:
        result = enable_keyword(CUSTOMER_ID, kw["resource_name"], YAML_PATH)
        print(f"  ✓ Riattivata: {kw['keyword']} [{kw['match_type']}]")

    print(f"\nRiattivazione completata. {len(to_reactivate)} keyword abilitate.")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    run()
