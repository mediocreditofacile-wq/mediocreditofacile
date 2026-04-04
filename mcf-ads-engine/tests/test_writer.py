# mcf-ads-engine/tests/test_writer.py
from unittest.mock import MagicMock, patch, call
import pytest

from writer.google_ads import (
    pause_keyword,
    add_negative_keyword,
    update_campaign_budget,
    update_keyword_bid,
    update_keyword_final_url,
    create_campaign,
    create_ad_group,
    add_positive_keyword,
    create_rsa,
)

CUSTOMER_ID = "5572178058"
KW_RESOURCE = "customers/5572178058/adGroupCriteria/111~222"
AG_RESOURCE = "customers/5572178058/adGroups/111"
BUDGET_RESOURCE = "customers/5572178058/campaignBudgets/999"


def _make_mock_client():
    client = MagicMock()
    # op.update deve avere un resource_name settabile
    op = MagicMock()
    client.get_type.return_value = op
    return client


def test_pause_keyword_calls_mutate_ad_group_criteria(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    pause_keyword(CUSTOMER_ID, KW_RESOURCE)
    service = mock_client.get_service.return_value
    service.mutate_ad_group_criteria.assert_called_once()


def test_pause_keyword_sets_resource_name_on_criterion(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    pause_keyword(CUSTOMER_ID, KW_RESOURCE)
    op = mock_client.get_type.return_value
    assert op.update.resource_name == KW_RESOURCE


def test_pause_keyword_returns_resource_name(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    service = mock_client.get_service.return_value
    service.mutate_ad_group_criteria.return_value.results = [
        MagicMock(resource_name=KW_RESOURCE)
    ]
    result = pause_keyword(CUSTOMER_ID, KW_RESOURCE)
    assert result["resource_name"] == KW_RESOURCE


def test_add_negative_keyword_calls_mutate(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    add_negative_keyword(CUSTOMER_ID, AG_RESOURCE, "noleggio auto privati")
    service = mock_client.get_service.return_value
    service.mutate_ad_group_criteria.assert_called_once()


def test_add_negative_keyword_sets_negative_flag(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    add_negative_keyword(CUSTOMER_ID, AG_RESOURCE, "noleggio auto privati")
    op = mock_client.get_type.return_value
    assert op.create.negative is True


def test_update_campaign_budget_converts_euros_to_micros(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    update_campaign_budget(CUSTOMER_ID, BUDGET_RESOURCE, 15.0)
    op = mock_client.get_type.return_value
    # 15.0 EUR = 15_000_000 micros
    assert op.update.amount_micros == 15_000_000


def test_update_campaign_budget_calls_mutate(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    update_campaign_budget(CUSTOMER_ID, BUDGET_RESOURCE, 15.0)
    service = mock_client.get_service.return_value
    service.mutate_campaign_budgets.assert_called_once()


def test_update_keyword_bid_converts_euros_to_micros(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    update_keyword_bid(CUSTOMER_ID, KW_RESOURCE, 2.50)
    op = mock_client.get_type.return_value
    # 2.50 EUR = 2_500_000 micros
    assert op.update.cpc_bid_micros == 2_500_000


def test_update_keyword_final_url_sets_url(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    new_url = "https://mediocreditofacile.it/noleggio-operativo"
    update_keyword_final_url(CUSTOMER_ID, KW_RESOURCE, new_url)
    op = mock_client.get_type.return_value
    # final_urls è una lista repeated field
    op.update.final_urls.append.assert_called_with(new_url)


CAMPAIGN_RESOURCE = "customers/5572178058/campaigns/777"


def test_create_ad_group_calls_mutate_ad_groups(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    ag_service = MagicMock()
    ag_service.mutate_ad_groups.return_value.results = [
        MagicMock(resource_name=AG_RESOURCE)
    ]
    mock_client.get_service.return_value = ag_service
    create_ad_group(CUSTOMER_ID, CAMPAIGN_RESOURCE, "Fotovoltaico – Zero Anticipo")
    ag_service.mutate_ad_groups.assert_called_once()


def test_create_ad_group_sets_campaign_on_operation(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    ag_service = MagicMock()
    ag_service.mutate_ad_groups.return_value.results = [
        MagicMock(resource_name=AG_RESOURCE)
    ]
    mock_client.get_service.return_value = ag_service
    create_ad_group(CUSTOMER_ID, CAMPAIGN_RESOURCE, "Fotovoltaico – Zero Anticipo")
    op = mock_client.get_type.return_value
    assert op.create.campaign == CAMPAIGN_RESOURCE


def test_create_ad_group_returns_resource_name(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    ag_service = MagicMock()
    ag_service.mutate_ad_groups.return_value.results = [
        MagicMock(resource_name=AG_RESOURCE)
    ]
    mock_client.get_service.return_value = ag_service
    result = create_ad_group(CUSTOMER_ID, CAMPAIGN_RESOURCE, "Fotovoltaico – Zero Anticipo")
    assert result["ad_group_resource_name"] == AG_RESOURCE


def test_add_positive_keyword_calls_mutate(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    service = mock_client.get_service.return_value
    service.mutate_ad_group_criteria.return_value.results = [
        MagicMock(resource_name=KW_RESOURCE)
    ]
    add_positive_keyword(CUSTOMER_ID, AG_RESOURCE, "noleggio fotovoltaico aziendale")
    service.mutate_ad_group_criteria.assert_called_once()


def test_add_positive_keyword_sets_keyword_text(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    add_positive_keyword(CUSTOMER_ID, AG_RESOURCE, "noleggio fotovoltaico aziendale")
    op = mock_client.get_type.return_value
    assert op.create.keyword.text == "noleggio fotovoltaico aziendale"


def test_add_positive_keyword_is_not_negative(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    add_positive_keyword(CUSTOMER_ID, AG_RESOURCE, "noleggio fotovoltaico aziendale")
    op = mock_client.get_type.return_value
    # negative NON deve essere True per una keyword positiva
    assert op.create.negative is not True


def test_create_rsa_calls_mutate_ad_group_ads(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    ad_service = MagicMock()
    ad_service.mutate_ad_group_ads.return_value.results = [
        MagicMock(resource_name="customers/5572178058/adGroupAds/111~888")
    ]
    mock_client.get_service.return_value = ad_service
    headlines = ["Titolo %d" % i for i in range(15)]
    descriptions = ["Descrizione %d" % i for i in range(4)]
    create_rsa(CUSTOMER_ID, AG_RESOURCE,
               "https://mediocreditofacile.it/noleggio-operativo",
               headlines, descriptions)
    ad_service.mutate_ad_group_ads.assert_called_once()


def test_create_rsa_sets_final_url(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    ad_service = MagicMock()
    ad_service.mutate_ad_group_ads.return_value.results = [
        MagicMock(resource_name="customers/5572178058/adGroupAds/111~888")
    ]
    mock_client.get_service.return_value = ad_service
    url = "https://mediocreditofacile.it/noleggio-operativo"
    headlines = ["T%d" % i for i in range(15)]
    descriptions = ["D%d" % i for i in range(4)]
    create_rsa(CUSTOMER_ID, AG_RESOURCE, url, headlines, descriptions)
    op = mock_client.get_type.return_value
    op.create.ad.final_urls.append.assert_called_with(url)


def test_create_rsa_adds_all_headlines(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    ad_service = MagicMock()
    ad_service.mutate_ad_group_ads.return_value.results = [
        MagicMock(resource_name="customers/5572178058/adGroupAds/111~888")
    ]
    mock_client.get_service.return_value = ad_service
    headlines = ["Titolo %d" % i for i in range(15)]
    descriptions = ["Descrizione %d" % i for i in range(4)]
    create_rsa(CUSTOMER_ID, AG_RESOURCE,
               "https://mediocreditofacile.it/noleggio-operativo",
               headlines, descriptions)
    op = mock_client.get_type.return_value
    rsa = op.create.ad.responsive_search_ad
    # deve aver aggiunto 15 titoli e 4 descrizioni
    assert rsa.headlines.append.call_count == 15
    assert rsa.descriptions.append.call_count == 4


def test_create_campaign_calls_both_budget_and_campaign_mutate(monkeypatch):
    mock_client = _make_mock_client()
    monkeypatch.setattr("writer.google_ads.GoogleAdsClient.load_from_storage",
                        lambda *a, **kw: mock_client)
    # budget mutate deve restituire un resource_name per usarlo nella campagna
    budget_service = MagicMock()
    campaign_service = MagicMock()
    budget_service.mutate_campaign_budgets.return_value.results = [
        MagicMock(resource_name=BUDGET_RESOURCE)
    ]
    campaign_service.mutate_campaigns.return_value.results = [
        MagicMock(resource_name="customers/5572178058/campaigns/777")
    ]

    def get_service_side_effect(name):
        if name == "CampaignBudgetService":
            return budget_service
        if name == "CampaignService":
            return campaign_service
        return MagicMock()

    mock_client.get_service.side_effect = get_service_side_effect
    result = create_campaign(CUSTOMER_ID, "Noleggio Fotovoltaico", 15.0)
    budget_service.mutate_campaign_budgets.assert_called_once()
    campaign_service.mutate_campaigns.assert_called_once()
    assert "campaign_resource_name" in result
