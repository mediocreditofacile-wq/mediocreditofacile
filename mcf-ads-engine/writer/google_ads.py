# mcf-ads-engine/writer/google_ads.py
"""
Operazioni di scrittura verso Google Ads API.
Ogni funzione esegue un singolo mutate e restituisce un dict con i risultati.
"""
from google.ads.googleads.client import GoogleAdsClient
from google.protobuf import field_mask_pb2


def _client(yaml_path: str) -> "GoogleAdsClient":
    return GoogleAdsClient.load_from_storage(yaml_path)


def pause_keyword(customer_id: str, resource_name: str,
                  yaml_path: str = "google-ads.yaml") -> dict:
    """Mette in pausa una keyword via AdGroupCriterionService."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    op.update.resource_name = resource_name
    op.update.status = client.enums.AdGroupCriterionStatusEnum.PAUSED
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["status"]))
    response = service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def enable_keyword(customer_id: str, resource_name: str,
                   yaml_path: str = "google-ads.yaml") -> dict:
    """Riattiva una keyword messa in pausa."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    op.update.resource_name = resource_name
    op.update.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["status"]))
    response = service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def add_negative_keyword(customer_id: str, ad_group_resource_name: str,
                         keyword_text: str, match_type: str = "PHRASE",
                         yaml_path: str = "google-ads.yaml") -> dict:
    """Aggiunge una negative keyword a un ad group."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    criterion = op.create
    criterion.ad_group = ad_group_resource_name
    criterion.negative = True
    criterion.keyword.text = keyword_text
    match_enum = client.enums.KeywordMatchTypeEnum
    criterion.keyword.match_type = getattr(match_enum, match_type)
    response = service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def update_campaign_budget(customer_id: str, campaign_budget_resource_name: str,
                           new_daily_budget_euros: float,
                           yaml_path: str = "google-ads.yaml") -> dict:
    """Aggiorna il budget giornaliero di una campagna."""
    client = _client(yaml_path)
    service = client.get_service("CampaignBudgetService")
    op = client.get_type("CampaignBudgetOperation")
    op.update.resource_name = campaign_budget_resource_name
    op.update.amount_micros = int(new_daily_budget_euros * 1_000_000)
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["amount_micros"]))
    response = service.mutate_campaign_budgets(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def update_keyword_bid(customer_id: str, resource_name: str,
                       new_cpc_euros: float,
                       yaml_path: str = "google-ads.yaml") -> dict:
    """Imposta un nuovo CPC bid manuale su una keyword."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    op.update.resource_name = resource_name
    op.update.cpc_bid_micros = int(new_cpc_euros * 1_000_000)
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["cpc_bid_micros"]))
    response = service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def update_keyword_final_url(customer_id: str, resource_name: str,
                             new_url: str,
                             yaml_path: str = "google-ads.yaml") -> dict:
    """Cambia l'URL di destinazione di una keyword."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    op.update.resource_name = resource_name
    op.update.final_urls.append(new_url)
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["final_urls"]))
    response = service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def switch_campaign_bidding(customer_id: str, campaign_resource_name: str,
                            strategy: str = "MANUAL_CPC",
                            yaml_path: str = "google-ads.yaml") -> dict:
    """
    Cambia la strategia di bidding di una campagna.
    strategy: "MANUAL_CPC" (supportato; altri valori non implementati)
    """
    client = _client(yaml_path)
    service = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    op.update.resource_name = campaign_resource_name
    op.update.manual_cpc.enhanced_cpc_enabled = False
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["manual_cpc.enhanced_cpc_enabled"]))
    response = service.mutate_campaigns(customer_id=customer_id, operations=[op])
    return {"resource_name": response.results[0].resource_name}


def find_budget_by_name(customer_id: str, budget_name: str,
                        yaml_path: str = "google-ads.yaml") -> str:
    """Cerca un campaign budget per nome e restituisce il resource_name, o '' se non trovato."""
    client = _client(yaml_path)
    service = client.get_service("GoogleAdsService")
    query = """
SELECT campaign_budget.resource_name, campaign_budget.name
FROM campaign_budget
WHERE campaign_budget.name = '%s'
  AND campaign_budget.status = 'ENABLED'
""" % budget_name
    response = service.search(customer_id=customer_id, query=query)
    for row in response:
        return row.campaign_budget.resource_name
    return ""


def create_campaign(customer_id: str, campaign_name: str,
                    daily_budget_euros: float,
                    network_settings: dict = None,
                    yaml_path: str = "google-ads.yaml") -> dict:
    """
    Crea un budget campagna e poi la campagna Search.
    Restituisce campaign_resource_name e campaign_budget_resource_name.
    """
    client = _client(yaml_path)

    # Step 1: crea budget (o riusa quello esistente se il nome è già presente)
    budget_name = "%s Budget" % campaign_name
    budget_resource_name = find_budget_by_name(customer_id, budget_name, yaml_path)
    if not budget_resource_name:
        budget_service = client.get_service("CampaignBudgetService")
        budget_op = client.get_type("CampaignBudgetOperation")
        budget_op.create.name = budget_name
        budget_op.create.amount_micros = int(daily_budget_euros * 1_000_000)
        budget_op.create.delivery_method = (
            client.enums.BudgetDeliveryMethodEnum.STANDARD
        )
        budget_response = budget_service.mutate_campaign_budgets(
            customer_id=customer_id, operations=[budget_op]
        )
        budget_resource_name = budget_response.results[0].resource_name

    # Step 2: crea campagna
    campaign_service = client.get_service("CampaignService")
    campaign_op = client.get_type("CampaignOperation")
    campaign = campaign_op.create
    campaign.name = campaign_name
    campaign.advertising_channel_type = (
        client.enums.AdvertisingChannelTypeEnum.SEARCH
    )
    campaign.status = client.enums.CampaignStatusEnum.PAUSED  # sicurezza: parte paused
    campaign.campaign_budget = budget_resource_name
    campaign.network_settings.target_google_search = True
    campaign.network_settings.target_search_network = True
    # Bidding strategy: Manual CPC (massimo controllo, si può cambiare dopo)
    campaign.manual_cpc.enhanced_cpc_enabled = False
    # Campo obbligatorio per account UE
    campaign.contains_eu_political_advertising = False
    campaign_response = campaign_service.mutate_campaigns(
        customer_id=customer_id, operations=[campaign_op]
    )
    campaign_resource_name = campaign_response.results[0].resource_name

    return {
        "campaign_resource_name": campaign_resource_name,
        "campaign_budget_resource_name": budget_resource_name,
    }


def create_ad_group(customer_id: str, campaign_resource_name: str,
                    ad_group_name: str, cpc_bid_micros: int = 1_200_000,
                    yaml_path: str = "google-ads.yaml") -> dict:
    """Crea un ad group in una campagna esistente."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupService")
    op = client.get_type("AdGroupOperation")
    ag = op.create
    ag.name = ad_group_name
    ag.campaign = campaign_resource_name
    ag.status = client.enums.AdGroupStatusEnum.ENABLED
    ag.cpc_bid_micros = cpc_bid_micros
    response = service.mutate_ad_groups(customer_id=customer_id, operations=[op])
    return {"ad_group_resource_name": response.results[0].resource_name}


def add_positive_keyword(customer_id: str, ad_group_resource_name: str,
                         keyword_text: str, match_type: str = "PHRASE",
                         cpc_bid_micros: int = None,
                         yaml_path: str = "google-ads.yaml") -> dict:
    """Aggiunge una keyword positiva a un ad group."""
    client = _client(yaml_path)
    service = client.get_service("AdGroupCriterionService")
    op = client.get_type("AdGroupCriterionOperation")
    criterion = op.create
    criterion.ad_group = ad_group_resource_name
    criterion.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
    criterion.keyword.text = keyword_text
    match_enum = client.enums.KeywordMatchTypeEnum
    criterion.keyword.match_type = getattr(match_enum, match_type)
    if cpc_bid_micros is not None:
        criterion.cpc_bid_micros = cpc_bid_micros
    response = service.mutate_ad_group_criteria(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}


def create_rsa(customer_id: str, ad_group_resource_name: str,
               final_url: str, headlines: list, descriptions: list,
               yaml_path: str = "google-ads.yaml") -> dict:
    """
    Crea un Responsive Search Ad (RSA) in un ad group.
    headlines: lista di str (max 15, max 30 car ciascuno)
    descriptions: lista di str (max 4, max 90 car ciascuno)
    """
    client = _client(yaml_path)
    service = client.get_service("AdGroupAdService")
    op = client.get_type("AdGroupAdOperation")
    ad_group_ad = op.create
    ad_group_ad.ad_group = ad_group_resource_name
    ad_group_ad.status = client.enums.AdGroupAdStatusEnum.ENABLED

    ad = ad_group_ad.ad
    ad.final_urls.append(final_url)

    rsa = ad.responsive_search_ad
    for text in headlines:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        rsa.headlines.append(asset)
    for text in descriptions:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        rsa.descriptions.append(asset)

    response = service.mutate_ad_group_ads(
        customer_id=customer_id, operations=[op]
    )
    return {"resource_name": response.results[0].resource_name}
