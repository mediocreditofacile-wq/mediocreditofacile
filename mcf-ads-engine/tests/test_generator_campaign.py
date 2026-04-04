# mcf-ads-engine/tests/test_generator_campaign.py
from generator.campaign import build_utm_url, build_campaign_draft
from generator.copy import validate_rsa_copy, parse_copy_response
import json


def test_build_utm_url_format():
    url = build_utm_url("fotovoltaico-pmi", "Fotovoltaico Aziendale")
    assert url.startswith("https://mediocreditofacile.it/fotovoltaico-pmi")
    assert "utm_source=google" in url
    assert "utm_medium=cpc" in url
    assert "utm_content=fotovoltaico-pmi" in url
    assert "{keyword}" in url


def test_build_utm_url_spaces_in_campaign_name():
    url = build_utm_url("test-slug", "Noleggio Operativo Angoli")
    assert " " not in url


def test_validate_rsa_copy_passes_valid():
    copy = {
        "headlines": ["H" * 10] * 12,       # 12 headlines, each 10 chars
        "descriptions": ["D" * 80] * 4,     # 4 descriptions, each 80 chars
    }
    validate_rsa_copy(copy)  # should not raise


def test_validate_rsa_copy_fails_too_few_headlines():
    copy = {"headlines": ["H"] * 9, "descriptions": ["D"] * 4}
    try:
        validate_rsa_copy(copy)
        assert False
    except ValueError:
        pass


def test_validate_rsa_copy_fails_headline_too_long():
    copy = {"headlines": ["H" * 31] + ["H"] * 11, "descriptions": ["D"] * 4}
    try:
        validate_rsa_copy(copy)
        assert False
    except ValueError:
        pass


def test_parse_copy_response_strips_markdown():
    data = {"headlines": ["H"] * 12, "descriptions": ["D"] * 4}
    raw = f"```json\n{json.dumps(data)}\n```"
    result = parse_copy_response(raw)
    assert len(result["headlines"]) == 12


def test_build_campaign_draft_structure():
    landing = {"slug": "test-slug", "heroTitle": "Test Title"}
    copy = {"headlines": ["H"] * 12, "descriptions": ["D"] * 4}
    draft = build_campaign_draft(landing, ["kw1", "kw2"], "Test Campaign", copy)
    assert draft["landing_slug"] == "test-slug"
    assert draft["ad_group_name"] == "Test Title"
    assert draft["status"] == "pending"
    assert "utm_source=google" in draft["final_url"]
