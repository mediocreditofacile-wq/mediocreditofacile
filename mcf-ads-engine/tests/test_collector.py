# mcf-ads-engine/tests/test_collector.py
from collector.google_ads import parse_gaql_row, parse_search_term_row


def test_parse_gaql_row_computes_cpc():
    """CPC = cost / clicks. Cost in micros → euros."""
    fake_row = {
        "keyword": "noleggio operativo pmi",
        "match_type": "PHRASE",
        "campaign": "Noleggio Operativo",
        "ad_group": "Generico",
        "impressions": 100,
        "clicks": 10,
        "cost_micros": 5_000_000,   # €5.00
        "conversions": 1,
    }
    result = parse_gaql_row(fake_row)
    assert result["cost"] == 5.0
    assert result["cpc"] == 0.5
    assert result["ctr"] == 0.1


def test_parse_gaql_row_zero_clicks_no_division_error():
    fake_row = {
        "keyword": "test", "match_type": "BROAD",
        "campaign": "X", "ad_group": "Y",
        "impressions": 50, "clicks": 0,
        "cost_micros": 0, "conversions": 0,
    }
    result = parse_gaql_row(fake_row)
    assert result["cpc"] == 0.0
    assert result["ctr"] == 0.0


def test_parse_search_term_row_computes_cpc_and_ctr():
    """CPC e CTR calcolati correttamente da un search term row."""
    row = {
        "search_term": "noleggio auto privati",
        "campaign": "Noleggio Operativo",
        "ad_group": "Generico",
        "status": "NONE",
        "impressions": 50,
        "clicks": 5,
        "cost_micros": 2_500_000,  # €2.50
        "conversions": 0,
    }
    result = parse_search_term_row(row)
    assert result["search_term"] == "noleggio auto privati"
    assert result["campaign"] == "Noleggio Operativo"
    assert result["ad_group"] == "Generico"
    assert result["status"] == "NONE"
    assert result["cost"] == 2.5
    assert result["cpc"] == 0.5
    assert result["ctr"] == 0.1
    assert result["conversions"] == 0


def test_parse_search_term_row_zero_clicks_no_division_error():
    row = {
        "search_term": "query senza click",
        "campaign": "X", "ad_group": "Y", "status": "NONE",
        "impressions": 100, "clicks": 0,
        "cost_micros": 0, "conversions": 0,
    }
    result = parse_search_term_row(row)
    assert result["cpc"] == 0.0
    assert result["ctr"] == 0.0


def test_parse_search_term_row_includes_ad_group_resource_name():
    """ad_group_resource_name deve essere incluso per poter aggiungere negative keyword via API."""
    row = {
        "search_term": "noleggio auto",
        "campaign": "Noleggio",
        "ad_group": "Generico",
        "ad_group_resource_name": "customers/5572178058/adGroups/123456",
        "status": "NONE",
        "impressions": 10,
        "clicks": 1,
        "cost_micros": 1_000_000,
        "conversions": 0,
    }
    result = parse_search_term_row(row)
    assert result["ad_group_resource_name"] == "customers/5572178058/adGroups/123456"
