# mcf-ads-engine/tests/test_negatives.py
import csv
import io
from analyzer.negatives import build_negative_proposals, export_to_gade_csv


def make_neg(**kwargs):
    defaults = {
        "search_term": "noleggio auto privati",
        "campaign": "Noleggio Operativo",
        "ad_group": "Generico",
        "category": "Irrelevant",
        "status": "NONE",
        "impressions": 50,
        "clicks": 5,
        "cost": 2.5,
        "conversions": 0,
        "cpc": 0.5,
        "ctr": 0.1,
    }
    return {**defaults, **kwargs}


# --- build_negative_proposals ---

def test_build_negative_proposals_adds_pending_status():
    terms = [make_neg()]
    result = build_negative_proposals(terms)
    assert result[0]["status"] == "pending"


def test_build_negative_proposals_preserves_term_fields():
    terms = [make_neg(search_term="mutuo prima casa pmi", category="Irrelevant")]
    result = build_negative_proposals(terms)
    assert result[0]["search_term"] == "mutuo prima casa pmi"
    assert result[0]["campaign"] == "Noleggio Operativo"
    assert result[0]["category"] == "Irrelevant"


def test_build_negative_proposals_multiple_terms():
    terms = [make_neg(search_term=f"query {i}") for i in range(3)]
    result = build_negative_proposals(terms)
    assert len(result) == 3
    assert all(r["status"] == "pending" for r in result)


def test_build_negative_proposals_empty_input():
    assert build_negative_proposals([]) == []


# --- export_to_gade_csv ---

def test_export_to_gade_csv_contains_header():
    approved = [make_neg(status="approved")]
    csv_str = export_to_gade_csv(approved)
    assert "Campaign" in csv_str
    assert "Ad group" in csv_str
    assert "Keyword" in csv_str
    assert "Match Type" in csv_str


def test_export_to_gade_csv_contains_data():
    approved = [make_neg(
        search_term="noleggio auto privati",
        campaign="Noleggio Operativo",
        ad_group="Generico",
        status="approved",
    )]
    csv_str = export_to_gade_csv(approved)
    assert "noleggio auto privati" in csv_str
    assert "Noleggio Operativo" in csv_str
    assert "Generico" in csv_str


def test_export_to_gade_csv_is_parseable_csv():
    approved = [
        make_neg(search_term="query a", campaign="Camp A", ad_group="AG 1", status="approved"),
        make_neg(search_term="query b", campaign="Camp B", ad_group="AG 2", status="approved"),
    ]
    csv_str = export_to_gade_csv(approved)
    reader = csv.DictReader(io.StringIO(csv_str))
    rows = list(reader)
    assert len(rows) == 2
    assert rows[0]["Keyword"] == "query a"
    assert rows[1]["Campaign"] == "Camp B"


def test_export_to_gade_csv_skips_non_approved():
    terms = [
        make_neg(search_term="approvato", status="approved"),
        make_neg(search_term="rigettato", status="rejected"),
        make_neg(search_term="in attesa", status="pending"),
    ]
    csv_str = export_to_gade_csv(terms)
    reader = csv.DictReader(io.StringIO(csv_str))
    rows = list(reader)
    assert len(rows) == 1
    assert rows[0]["Keyword"] == "approvato"
