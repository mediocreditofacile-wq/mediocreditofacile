#!/usr/bin/env python3
"""
Audit completo campagne attive: ad group, keyword, negative, annunci, sitelink, callout.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import yaml
from google.ads.googleads.client import GoogleAdsClient


def run_query(service, customer_id, query):
    return list(service.search(customer_id=customer_id, query=query))


def main():
    with open("config.yaml") as f:
        config = yaml.safe_load(f)
    customer_id = config["google_ads"]["customer_id"]

    client = GoogleAdsClient.load_from_storage("google-ads.yaml")
    svc = client.get_service("GoogleAdsService")

    # ── 1. Campagne attive ────────────────────────────────────────────────────
    campaigns_rows = run_query(svc, customer_id, """
SELECT
  campaign.id, campaign.name, campaign.status,
  campaign_budget.amount_micros,
  campaign.bidding_strategy_type,
  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
  AND segments.date DURING LAST_30_DAYS
""")
    # aggregate per campaign (LAST_30_DAYS segmenta per giorno)
    cmap = {}
    for r in campaigns_rows:
        cid = r.campaign.id
        if cid not in cmap:
            cmap[cid] = {
                "name": r.campaign.name,
                "budget": round(r.campaign_budget.amount_micros / 1e6, 2),
                "bidding": r.campaign.bidding_strategy_type.name,
                "impressions": 0, "clicks": 0, "cost": 0.0, "conversions": 0.0,
            }
        m = r.metrics
        cmap[cid]["impressions"] += m.impressions
        cmap[cid]["clicks"] += m.clicks
        cmap[cid]["cost"] += m.cost_micros / 1e6
        cmap[cid]["conversions"] += m.conversions

    # ── 2. Ad group con keyword ───────────────────────────────────────────────
    kw_rows = run_query(svc, customer_id, """
SELECT
  campaign.id, campaign.name,
  ad_group.id, ad_group.name, ad_group.status,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.status,
  ad_group_criterion.negative,
  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM keyword_view
WHERE campaign.status = 'ENABLED'
  AND ad_group.status != 'REMOVED'
  AND ad_group_criterion.status != 'REMOVED'
  AND segments.date DURING LAST_30_DAYS
""")
    # {campaign_id: {ag_id: {name, keywords: [], negatives: []}}}
    ag_map = {}
    for r in kw_rows:
        cid = r.campaign.id
        agid = r.ad_group.id
        if cid not in ag_map:
            ag_map[cid] = {}
        if agid not in ag_map[cid]:
            ag_map[cid][agid] = {
                "name": r.ad_group.name,
                "status": r.ad_group.status.name,
                "keywords": [],
            }
        m = r.metrics
        cost = m.cost_micros / 1e6
        clicks = m.clicks
        impressions = m.impressions
        ag_map[cid][agid]["keywords"].append({
            "text": r.ad_group_criterion.keyword.text,
            "match_type": r.ad_group_criterion.keyword.match_type.name,
            "status": r.ad_group_criterion.status.name,
            "negative": r.ad_group_criterion.negative,
            "impressions": impressions,
            "clicks": clicks,
            "cost": round(cost, 2),
            "conversions": m.conversions,
            "cpc": round(cost / clicks, 2) if clicks > 0 else 0.0,
            "ctr": round(clicks / impressions * 100, 1) if impressions > 0 else 0.0,
        })

    # ── 3. Negative keyword a livello campagna ────────────────────────────────
    neg_rows = run_query(svc, customer_id, """
SELECT
  campaign.id, campaign.name,
  campaign_criterion.keyword.text,
  campaign_criterion.keyword.match_type,
  campaign_criterion.negative
FROM campaign_criterion
WHERE campaign.status = 'ENABLED'
  AND campaign_criterion.negative = TRUE
  AND campaign_criterion.type = 'KEYWORD'
""")
    neg_map = {}  # {campaign_id: [kw]}
    for r in neg_rows:
        cid = r.campaign.id
        neg_map.setdefault(cid, []).append({
            "text": r.campaign_criterion.keyword.text,
            "match": r.campaign_criterion.keyword.match_type.name,
        })

    # ── 4. Annunci con policy + performance ───────────────────────────────────
    ad_rows = run_query(svc, customer_id, """
SELECT
  campaign.id,
  ad_group.id,
  ad_group_ad.ad.id,
  ad_group_ad.ad.type,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.status,
  ad_group_ad.policy_summary.approval_status,
  ad_group_ad.policy_summary.policy_topic_entries,
  ad_group_ad.ad_strength
FROM ad_group_ad
WHERE campaign.status = 'ENABLED'
  AND ad_group_ad.status != 'REMOVED'
""")
    ad_perf_rows = run_query(svc, customer_id, """
SELECT
  campaign.id, ad_group.id, ad_group_ad.ad.id,
  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM ad_group_ad
WHERE campaign.status = 'ENABLED'
  AND ad_group_ad.status != 'REMOVED'
  AND segments.date DURING LAST_30_DAYS
""")
    # aggregate perf per ad_id
    ad_perf = {}
    for r in ad_perf_rows:
        aid = r.ad_group_ad.ad.id
        if aid not in ad_perf:
            ad_perf[aid] = {"impressions": 0, "clicks": 0, "cost": 0.0, "conversions": 0.0}
        m = r.metrics
        ad_perf[aid]["impressions"] += m.impressions
        ad_perf[aid]["clicks"] += m.clicks
        ad_perf[aid]["cost"] += m.cost_micros / 1e6
        ad_perf[aid]["conversions"] += m.conversions

    ads_map = {}  # {campaign_id: {ag_id: [ad]}}
    for r in ad_rows:
        cid = r.campaign.id
        agid = r.ad_group.id
        ad = r.ad_group_ad.ad
        rsa = ad.responsive_search_ad
        headlines = [h.text for h in rsa.headlines] if rsa and rsa.headlines else []
        descriptions = [d.text for d in rsa.descriptions] if rsa and rsa.descriptions else []
        policy_topics = [e.topic for e in r.ad_group_ad.policy_summary.policy_topic_entries]
        aid = ad.id
        perf = ad_perf.get(aid, {})
        cost = perf.get("cost", 0.0)
        clicks = perf.get("clicks", 0)
        impr = perf.get("impressions", 0)
        ads_map.setdefault(cid, {}).setdefault(agid, []).append({
            "id": aid,
            "type": ad.type_.name,
            "final_urls": list(ad.final_urls),
            "headlines": headlines,
            "descriptions": descriptions,
            "status": r.ad_group_ad.status.name,
            "approval": r.ad_group_ad.policy_summary.approval_status.name,
            "ad_strength": r.ad_group_ad.ad_strength.name,
            "policy_topics": policy_topics,
            "impressions": impr,
            "clicks": clicks,
            "cost": round(cost, 2),
            "conversions": perf.get("conversions", 0.0),
            "ctr": round(clicks / impr * 100, 1) if impr > 0 else 0.0,
        })

    # ── 5. Sitelink + Callout extensions ─────────────────────────────────────
    ext_rows = run_query(svc, customer_id, """
SELECT
  campaign.id, campaign.name, campaign.status,
  campaign_asset.field_type,
  asset.sitelink_asset.link_text,
  asset.sitelink_asset.description1,
  asset.sitelink_asset.description2,
  asset.callout_asset.callout_text
FROM campaign_asset
WHERE campaign.status = 'ENABLED'
  AND campaign_asset.status != 'REMOVED'
  AND campaign_asset.field_type IN ('SITELINK', 'CALLOUT')
""")
    ext_map = {}  # {campaign_id: {sitelinks: [], callouts: [], snippets: []}}
    for r in ext_rows:
        cid = r.campaign.id
        ext_map.setdefault(cid, {"sitelinks": [], "callouts": [], "snippets": []})
        ftype = r.campaign_asset.field_type.name
        asset = r.asset
        if ftype == "SITELINK":
            sl = asset.sitelink_asset
            ext_map[cid]["sitelinks"].append({
                "text": sl.link_text,
                "desc1": sl.description1,
                "desc2": sl.description2,
            })
        elif ftype == "CALLOUT":
            ext_map[cid]["callouts"].append(asset.callout_asset.callout_text)
        elif ftype == "STRUCTURED_SNIPPET":
            ss = asset.structured_snippet_asset
            ext_map[cid]["snippets"].append({
                "header": ss.header,
                "values": list(ss.values),
            })

    # ── STAMPA REPORT ─────────────────────────────────────────────────────────
    for cid, camp in cmap.items():
        ctr = round(camp["clicks"] / camp["impressions"] * 100, 1) if camp["impressions"] > 0 else 0
        cpa = round(camp["cost"] / camp["conversions"], 2) if camp["conversions"] > 0 else 0
        print(f"\n{'═'*70}")
        print(f"CAMPAGNA: {camp['name']}")
        print(f"  Budget: €{camp['budget']}/gg | Bidding: {camp['bidding']}")
        print(f"  30gg → Impr: {camp['impressions']:,} | Click: {camp['clicks']:,} | "
              f"Costo: €{camp['cost']:.2f} | Conv: {camp['conversions']:.0f} | "
              f"CTR: {ctr}% | CPA: €{cpa}")

        # ── Negative campagna ──
        negs = neg_map.get(cid, [])
        if negs:
            print(f"\n  NEGATIVE KEYWORD CAMPAGNA ({len(negs)}):")
            # raggruppa per match type
            for mt in ["EXACT", "PHRASE", "BROAD"]:
                group = [n["text"] for n in negs if n["match"] == mt]
                if group:
                    print(f"    [{mt}] " + ", ".join(sorted(group)))

        # ── Ad Group ──
        ags = ag_map.get(cid, {})
        for agid, ag in ags.items():
            pos_kws = [k for k in ag["keywords"] if not k["negative"]]
            neg_kws = [k for k in ag["keywords"] if k["negative"]]
            print(f"\n  ┌─ AD GROUP: {ag['name']} [{ag['status']}]")

            # Keyword positive con performance
            print(f"  │  KEYWORD ({len(pos_kws)}):")
            for kw in sorted(pos_kws, key=lambda x: -x["cost"]):
                flag = "⏸ " if kw["status"] == "PAUSED" else ""
                conv_str = f" | Conv: {kw['conversions']:.0f}" if kw["conversions"] > 0 else ""
                print(f"  │    {flag}\"{kw['text']}\" [{kw['match_type']}] — "
                      f"Impr: {kw['impressions']:,} | Click: {kw['clicks']} | "
                      f"€{kw['cost']} | CTR: {kw['ctr']}%{conv_str}")

            # Negative ad group
            if neg_kws:
                print(f"  │  NEGATIVE AD GROUP ({len(neg_kws)}):")
                for kw in neg_kws:
                    print(f"  │    [-] \"{kw['text']}\" [{kw['match_type']}]")

            # Annunci
            ag_ads = ads_map.get(cid, {}).get(agid, [])
            print(f"  │  ANNUNCI ({len(ag_ads)}):")
            for ad in ag_ads:
                strength = ad["ad_strength"]
                approval = ad["approval"]
                issues = f" ⚠️ {', '.join(ad['policy_topics'])}" if ad["policy_topics"] else ""
                ctr_ad = f" | CTR: {ad['ctr']}%" if ad["impressions"] > 0 else ""
                conv_ad = f" | Conv: {ad['conversions']:.0f}" if ad["conversions"] > 0 else ""
                print(f"  │    [{ad['type']}] ID:{ad['id']} | {approval} | Strength: {strength}")
                print(f"  │      Impr: {ad['impressions']:,} | Click: {ad['clicks']}{ctr_ad} | "
                      f"€{ad['cost']}{conv_ad}{issues}")
                if ad["final_urls"]:
                    print(f"  │      URL: {ad['final_urls'][0]}")

            print(f"  └{'─'*50}")

        # ── Extensions ──
        exts = ext_map.get(cid, {})
        sitelinks = exts.get("sitelinks", [])
        callouts = exts.get("callouts", [])
        snippets = exts.get("snippets", [])

        if sitelinks:
            print(f"\n  SITELINK ({len(sitelinks)}):")
            for sl in sitelinks:
                desc = f" — {sl['desc1']}" if sl.get("desc1") else ""
                print(f"    • \"{sl['text']}\"{desc}")

        if callouts:
            print(f"\n  CALLOUT ({len(callouts)}):")
            print(f"    " + " | ".join(callouts))

        if snippets:
            print(f"\n  STRUCTURED SNIPPET ({len(snippets)}):")
            for sn in snippets:
                print(f"    [{sn['header']}]: " + ", ".join(sn["values"]))

    print(f"\n{'═'*70}")
    print("Fine audit.")


if __name__ == "__main__":
    main()
