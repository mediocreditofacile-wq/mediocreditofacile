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


def fetch_keyword_performance_period(
    customer_id: str,
    start_date: str,
    end_date: str,
    yaml_path: str = "google-ads.yaml",
) -> list[dict]:
    """Scarica le performance keyword per un periodo specifico (YYYY-MM-DD)."""
    query = f"""
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
WHERE segments.date >= '{start_date}' AND segments.date <= '{end_date}'
  AND ad_group_criterion.status = 'ENABLED'
  AND campaign.status = 'ENABLED'
  AND ad_group.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
"""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=query)
    keywords = []
    for api_row in response:
        kw = api_row.ad_group_criterion.keyword
        m = api_row.metrics
        raw = {
            "keyword": kw.text,
            "match_type": kw.match_type.name,
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


SEARCH_TERM_GAQL_TEMPLATE = """
SELECT
  search_term_view.search_term,
  search_term_view.status,
  campaign.name,
  ad_group.name,
  ad_group.resource_name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM search_term_view
WHERE segments.date >= '{start}' AND segments.date <= '{end}'
  AND campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
  AND metrics.impressions > 0
"""


def parse_search_term_row(row: dict) -> dict:
    """Converte una riga raw GAQL search_term_view in un dizionario pulito."""
    clicks = row["clicks"]
    impressions = row["impressions"]
    cost = row["cost_micros"] / 1_000_000
    return {
        "search_term": row["search_term"],
        "campaign": row["campaign"],
        "ad_group": row["ad_group"],
        "ad_group_resource_name": row.get("ad_group_resource_name", ""),
        "status": row["status"],
        "impressions": impressions,
        "clicks": clicks,
        "cost": round(cost, 4),
        "conversions": row["conversions"],
        "cpc": round(cost / clicks, 4) if clicks > 0 else 0.0,
        "ctr": round(clicks / impressions, 4) if impressions > 0 else 0.0,
    }


def fetch_search_terms(customer_id: str, yaml_path: str = "google-ads.yaml", days: int = 30) -> list[dict]:
    """Scarica i search terms degli ultimi N giorni da Google Ads API."""
    from datetime import date, timedelta
    today = date.today()
    start = today - timedelta(days=days)
    query = SEARCH_TERM_GAQL_TEMPLATE.format(
        start=start.isoformat(),
        end=today.isoformat(),
    )
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=query)

    terms = []
    for api_row in response:
        m = api_row.metrics
        raw = {
            "search_term": api_row.search_term_view.search_term,
            "status": api_row.search_term_view.status.name,
            "campaign": api_row.campaign.name,
            "ad_group": api_row.ad_group.name,
            "ad_group_resource_name": api_row.ad_group.resource_name,
            "impressions": m.impressions,
            "clicks": m.clicks,
            "cost_micros": m.cost_micros,
            "conversions": m.conversions,
        }
        terms.append(parse_search_term_row(raw))
    return terms


def fetch_campaign_budgets(customer_id: str, yaml_path: str = "google-ads.yaml") -> list:
    """Recupera campagne attive con i rispettivi resource_name di budget."""
    query = """
SELECT
  campaign.name,
  campaign.resource_name,
  campaign_budget.resource_name,
  campaign_budget.amount_micros
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
"""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=query)
    campaigns = []
    for api_row in response:
        campaigns.append({
            "campaign": api_row.campaign.name,
            "campaign_resource_name": api_row.campaign.resource_name,
            "campaign_budget_resource_name": api_row.campaign_budget.resource_name,
            "daily_budget_euros": round(api_row.campaign_budget.amount_micros / 1_000_000, 2),
        })
    return campaigns


def fetch_daily_metrics(customer_id: str, yaml_path: str = "google-ads.yaml") -> list:
    """Scarica 8 giorni di dati giornalieri per campagna per il rilevamento anomalie."""
    from datetime import date, timedelta
    today = date.today()
    start = today - timedelta(days=8)
    query = f"""
SELECT
  campaign.name,
  segments.date,
  metrics.cost_micros,
  metrics.clicks,
  metrics.impressions,
  metrics.conversions
FROM campaign
WHERE segments.date >= '{start.isoformat()}' AND segments.date <= '{today.isoformat()}'
  AND campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
ORDER BY segments.date ASC
"""
    client = GoogleAdsClient.load_from_storage(yaml_path)
    service = client.get_service("GoogleAdsService")
    response = service.search(customer_id=customer_id, query=query)

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
