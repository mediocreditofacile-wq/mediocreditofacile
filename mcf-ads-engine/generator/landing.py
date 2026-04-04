import re
import json
import anthropic
from pathlib import Path

LANDING_PROMPT = """\
Sei un esperto di marketing per PMI italiane.
Cliente: Mediocredito Facile (broker: noleggio operativo, leasing, finanziamenti PMI, fotovoltaico aziendale).

Slug già esistenti (NON riutilizzare): {existing_slugs}

Genera una landing page per questa keyword o angolo:
"{input}"

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{
  "slug": "stringa-con-trattini-max-50-char",
  "metaTitle": "max 60 caratteri",
  "metaDescription": "max 155 caratteri",
  "heroTitle": "titolo principale H1",
  "heroSubtitle": "sottotitolo che sviluppa il pain point",
  "ctaText": "testo CTA",
  "benefits": [
    {{"icon": "nome_material_symbol", "title": "max 40 char", "description": "max 120 char"}},
    {{"icon": "nome_material_symbol", "title": "max 40 char", "description": "max 120 char"}},
    {{"icon": "nome_material_symbol", "title": "max 40 char", "description": "max 120 char"}}
  ]
}}

Icone Material Symbols valide: savings, receipt, speed, shield, schedule, eco, verified,
account_balance, home_work, folder, swap_horiz, build, event, update, checklist, hub,
compare_arrows, person, lock, visibility, all_inclusive, date_range.
"""

REQUIRED_KEYS = ["slug", "metaTitle", "metaDescription", "heroTitle", "heroSubtitle", "benefits"]
CHAR_LIMITS = {"metaTitle": 60, "metaDescription": 155}
BENEFIT_LIMITS = {"title": 40, "description": 120}


def parse_landing_response(raw: str) -> dict:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)


def validate_landing(landing: dict) -> None:
    for key in REQUIRED_KEYS:
        if key not in landing:
            raise ValueError(f"Landing manca campo obbligatorio: {key}")
    for field, limit in CHAR_LIMITS.items():
        if len(landing.get(field, "")) > limit:
            raise ValueError(f"{field} supera {limit} caratteri: {len(landing[field])}")
    for benefit in landing.get("benefits", []):
        for field, limit in BENEFIT_LIMITS.items():
            if len(benefit.get(field, "")) > limit:
                raise ValueError(f"Benefit {field} supera {limit} caratteri")


def generate_landing(input_text: str, existing_slugs: list[str], api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": LANDING_PROMPT.format(
                input=input_text,
                existing_slugs=", ".join(existing_slugs) or "nessuno",
            ),
        }],
    )
    landing = parse_landing_response(message.content[0].text)
    validate_landing(landing)
    return landing


def load_existing_slugs(landing_pages_path: str) -> list[str]:
    path = Path(landing_pages_path)
    if not path.exists():
        return []
    with open(path) as f:
        return [p["slug"] for p in json.load(f)]


def append_landing_to_file(landing: dict, landing_pages_path: str) -> None:
    path = Path(landing_pages_path)
    with open(path) as f:
        pages = json.load(f)
    if any(p["slug"] == landing["slug"] for p in pages):
        raise ValueError(f"Slug già esistente: {landing['slug']}")
    pages.append(landing)
    with open(path, "w") as f:
        json.dump(pages, f, ensure_ascii=False, indent=2)
