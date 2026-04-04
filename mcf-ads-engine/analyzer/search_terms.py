# mcf-ads-engine/analyzer/search_terms.py
import re
import json
import anthropic

CLASSIFY_PROMPT = """\
Sei un esperto SEM per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).
Target: PMI e aziende italiane (NON privati/consumatori).

Classifica i seguenti search term (query reali di utenti) in una di queste categorie:
- Branded: contiene il nome del brand o competitor diretto
- Competitor: concorrenti diretti (altri broker/banche)
- Commercial: intento commerciale B2B pertinente (ottimo)
- Informational: domanda informativa, non pronto all'acquisto
- Irrelevant: fuori target (privati, consumatori, settori non serviti)
- Ambiguous: non classificabile con certezza

Search term da classificare:
{terms_list}

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{"classifications": [{{"search_term": "...", "category": "..."}}, ...]}}
"""


def parse_classifications_response(raw: str) -> list:
    """Parsa la risposta JSON di Claude, gestendo markdown code blocks."""
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)["classifications"]


def _classify_batch(batch: list, client) -> dict:
    """Classifica un batch di search term, restituisce un dict {search_term: category}."""
    terms_list = "\n".join(
        f"- {t['search_term']} (impressioni: {t['impressions']}, costo: €{t['cost']})"
        for t in batch
    )
    prompt = CLASSIFY_PROMPT.format(terms_list=terms_list)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    classifications = parse_classifications_response(message.content[0].text)
    return {c["search_term"]: c["category"] for c in classifications}


def classify_search_terms(terms: list, api_key: str, batch_size: int = 100) -> list:
    """
    Classifica i search term via Claude in 6 categorie.
    Processa in batch per evitare di superare il limite di token.
    Restituisce la lista di terms con il campo 'category' aggiunto.
    """
    if not terms:
        return []

    client = anthropic.Anthropic(api_key=api_key)
    category_map = {}

    for i in range(0, len(terms), batch_size):
        batch = terms[i: i + batch_size]
        batch_map = _classify_batch(batch, client)
        category_map.update(batch_map)

    result = []
    for term in terms:
        term_copy = dict(term)
        term_copy["category"] = category_map.get(term["search_term"], "Ambiguous")
        result.append(term_copy)
    return result


def identify_negatives(classified_terms: list, exclusions: dict) -> list:
    """
    Identifica i search term da negativizzare:
    - category == 'Irrelevant'
    - testo matcha un excluded_term o excluded_sector (case-insensitive)
    - Esclude i term con status 'ADDED' (già aggiunti come keyword positiva)
    """
    excluded_terms = [t.lower() for t in exclusions.get("excluded_terms", [])]
    excluded_sectors = [s.lower() for s in exclusions.get("excluded_sectors", [])]
    all_excluded = excluded_terms + excluded_sectors

    negatives = []
    for term in classified_terms:
        # Salta term già presenti come keyword positiva
        if term.get("status") == "ADDED":
            continue

        term_lower = term["search_term"].lower()
        is_irrelevant = term.get("category") == "Irrelevant"
        matches_exclusion = any(excl in term_lower for excl in all_excluded)

        if is_irrelevant or matches_exclusion:
            negatives.append(term)
    return negatives
