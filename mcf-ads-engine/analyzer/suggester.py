import re
import json
import anthropic

SUGGEST_PROMPT = """\
Sei un esperto SEO/SEM per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).

Keyword attiva con buone performance: "{keyword}"
Campagna: {campaign}

Genera 5 varianti long-tail specifiche per questo business.
Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{"variants": ["stringa", "stringa", "stringa", "stringa", "stringa"]}}

Regole:
- Mantieni l'intento commerciale (non informazionale)
- Target PMI, aziende, imprese (non privati/consumatori)
- Varianti realisticamente cercate su Google Italia
"""


def parse_variants_response(raw: str) -> list[str]:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)["variants"]


def suggest_kw_variants(keyword: str, campaign: str, api_key: str) -> list[str]:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": SUGGEST_PROMPT.format(keyword=keyword, campaign=campaign),
        }],
    )
    return parse_variants_response(message.content[0].text)
