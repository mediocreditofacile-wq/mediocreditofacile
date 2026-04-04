# mcf-ads-engine/tests/test_suggester.py
from unittest.mock import patch, MagicMock
from analyzer.suggester import suggest_kw_variants, parse_variants_response


def test_parse_variants_response_valid_json():
    raw = '{"variants": ["noleggio operativo impianti pmi", "fotovoltaico aziendale zero anticipo"]}'
    result = parse_variants_response(raw)
    assert len(result) == 2
    assert "noleggio operativo impianti pmi" in result


def test_parse_variants_response_strips_markdown():
    raw = '```json\n{"variants": ["test kw"]}\n```'
    result = parse_variants_response(raw)
    assert result == ["test kw"]


def test_suggest_kw_variants_calls_claude(monkeypatch):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = MagicMock(
        content=[MagicMock(text='{"variants": ["kw a", "kw b", "kw c"]}')]
    )
    monkeypatch.setattr("analyzer.suggester.anthropic.Anthropic", lambda api_key: mock_client)

    result = suggest_kw_variants("noleggio operativo", "Campagna Test", "fake-key")
    assert len(result) == 3
    mock_client.messages.create.assert_called_once()
