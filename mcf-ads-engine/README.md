# MCF Ads Engine

Automazione campagne Google Ads per Mediocredito Facile.

## Setup

1. Copia e compila i file di configurazione:
   ```bash
   cp .env.example .env
   cp google-ads.yaml.example google-ads.yaml
   ```

2. Ottieni le credenziali Google Ads:
   - Developer Token: richiedilo su Google Ads API Center (processo ~1 settimana)
   - OAuth2 Client ID: crea in Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs (tipo: Desktop app)
   - Scarica `client_secrets.json` da Google Cloud Console
   - Esegui: `python setup_auth.py` e copia il refresh token in `google-ads.yaml`

3. Installa dipendenze:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -e ".[dev]"
   ```

## Uso

**Run manuale:**
```bash
source .venv/bin/activate
python main.py
```

**Apri dashboard:**
```bash
uvicorn dashboard.server:app --port 5001
# Vai su http://localhost:5001
```

**Installa scheduler (run automatico ogni giorno alle 8:00):**
```bash
# Prima compila le variabili API in scheduler/it.mediocreditofacile.adsengine.plist
cp scheduler/it.mediocreditofacile.adsengine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/it.mediocreditofacile.adsengine.plist
```

## Test

```bash
pytest -v
```

## Fasi di Rollout

| Fase | Cosa fa | Rischio |
|---|---|---|
| 1 (attuale) | Analisi KW + email report | Zero |
| 2 | Generazione landing + dashboard approvazione | Basso |
| 3 | Aggiornamento URL annunci | Medio |
| 4 | Creazione campagne complete | Alto |

## Credenziali necessarie

| Credenziale | Dove ottenerla |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `RESEND_API_KEY` | resend.com (piano gratuito) |
| Google Ads Developer Token | Google Ads > Strumenti > API Center |
| OAuth2 Client ID/Secret | Google Cloud Console > APIs & Services > Credentials |
