# mcf-ads-engine/tests/test_generator_landing.py
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock
from generator.landing import (
    parse_landing_response,
    validate_landing,
    load_existing_slugs,
    append_landing_to_file,
)


VALID_LANDING = {
    "slug": "fotovoltaico-capannone-affitto",
    "metaTitle": "Fotovoltaico per Capannoni in Affitto | Mediocredito Facile",
    "metaDescription": "Impianto fotovoltaico anche se il capannone è in affitto. Noleggio operativo senza anticipo.",
    "heroTitle": "Fotovoltaico Anche con Capannone in Affitto",
    "heroSubtitle": "Il tetto non è tuo? Con il noleggio operativo l'impianto resta della società di noleggio.",
    "ctaText": "Verifica la Fattibilità",
    "benefits": [
        {"icon": "home_work", "title": "Impianto non tuo", "description": "L'impianto è di proprietà della società."},
        {"icon": "folder", "title": "Doc gestita", "description": "Ti aiutiamo con l'accordo col proprietario."},
        {"icon": "swap_horiz", "title": "Trasferibile", "description": "Se cambi sede, il contratto si gestisce."},
    ],
}


def test_parse_landing_response_valid():
    raw = json.dumps(VALID_LANDING)
    result = parse_landing_response(raw)
    assert result["slug"] == "fotovoltaico-capannone-affitto"


def test_parse_landing_response_strips_markdown():
    raw = f"```json\n{json.dumps(VALID_LANDING)}\n```"
    result = parse_landing_response(raw)
    assert result["slug"] == "fotovoltaico-capannone-affitto"


def test_validate_landing_passes_valid():
    validate_landing(VALID_LANDING)  # should not raise


def test_validate_landing_fails_missing_slug():
    bad = {**VALID_LANDING}
    del bad["slug"]
    try:
        validate_landing(bad)
        assert False, "Should have raised"
    except ValueError:
        pass


def test_validate_landing_fails_too_long_meta_title():
    bad = {**VALID_LANDING, "metaTitle": "A" * 61}
    try:
        validate_landing(bad)
        assert False, "Should have raised"
    except ValueError:
        pass


def test_load_existing_slugs(tmp_path):
    lp = tmp_path / "landing-pages.json"
    lp.write_text(json.dumps([{"slug": "existing-slug"}]))
    slugs = load_existing_slugs(str(lp))
    assert slugs == ["existing-slug"]


def test_append_landing_to_file(tmp_path):
    lp = tmp_path / "landing-pages.json"
    lp.write_text(json.dumps([{"slug": "existing"}]))
    append_landing_to_file(VALID_LANDING, str(lp))
    pages = json.loads(lp.read_text())
    assert len(pages) == 2
    assert pages[-1]["slug"] == "fotovoltaico-capannone-affitto"


def test_append_landing_fails_duplicate_slug(tmp_path):
    lp = tmp_path / "landing-pages.json"
    lp.write_text(json.dumps([{"slug": "fotovoltaico-capannone-affitto"}]))
    try:
        append_landing_to_file(VALID_LANDING, str(lp))
        assert False, "Should have raised"
    except ValueError:
        pass
