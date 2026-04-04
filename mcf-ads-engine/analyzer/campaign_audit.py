# mcf-ads-engine/analyzer/campaign_audit.py
"""
Audit campagne attive: ad group, keyword, negative, annunci, sitelink, callout.
Restituisce un dict strutturato salvabile come JSON.
"""
from google.ads.googleads.client import GoogleAdsClient


def _search(svc, customer_id: str, query: str) -> list:
    return list(svc.search(customer_id=customer_id, query=query))


def run_audit(customer_id: str, yaml_path: str = "google-ads.yaml") -> dict:
    """
    Esegue l'audit completo e restituisce un dict con la struttura:
    {
      "campaigns": [
        {
          "id": int, "name": str, "budget": float, "bidding": str,
          "impressions": int, "clicks": int, "cost": float, "conversions": float,
          "ctr": float, "cpa": float,
          "negative_keywords": [{"text": str, "match": str}],
          "ad_groups": [
            {
              "id": int, "name": str, "status": str,
              "keywords": [{"text", "match_type", "status", "impressions", "clicks", "cost", "conversions", "ctr"}],
              "negative_keywords": [...],
              "ads": [{"id", "type", "final_urls", "status", "approval", "ad_strength", "policy_topics",
                       "headlines", "descriptions", "impressions", "clicks", "cost", "conversions", "ctr"}],
            }
          ],
          "sitelinks": [{"text": str, "desc1": str}],
          "callouts": [str],
        }
      ]
    }
    """
    client = GoogleAdsClient.load_from_storage(yaml_path)
    svc = client.get_service("GoogleAdsService")

    # ── 1. Campagne attive (aggregate 30gg) ──────────────────────────────────
    cmap = {}
    for r in _search(svc, customer_id, """
SELECT
  campaign.id, campaign.name,
  campaign_budget.amount_micros,
  campaign.bidding_strategy_type,
  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
  AND segments.date DURING LAST_30_DAYS
"""):
        cid = r.campaign.id
        if cid not in cmap:
            cmap[cid] = {
                "id": cid, "name": r.campaign.name,
                "budget": round(r.campaign_budget.amount_micros / 1e6, 2),
                "bidding": r.campaign.bidding_strategy_type.name,
                "impressions": 0, "clicks": 0, "cost": 0.0, "conversions": 0.0,
            }
        m = r.metrics
        cmap[cid]["impressions"] += m.impressions
        cmap[cid]["clicks"] += m.clicks
        cmap[cid]["cost"] += m.cost_micros / 1e6
        cmap[cid]["conversions"] += m.conversions

    for c in cmap.values():
        c["ctr"] = round(c["clicks"] / c["impressions"] * 100, 1) if c["impressions"] > 0 else 0.0
        c["cpa"] = round(c["cost"] / c["conversions"], 2) if c["conversions"] > 0 else 0.0
        c["cost"] = round(c["cost"], 2)
        c["negative_keywords"] = []
        c["ad_groups"] = []
        c["sitelinks"] = []
        c["callouts"] = []

    # ── 2. Ad group + keyword (aggregate 30gg) ───────────────────────────────
    ag_map = {}  # {(cid, agid): {...}}
    for r in _search(svc, customer_id, """
SELECT
  campaign.id, ad_group.id, ad_group.name, ad_group.status,
  ad_group_criterion.resource_name,
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
"""):
        cid = r.campaign.id
        agid = r.ad_group.id
        key = (cid, agid)
        if key not in ag_map:
            ag_map[key] = {
                "id": agid, "name": r.ad_group.name,
                "status": r.ad_group.status.name,
                "keywords": [], "negative_keywords": [],
            }
        m = r.metrics
        cost = m.cost_micros / 1e6
        clicks = m.clicks
        impressions = m.impressions
        ag_map[key]["keywords"].append({
            "resource_name": r.ad_group_criterion.resource_name,
            "text": r.ad_group_criterion.keyword.text,
            "match_type": r.ad_group_criterion.keyword.match_type.name,
            "status": r.ad_group_criterion.status.name,
            "negative": r.ad_group_criterion.negative,
            "impressions": impressions,
            "clicks": clicks,
            "cost": round(cost, 2),
            "conversions": round(m.conversions, 1),
            "ctr": round(clicks / impressions * 100, 1) if impressions > 0 else 0.0,
            "cpc": round(cost / clicks, 2) if clicks > 0 else 0.0,
        })

    # ── 3. Negative keyword campagna ─────────────────────────────────────────
    for r in _search(svc, customer_id, """
SELECT
  campaign.id,
  campaign_criterion.keyword.text,
  campaign_criterion.keyword.match_type
FROM campaign_criterion
WHERE campaign.status = 'ENABLED'
  AND campaign_criterion.negative = TRUE
  AND campaign_criterion.type = 'KEYWORD'
"""):
        cid = r.campaign.id
        if cid in cmap:
            cmap[cid]["negative_keywords"].append({
                "text": r.campaign_criterion.keyword.text,
                "match": r.campaign_criterion.keyword.match_type.name,
            })

    # ── 4. Annunci con performance ───────────────────────────────────────────
    ad_info = {}
    for r in _search(svc, customer_id, """
SELECT
  campaign.id, ad_group.id,
  ad_group_ad.ad.id, ad_group_ad.ad.type,
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
"""):
        ad = r.ad_group_ad.ad
        rsa = ad.responsive_search_ad
        headlines = [h.text for h in rsa.headlines] if rsa and rsa.headlines else []
        descriptions = [d.text for d in rsa.descriptions] if rsa and rsa.descriptions else []
        ad_info[ad.id] = {
            "id": ad.id,
            "cid": r.campaign.id,
            "agid": r.ad_group.id,
            "type": ad.type_.name,
            "final_urls": list(ad.final_urls),
            "headlines": headlines,
            "descriptions": descriptions,
            "status": r.ad_group_ad.status.name,
            "approval": r.ad_group_ad.policy_summary.approval_status.name,
            "ad_strength": r.ad_group_ad.ad_strength.name,
            "policy_topics": [e.topic for e in r.ad_group_ad.policy_summary.policy_topic_entries],
            "impressions": 0, "clicks": 0, "cost": 0.0, "conversions": 0.0, "ctr": 0.0,
        }

    for r in _search(svc, customer_id, """
SELECT
  ad_group_ad.ad.id,
  metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM ad_group_ad
WHERE campaign.status = 'ENABLED'
  AND ad_group_ad.status != 'REMOVED'
  AND segments.date DURING LAST_30_DAYS
"""):
        aid = r.ad_group_ad.ad.id
        if aid not in ad_info:
            continue
        m = r.metrics
        ad_info[aid]["impressions"] += m.impressions
        ad_info[aid]["clicks"] += m.clicks
        ad_info[aid]["cost"] += m.cost_micros / 1e6
        ad_info[aid]["conversions"] += m.conversions

    for a in ad_info.values():
        a["cost"] = round(a["cost"], 2)
        a["ctr"] = round(a["clicks"] / a["impressions"] * 100, 1) if a["impressions"] > 0 else 0.0

    # ── 5. Sitelink + Callout ────────────────────────────────────────────────
    for r in _search(svc, customer_id, """
SELECT
  campaign.id, campaign.status,
  campaign_asset.field_type,
  asset.sitelink_asset.link_text,
  asset.sitelink_asset.description1,
  asset.callout_asset.callout_text
FROM campaign_asset
WHERE campaign.status = 'ENABLED'
  AND campaign_asset.status != 'REMOVED'
  AND campaign_asset.field_type IN ('SITELINK', 'CALLOUT')
"""):
        cid = r.campaign.id
        if cid not in cmap:
            continue
        ftype = r.campaign_asset.field_type.name
        asset = r.asset
        if ftype == "SITELINK":
            sl = asset.sitelink_asset
            cmap[cid]["sitelinks"].append({
                "text": sl.link_text,
                "desc1": sl.description1,
            })
        elif ftype == "CALLOUT":
            cmap[cid]["callouts"].append(asset.callout_asset.callout_text)

    # ── Assembla ad group dentro campagne ────────────────────────────────────
    for (cid, agid), ag in ag_map.items():
        if cid not in cmap:
            continue
        # Separa positive da negative
        pos = [k for k in ag["keywords"] if not k["negative"]]
        neg = [k for k in ag["keywords"] if k["negative"]]
        ag["keywords"] = sorted(pos, key=lambda x: -x["cost"])
        ag["negative_keywords"] = neg
        # Aggiungi annunci
        ag["ads"] = [
            a for a in ad_info.values()
            if a["cid"] == cid and a["agid"] == agid
        ]
        cmap[cid]["ad_groups"].append(ag)

    return {"campaigns": list(cmap.values())}
