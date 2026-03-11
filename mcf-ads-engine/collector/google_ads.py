from google.ads.googleads.client import GoogleAdsClient

GAQL = """
SELECT
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.resource_name,
  campaign.name,
  ad_group.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM keyword_view
WHERE segments.date DURING LAST_30_DAYS
  AND ad_group_criterion.status = 'ENABLED'
  AND campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
"""
# NOTE: quality_score non è compatibile con segments.date su keyword_view.
# Richiederebbe una query separata senza segmentazione per data.


def parse_gaql_row(row: dict) -> dict:
    """Converte una riga raw GAQL in un dizionario keyword pulito."""
    clicks = row["clicks"]
    impressions = row["impressions"]
    cost = row["cost_micros"] / 1_000_000
    return {
        "keyword": row["keyword"],
        "match_type": row["match_type"],
        "campaign": row["campaign"],
        "ad_group": row["ad_group"],
        "impressions": impressions,
        "clicks": clicks,
        "cost": round(cost, 4),
        "conversions": row["conversions"],
        "cpc": round(cost / clicks, 4) if clicks > 0 else 0.0,
        "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
        "resource_name": row.get("resource_name", ""),
    }


def fetch_keyword_performance(customer_id: str, yaml_path: str = "google-ads.yaml") -> list[dict]:
    """Scarica le performance keyword degli ultimi 30 giorni da Google Ads API."""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=GAQL)

    keywords = []
    for api_row in response:
        kw = api_row.ad_group_criterion.keyword
        m = api_row.metrics
        raw = {
            "keyword": kw.text,
            "match_type": kw.match_type.name,  # proto enum → stringa es. "PHRASE"
            "resource_name": api_row.ad_group_criterion.resource_name,
            "campaign": api_row.campaign.name,
            "ad_group": api_row.ad_group.name,
            "impressions": m.impressions,
            "clicks": m.clicks,
            "cost_micros": m.cost_micros,
            "conversions": m.conversions,
        }
        keywords.append(parse_gaql_row(raw))
    return keywords


DAILY_GAQL = """
SELECT
  campaign.name,
  segments.date,
  metrics.cost_micros,
  metrics.clicks,
  metrics.impressions,
  metrics.conversions
FROM campaign
WHERE segments.date DURING LAST_8_DAYS
  AND campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
ORDER BY segments.date ASC
"""


def fetch_daily_metrics(customer_id: str, yaml_path: str = "google-ads.yaml") -> list:
    """Scarica 8 giorni di dati giornalieri per campagna per il rilevamento anomalie."""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=DAILY_GAQL)

    rows = []
    for api_row in response:
        m = api_row.metrics
        cost = m.cost_micros / 1_000_000
        clicks = m.clicks
        impressions = m.impressions
        rows.append({
            "campaign": api_row.campaign.name,
            "date": api_row.segments.date,
            "cost": round(cost, 4),
            "clicks": clicks,
            "impressions": impressions,
            "conversions": m.conversions,
            "cpc": round(cost / clicks, 4) if clicks > 0 else 0.0,
            "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
        })
    return rows
