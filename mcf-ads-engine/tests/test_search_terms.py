# mcf-ads-engine/tests/test_search_terms.py
import json
from unittest.mock import MagicMock
from analyzer.search_terms import classify_search_terms, identify_negatives, parse_classifications_response


EXCLUSIONS = {
    "excluded_terms": ["privati", "mutuo prima casa"],
    "excluded_sectors": ["agricoltura"],
}


def make_term(**kwargs):
    defaults = {
        "search_term": "noleggio operativo pmi",
        "campaign": "Noleggio Operativo",
        "ad_group": "Generico",
        "status": "NONE",
        "impressions": 50,
        "clicks": 5,
        "cost": 2.5,
        "conversions": 0,
        "cpc": 0.5,
        "ctr": 0.1,
    }
    return {**defaults, **kwargs}


# --- parse_classifications_response ---

def test_parse_classifications_response_valid_json():
    raw = '{"classifications": [{"search_term": "noleggio auto privati", "category": "Irrelevant"}]}'
    result = parse_classifications_response(raw)
    assert len(result) == 1
    assert result[0]["category"] == "Irrelevant"


def test_parse_classifications_response_strips_markdown():
    raw = '```json\n{"classifications": [{"search_term": "kw test", "category": "Commercial"}]}\n```'
    result = parse_classifications_response(raw)
    assert result[0]["category"] == "Commercial"


# --- classify_search_terms ---

def test_classify_search_terms_adds_category_field(monkeypatch):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=json.dumps({
            "classifications": [
                {"search_term": "noleggio auto privati", "category": "Irrelevant"},
                {"search_term": "noleggio operativo pmi", "category": "Commercial"},
            ]
        }))]
    )
    monkeypatch.setattr("analyzer.search_terms.anthropic.Anthropic", lambda api_key: mock_client)

    terms = [
        make_term(search_term="noleggio auto privati"),
        make_term(search_term="noleggio operativo pmi"),
    ]
    result = classify_search_terms(terms, "fake-key")

    assert len(result) == 2
    assert result[0]["category"] == "Irrelevant"
    assert result[1]["category"] == "Commercial"
    mock_client.messages.create.assert_called_once()


def test_classify_search_terms_preserves_all_fields(monkeypatch):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=json.dumps({
            "classifications": [
                {"search_term": "noleggio operativo pmi", "category": "Commercial"},
            ]
        }))]
    )
    monkeypatch.setattr("analyzer.search_terms.anthropic.Anthropic", lambda api_key: mock_client)

    terms = [make_term(search_term="noleggio operativo pmi", cost=3.0)]
    result = classify_search_terms(terms, "fake-key")

    assert result[0]["cost"] == 3.0
    assert result[0]["campaign"] == "Noleggio Operativo"


def test_classify_search_terms_unknown_term_gets_ambiguous(monkeypatch):
    """Un search term non presente nella risposta AI riceve category=Ambiguous come fallback."""
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text=json.dumps({
            "classifications": []  # AI non restituisce nulla per questo term
        }))]
    )
    monkeypatch.setattr("analyzer.search_terms.anthropic.Anthropic", lambda api_key: mock_client)

    terms = [make_term(search_term="query sconosciuta")]
    result = classify_search_terms(terms, "fake-key")

    assert result[0]["category"] == "Ambiguous"


# --- identify_negatives ---

def test_identify_negatives_flags_irrelevant_category():
    terms = [
        make_term(search_term="noleggio auto privati", category="Irrelevant"),
        make_term(search_term="noleggio operativo pmi", category="Commercial"),
    ]
    result = identify_negatives(terms, EXCLUSIONS)
    assert len(result) == 1
    assert result[0]["search_term"] == "noleggio auto privati"


def test_identify_negatives_flags_excluded_terms_regardless_of_category():
    """Un termine che matcha excluded_terms viene negativizzato anche se classificato Commercial."""
    terms = [
        make_term(search_term="mutuo prima casa pmi", category="Commercial"),
        make_term(search_term="leasing pmi", category="Commercial"),
    ]
    result = identify_negatives(terms, EXCLUSIONS)
    assert len(result) == 1
    assert result[0]["search_term"] == "mutuo prima casa pmi"


def test_identify_negatives_case_insensitive_exclusion():
    terms = [make_term(search_term="Prestiti Privati PMI", category="Commercial")]
    result = identify_negatives(terms, EXCLUSIONS)
    assert len(result) == 1


def test_identify_negatives_skips_already_added_negatives():
    """Search term con status=ADDED (già keyword) non viene proposto come negative."""
    terms = [make_term(search_term="noleggio auto privati", category="Irrelevant", status="ADDED")]
    result = identify_negatives(terms, EXCLUSIONS)
    assert len(result) == 0


def test_identify_negatives_empty_when_all_relevant():
    terms = [
        make_term(search_term="leasing auto aziendale", category="Commercial"),
        make_term(search_term="finanziamento pmi", category="Commercial"),
    ]
    result = identify_negatives(terms, EXCLUSIONS)
    assert result == []
