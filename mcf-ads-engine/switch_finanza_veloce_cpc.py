#!/usr/bin/env python3
"""
Switcha FInanza Veloce da MAXIMIZE_CONVERSIONS a MANUAL_CPC
e imposta CPC per keyword basati sulle performance 30gg.

Logica di assegnazione CPC:
  Tier 1 — €2.50  conversioni >= 5
  Tier 2 — €2.00  conversioni 1-4
  Tier 3 — €1.80  CTR > 30% ma 0 conv
  Tier 4 — €1.50  impressioni > 0, CTR ok
  Tier 5 — €1.00  impressioni = 0 (keyword di copertura)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import yaml
from google.ads.googleads.client import GoogleAdsClient
from writer.google_ads import switch_campaign_bidding, update_keyword_bid

CAMPAIGN_NAME = "FInanza Veloce"


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


def fetch_keywords(customer_id: str, campaign_name: str,
                   yaml_path: str = "google-ads.yaml") -> list:
    """Fetch keyword attive + paused con performance 30gg."""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    svc = client.get_service("GoogleAdsService")
    rows = list(svc.search(customer_id=customer_id, query="""
SELECT
  ad_group_criterion.resource_name,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.status,
  campaign.name,
  ad_group.name,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.cost_micros
FROM keyword_view
WHERE campaign.name = 'FInanza Veloce'
  AND campaign.status = 'ENABLED'
  AND ad_group_criterion.status != 'REMOVED'
  AND ad_group_criterion.negative = FALSE
  AND segments.date DURING LAST_30_DAYS
"""))
    kw_map = {}
    for r in rows:
        rn = r.ad_group_criterion.resource_name
        if rn not in kw_map:
            kw_map[rn] = {
                "resource_name": rn,
                "text": r.ad_group_criterion.keyword.text,
                "match_type": r.ad_group_criterion.keyword.match_type.name,
                "status": r.ad_group_criterion.status.name,
                "ad_group": r.ad_group.name,
                "impressions": 0, "clicks": 0, "conversions": 0.0, "cost": 0.0,
            }
        m = r.metrics
        kw_map[rn]["impressions"] += m.impressions
        kw_map[rn]["clicks"] += m.clicks
        kw_map[rn]["conversions"] += m.conversions
        kw_map[rn]["cost"] += m.cost_micros / 1e6
    # Includi keyword a 0 impressioni (non appaiono nella keyword_view LAST_30_DAYS)
    # aggiungile dalla criteria_view
    rows2 = list(svc.search(customer_id=customer_id, query="""
SELECT
  ad_group_criterion.resource_name,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.status,
  ad_group.name
FROM ad_group_criterion
WHERE campaign.name = 'FInanza Veloce'
  AND campaign.status = 'ENABLED'
  AND ad_group_criterion.status != 'REMOVED'
  AND ad_group_criterion.type = 'KEYWORD'
  AND ad_group_criterion.negative = FALSE
"""))
    for r in rows2:
        rn = r.ad_group_criterion.resource_name
        if rn not in kw_map:
            kw_map[rn] = {
                "resource_name": rn,
                "text": r.ad_group_criterion.keyword.text,
                "match_type": r.ad_group_criterion.keyword.match_type.name,
                "status": r.ad_group_criterion.status.name,
                "ad_group": r.ad_group.name,
                "impressions": 0, "clicks": 0, "conversions": 0.0, "cost": 0.0,
            }
    return list(kw_map.values())


def assign_cpc(kw: dict) -> float:
    conv = kw["conversions"]
    impr = kw["impressions"]
    clicks = kw["clicks"]
    ctr = clicks / impr if impr > 0 else 0.0
    if conv >= 5:
        return 2.50
    if conv >= 1:
        return 2.00
    if ctr > 0.30 and impr > 0:
        return 1.80
    if impr > 0:
        return 1.50
    return 1.00


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    customer_id = config["google_ads"]["customer_id"]

    print(f"{'[DRY-RUN] ' if args.dry_run else ''}Switch FInanza Veloce → MANUAL_CPC\n")

    # 1. Trova campaign resource_name
    print("[1] Fetch campaign resource_name...")
    campaign_rn = fetch_campaign_resource(customer_id, CAMPAIGN_NAME)
    if not campaign_rn:
        print(f"  [ERROR] Campagna '{CAMPAIGN_NAME}' non trovata")
        sys.exit(1)
    print(f"  {campaign_rn}")

    # 2. Switcha bidding
    print("\n[2] Switch bidding → MANUAL_CPC...")
    if not args.dry_run:
        result = switch_campaign_bidding(customer_id, campaign_rn)
        print(f"  ✓ {result['resource_name']}")
    else:
        print(f"  [DRY-RUN] switch_campaign_bidding({campaign_rn})")

    # 3. Fetch keyword
    print("\n[3] Fetch keyword FInanza Veloce...")
    keywords = fetch_keywords(customer_id, CAMPAIGN_NAME)
    print(f"  {len(keywords)} keyword trovate")

    # 4. Assegna e imposta CPC
    print("\n[4] Impostazione CPC per keyword:")
    tiers = {2.50: [], 2.00: [], 1.80: [], 1.50: [], 1.00: []}
    for kw in sorted(keywords, key=lambda k: -k["conversions"]):
        cpc = assign_cpc(kw)
        tiers[cpc].append(kw)

    errors = 0
    for cpc in [2.50, 2.00, 1.80, 1.50, 1.00]:
        group = tiers[cpc]
        if not group:
            continue
        print(f"\n  === Tier €{cpc:.2f} ({len(group)} kw) ===")
        for kw in group:
            flag = "⏸ " if kw["status"] == "PAUSED" else ""
            conv_str = f" | {kw['conversions']:.0f}conv" if kw["conversions"] > 0 else ""
            print(f"    {flag}\"{kw['text']}\" [{kw['match_type']}] — "
                  f"impr:{kw['impressions']} ctr:{round(kw['clicks']/kw['impressions']*100,1) if kw['impressions'] > 0 else 0}%{conv_str} → €{cpc:.2f}")
            if not args.dry_run:
                try:
                    update_keyword_bid(customer_id, kw["resource_name"], cpc)
                except Exception as e:
                    print(f"      ✗ Errore: {e}")
                    errors += 1

    print(f"\n{'[DRY-RUN] ' if args.dry_run else ''}Completato. Errori: {errors}")
    if args.dry_run:
        print("Riesegui senza --dry-run per applicare.")


if __name__ == "__main__":
    main()
