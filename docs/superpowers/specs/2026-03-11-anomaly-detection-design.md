# Anomaly Detection — Design Spec

## Goal

Rilevare automaticamente variazioni anomale nelle performance delle campagne Google Ads e inviare un alert email separato dal report giornaliero, solo quando ci sono anomalie reali.

## Architecture

Tre componenti coinvolti: un nuovo collector per dati giornalieri, un nuovo analyzer per il rilevamento, e nuove funzioni nel notifier per l'email di alert. Tutto integrato nel `main.py` esistente senza alterare il flusso corrente.

## Approccio dati

Query GAQL unica che scarica gli ultimi 8 giorni di dati **segmentati per data e campagna** (approccio "query storica al volo"). Il giorno più recente disponibile (ieri, per il delay di Google Ads ~3h) è il "giorno da analizzare". I 7 giorni precedenti formano la baseline per il calcolo della media.

Non serve storico accumulato: funziona dal primo giorno di utilizzo.

## File Map

| File | Modifica |
|---|---|
| `collector/google_ads.py` | Aggiunge `fetch_daily_metrics(customer_id, yaml_path)` |
| `analyzer/anomaly.py` | Nuovo file: `compute_account_totals()`, `detect_anomalies()` |
| `notifier/email.py` | Aggiunge `build_anomaly_html()`, `send_anomaly_alert()` |
| `main.py` | Integra anomaly check dopo il fetch normale |
| `config.yaml` | Aggiunge sezione `anomaly:` con soglie |
| `tests/test_anomaly.py` | Nuovo file di test |

## Dettaglio componenti

### collector/google_ads.py — `fetch_daily_metrics()`

GAQL query:
```sql
SELECT
  campaign.name,
  segments.date,
  metrics.cost_micros,
  metrics.clicks,
  metrics.impressions,
  metrics.conversions
FROM campaign
WHERE segments.date DURING LAST_8_DAYS
  AND campaign.status = 'ENABLED'
  AND campaign.advertising_channel_type = 'SEARCH'
ORDER BY segments.date ASC
```

Ritorna: `list[dict]` con campi `{date, campaign, cost, clicks, impressions, conversions, cpc, ctr}`.

### analyzer/anomaly.py

**`compute_account_totals(daily_data)`**
- Input: lista di righe campaign+date
- Aggrega per data (somma tutte le campagne)
- Output: `dict[str, dict]` — `{date: {cost, clicks, impressions, conversions, cpc, ctr}}`

**`detect_anomalies(daily_data, thresholds)`**
- Calcola `account_totals` con la funzione sopra
- Separa il giorno più recente dai 7 precedenti
- Per ogni metrica: calcola media 7gg, confronta con oggi
- Se deviazione > soglia → aggiunge anomalia all'elenco
- Ripete per ogni singola campagna (solo quelle con anomalia)
- Output:
```python
{
  "date": "2026-03-11",
  "account": {
    "today": {...},
    "avg_7d": {...},
    "anomalies": [{"metric": "cost", "today": 45.0, "avg_7d": 28.0, "delta_pct": 60.7}]
  },
  "campaigns": [
    {
      "campaign": "Fotovoltaico Aziendale",
      "today": {...},
      "avg_7d": {...},
      "anomalies": [...]
    }
  ]
}
```

### notifier/email.py — nuove funzioni

**`build_anomaly_html(result, date_str)`**
- Oggetto email: `⚠️ Anomalia campagne — {date_str}`
- Struttura:
  1. Riepilogo account: tabella oggi vs media 7gg con delta evidenziato in rosso/verde
  2. Sezione per ogni campagna con anomalie
  3. Link dashboard `http://127.0.0.1:5000`

**`send_anomaly_alert(result, api_key, to_email, date_str)`**
- Invia l'email solo se `result["account"]["anomalies"]` o `result["campaigns"]` non sono vuoti

### config.yaml — sezione anomaly

```yaml
anomaly:
  cost_increase_pct: 50      # alert se costo +50% vs media 7gg
  cpc_increase_pct: 30       # alert se CPC +30%
  ctr_decrease_pct: 40       # alert se CTR -40%
  conversions_decrease_pct: 50  # alert se conversioni -50%
```

### main.py — integrazione

```python
# Dopo il fetch KW esistente:
daily_data = fetch_daily_metrics(customer_id, yaml_path)
anomaly_result = detect_anomalies(daily_data, config)
if anomaly_result["account"]["anomalies"] or anomaly_result["campaigns"]:
    send_anomaly_alert(anomaly_result, resend_api_key, to_email, today)
```

## Testing

`tests/test_anomaly.py` copre:
- `test_compute_account_totals_aggregates_by_date` — verifica somma corretta per giorno
- `test_detect_anomalies_cost_spike` — costo +60% → anomalia rilevata
- `test_detect_anomalies_no_anomaly` — dati normali → lista vuota
- `test_detect_anomalies_ctr_drop` — CTR -50% → anomalia rilevata
- `test_detect_anomalies_campaign_level` — anomalia su singola campagna
- `test_build_anomaly_html_contains_delta` — HTML contiene percentuale deviazione

## Error handling

- Se `fetch_daily_metrics()` fallisce → log warning, skip anomaly check (non blocca il report normale)
- Se meno di 2 giorni di dati disponibili → skip anomaly check (baseline insufficiente)

## Rollout

Nessun impatto sul flusso esistente. L'alert è addizionale — se non ci sono anomalie non arriva nessuna email extra.
