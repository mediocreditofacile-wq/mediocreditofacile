# mcf-ads-engine/generator/campaign.py
from generator.copy import generate_rsa_copy


def build_utm_url(slug: str, campaign_name: str) -> str:
    campaign_param = campaign_name.replace(" ", "_")
    return (
        f"https://mediocreditofacile.it/{slug}"
        f"?utm_source=google"
        f"&utm_medium=cpc"
        f"&utm_campaign={campaign_param}"
        f"&utm_content={slug}"
        f"&utm_term={{keyword}}"
    )


def build_campaign_draft(landing: dict, keywords: list[str], campaign_name: str, copy: dict) -> dict:
    return {
        "campaign_name": campaign_name,
        "ad_group_name": landing["heroTitle"][:50],
        "keywords": keywords,
        "landing_slug": landing["slug"],
        "final_url": build_utm_url(landing["slug"], campaign_name),
        "headlines": copy["headlines"],
        "descriptions": copy["descriptions"],
        "status": "pending",
    }


def generate_campaign_draft(landing: dict, keywords: list[str], campaign_name: str, api_key: str) -> dict:
    copy = generate_rsa_copy(
        landing_slug=landing["slug"],
        hero_title=landing["heroTitle"],
        keywords=keywords,
        api_key=api_key,
    )
    return build_campaign_draft(landing, keywords, campaign_name, copy)
