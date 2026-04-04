import re
import json
import anthropic

COPY_PROMPT = """\
Sei un esperto di Google Ads per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).

Genera copy RSA per il gruppo annunci:
Landing slug: {landing_slug}
HeroTitle: {hero_title}
Keywords principali: {keywords}

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{
  "headlines": ["max 30 char", ...],
  "descriptions": ["max 90 char", ...]
}}

Regole headline (ESATTAMENTE 12, max 30 caratteri ciascuna):
- Varietà semantica (evita parole ripetute)
- Includi keyword in 2-3 headline
- Mix benefici, urgency, domande, CTA breve

Regole description (ESATTAMENTE 4, max 90 caratteri ciascuna):
- Ogni description autonoma come messaggio
- CTA esplicita in 2 description
"""


def parse_copy_response(raw: str) -> dict:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)


def validate_rsa_copy(copy: dict) -> None:
    headlines = copy.get("headlines", [])
    descriptions = copy.get("descriptions", [])
    if len(headlines) < 10:
        raise ValueError(f"Servono almeno 10 headline, trovate: {len(headlines)}")
    if len(headlines) > 15:
        raise ValueError(f"Max 15 headline, trovate: {len(headlines)}")
    if len(descriptions) != 4:
        raise ValueError(f"Servono esattamente 4 description, trovate: {len(descriptions)}")
    for h in headlines:
        if len(h) > 30:
            raise ValueError(f"Headline troppo lunga ({len(h)} char): '{h}'")
    for d in descriptions:
        if len(d) > 90:
            raise ValueError(f"Description troppo lunga ({len(d)} char): '{d}'")


def generate_rsa_copy(landing_slug: str, hero_title: str, keywords: list[str], api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": COPY_PROMPT.format(
                landing_slug=landing_slug,
                hero_title=hero_title,
                keywords=", ".join(keywords[:5]),
            ),
        }],
    )
    copy = parse_copy_response(message.content[0].text)
    validate_rsa_copy(copy)
    return copy
