#!/usr/bin/env python3
"""
Richiede il re-review degli annunci disapprovati via Google Ads API.
Usa AdGroupAdService con l'operazione REQUEST_REVIEW (disponibile dall'API v15+).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import yaml
from google.ads.googleads.client import GoogleAdsClient

CAMPAIGN_IDS = [23533653591, 23543309692]  # FInanza Veloce, Diventa Partner — Vendor


def main():
    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    customer_id = config["google_ads"]["customer_id"]

    client = GoogleAdsClient.load_from_storage("google-ads.yaml")
    ga_service = client.get_service("GoogleAdsService")
    ad_service = client.get_service("AdGroupAdService")

    # Fetch tutti gli annunci disapprovati nelle due campagne
    query = """
SELECT
  ad_group_ad.resource_name,
  ad_group_ad.ad.id,
  ad_group_ad.policy_summary.approval_status,
  campaign.name
FROM ad_group_ad
WHERE campaign.id IN ({})
  AND ad_group_ad.status != 'REMOVED'
  AND ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'
""".format(",".join(str(cid) for cid in CAMPAIGN_IDS))

    rows = list(ga_service.search(customer_id=customer_id, query=query))
    if not rows:
        print("Nessun annuncio disapprovato trovato nelle campagne target.")
        return

    print(f"Trovati {len(rows)} annunci disapprovati. Richiedo re-review...\n")

    ops = []
    for r in rows:
        rn = r.ad_group_ad.resource_name
        print(f"  [{r.campaign.name}] Ad ID {r.ad_group_ad.ad.id} → {rn}")
        op = client.get_type("AdGroupAdOperation")
        op.request_review.resource_name = rn
        ops.append(op)

    response = ad_service.mutate_ad_group_ads(customer_id=customer_id, operations=ops)
    print(f"\n✓ Re-review richiesto per {len(response.results)} annunci.")
    print("Google ricontrollerà entro 24-48h lavorative.")


if __name__ == "__main__":
    main()
