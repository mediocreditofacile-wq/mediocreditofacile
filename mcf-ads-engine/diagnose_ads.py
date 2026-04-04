#!/usr/bin/env python3
"""
Diagnostica annunci — URL e copy RSA per campagne con policy violations.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import yaml
from google.ads.googleads.client import GoogleAdsClient

CAMPAIGNS_TO_CHECK = [
    "FInanza Veloce",
    "Diventa Partner — Vendor",
]


def fetch_ads(customer_id: str, yaml_path: str = "google-ads.yaml"):
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")

    # Fetch all non-removed ads, filter by campaign in Python to avoid GAQL issues
    # with special chars in campaign names (em dash, etc.)
    query = """
SELECT
  campaign.name,
  ad_group.name,
  ad_group_ad.ad.id,
  ad_group_ad.ad.type,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.final_mobile_urls,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.status,
  ad_group_ad.policy_summary.approval_status,
  ad_group_ad.policy_summary.policy_topic_entries
FROM ad_group_ad
WHERE ad_group_ad.status != 'REMOVED'
  AND campaign.status != 'REMOVED'
  AND campaign.advertising_channel_type = 'SEARCH'
"""
    response = service.search(customer_id=customer_id, query=query)

    ads = []
    for row in response:
        ad = row.ad_group_ad.ad
        rsa = ad.responsive_search_ad
        headlines = []
        descriptions = []
        if rsa and rsa.headlines:
            for h in rsa.headlines:
                try:
                    headlines.append(h.text.value if hasattr(h.text, 'value') else str(h.text))
                except Exception:
                    headlines.append(str(h))
        if rsa and rsa.descriptions:
            for d in rsa.descriptions:
                try:
                    descriptions.append(d.text.value if hasattr(d.text, 'value') else str(d.text))
                except Exception:
                    descriptions.append(str(d))
        policy_topics = [
            e.topic for e in row.ad_group_ad.policy_summary.policy_topic_entries
        ]
        ads.append({
            "campaign": row.campaign.name,
            "ad_group": row.ad_group.name,
            "ad_id": ad.id,
            "type": ad.type_.name,
            "final_urls": list(ad.final_urls),
            "final_mobile_urls": list(ad.final_mobile_urls),
            "headlines": headlines,
            "descriptions": descriptions,
            "status": row.ad_group_ad.status.name,
            "approval_status": row.ad_group_ad.policy_summary.approval_status.name,
            "policy_topics": policy_topics,
        })
    return ads


def main():
    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    customer_id = config["google_ads"]["customer_id"]

    print("=== DIAGNOSTICA ANNUNCI ===\n")
    ads = fetch_ads(customer_id)

    # Raggruppa per campagna/ad group
    for campaign in CAMPAIGNS_TO_CHECK:
        campaign_ads = [a for a in ads if a["campaign"] == campaign]
        print(f"\n{'='*60}")
        print(f"CAMPAGNA: {campaign} ({len(campaign_ads)} annunci)")
        print(f"{'='*60}")

        # Raggruppa per ad group
        ad_groups = {}
        for ad in campaign_ads:
            ag = ad["ad_group"]
            ad_groups.setdefault(ag, []).append(ad)

        for ag_name, ag_ads in ad_groups.items():
            print(f"\n  Ad Group: {ag_name}")
            # Controlla se ci sono URL misti .com/.it nello stesso ad group
            all_urls = []
            for ad in ag_ads:
                all_urls.extend(ad["final_urls"])
            has_com = any(".com" in u for u in all_urls)
            has_it = any(".it" in u for u in all_urls)
            if has_com and has_it:
                print(f"  ⚠️  URL MISTI .com e .it nello stesso ad group!")

            for ad in ag_ads:
                print(f"\n    Ad ID: {ad['ad_id']} [{ad['type']}]")
                print(f"    Status: {ad['status']} | Approval: {ad['approval_status']}")
                print(f"    Final URLs: {ad['final_urls']}")
                if ad['final_mobile_urls']:
                    print(f"    Mobile URLs: {ad['final_mobile_urls']}")
                if ad['policy_topics']:
                    print(f"    ⚠️  Policy violations: {ad['policy_topics']}")
                if ad['headlines']:
                    print(f"    Headlines ({len(ad['headlines'])}):")
                    for i, h in enumerate(ad['headlines']):
                        issues = []
                        if len(h) > 30:
                            issues.append(f"TROPPO LUNGO: {len(h)} chars")
                        special = [c for c in h if ord(c) > 127 and c not in "àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞŸ"]
                        if special:
                            issues.append(f"CARATTERI SPECIALI: {special}")
                        flag = " ← " + ", ".join(issues) if issues else ""
                        print(f"      {i+1:2d}. \"{h}\"{flag}")
                if ad['descriptions']:
                    print(f"    Descriptions ({len(ad['descriptions'])}):")
                    for i, d in enumerate(ad['descriptions']):
                        issues = []
                        if len(d) > 90:
                            issues.append(f"TROPPO LUNGO: {len(d)} chars")
                        special = [c for c in d if ord(c) > 127 and c not in "àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞŸ"]
                        if special:
                            issues.append(f"CARATTERI SPECIALI: {special}")
                        flag = " ← " + ", ".join(issues) if issues else ""
                        print(f"      {i+1:2d}. \"{d}\"{flag}")

    # Riepilogo domini
    print(f"\n\n{'='*60}")
    print("RIEPILOGO URL PER CAMPAGNA:")
    for campaign in CAMPAIGNS_TO_CHECK:
        campaign_ads = [a for a in ads if a["campaign"] == campaign]
        all_urls = []
        for ad in campaign_ads:
            all_urls.extend(ad["final_urls"])
            all_urls.extend(ad["final_mobile_urls"])
        com_urls = [u for u in all_urls if ".com" in u]
        it_urls = [u for u in all_urls if ".it" in u]
        print(f"\n  {campaign}:")
        print(f"    .it URLs: {len(it_urls)}")
        print(f"    .com URLs: {len(com_urls)}")
        if com_urls:
            print(f"    ⚠️  .com ancora presenti:")
            for u in set(com_urls):
                print(f"       {u}")


if __name__ == "__main__":
    main()
