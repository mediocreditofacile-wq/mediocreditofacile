# mcf-ads-engine/analyzer/negatives.py
import csv
import io


def build_negative_proposals(negative_terms: list) -> list:
    """
    Costruisce la lista di proposals per la dashboard.
    Ogni entry riceve status='pending' per richiedere approvazione manuale.
    """
    return [{**term, "status": "pending"} for term in negative_terms]


def export_to_gade_csv(terms: list) -> str:
    """
    Esporta i negative keyword approvati in formato Google Ads Editor (CSV).
    Solo i term con status='approved' vengono inclusi.
    Formato colonne: Campaign, Ad group, Keyword, Match Type
    """
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["Campaign", "Ad group", "Keyword", "Match Type"],
        extrasaction="ignore",
    )
    writer.writeheader()
    for term in terms:
        if term.get("status") != "approved":
            continue
        writer.writerow({
            "Campaign": term["campaign"],
            "Ad group": term["ad_group"],
            "Keyword": term["search_term"],
            "Match Type": "Phrase",
        })
    return output.getvalue()
