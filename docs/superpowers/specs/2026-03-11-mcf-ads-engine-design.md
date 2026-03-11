# MCF Ads Engine — Design Spec
**Data:** 2026-03-11
**Progetto:** Mediocredito Facile
**Versione:** 1.1

---

## Obiettivo

Automatizzare il ciclo completo di gestione campagne Google Ads Search per Mediocredito Facile, integrando analisi KW, generazione landing page e creazione campagne in un unico flusso semi-automatico con approvazione umana per le modifiche alle campagne live.

---

## Architettura

Il sistema si chiama **MCF Ads Engine** ed è composto da 4 blocchi:

### 1. Collector
- Scarica ogni mattina i dati degli ultimi 30 giorni da Google Ads API
- Dati raccolti per keyword: impressioni, click, costo, conversioni, quality score, campagna, gruppo annunci, match type
- Output: file JSON raw in `mcf-ads-engine/data/raw/YYYY-MM-DD.json`

### 2. Analyzer
- Classifica ogni KW in base alle regole di scoring
- Produce tre liste: `to_pause`, `to_reward`, `to_review`
- Genera suggerimenti KW long-tail via Claude API per le KW in `to_reward`
- Output: file `data/proposals/YYYY-MM-DD.json` con schema definito (vedi sezione Schema Proposals)

### 3. Generator
- Per le KW `to_reward`: genera proposta landing (slug, heroTitle, heroSubtitle, benefits, ctaText)
- Per gli angoli inseriti manualmente: genera landing completa da input in linguaggio naturale
- Per ogni landing approvata: genera automaticamente una bozza campagna in `data/proposals/` (Tab 3 della dashboard)
- Output: blocchi JSON pronti per `mediocreditofacile/src/data/landing-pages.json`

### 4. Dashboard
- Server locale FastAPI su `localhost:5000`
- UI leggera in HTML + Alpine.js (no build step)
- Tre tab: KW Review · Landing · Campagne
- Input libero per angoli manuali
- Diff prima/dopo per ogni modifica
- Approvazione granulare riga per riga

---

## Stack Tecnico

| Componente | Tecnologia |
|---|---|
| Script principale | Python 3.12 |
| Dashboard server | FastAPI |
| Dashboard UI | HTML + Alpine.js |
| Google Ads integration | google-ads-python (libreria ufficiale) |
| AI generation | Claude API (claude-sonnet-4-6) |
| Deploy landing | Git commit → Vercel (auto-deploy da branch `main`) |
| Email notifiche | Resend (gratuito fino a 3k/mese) |
| Configurazione | `config.yaml` + variabili d'ambiente per segreti |
| Scheduling | macOS `launchd` (plist in ~/Library/LaunchAgents) |

---

## Struttura Directory

```
mcf-ads-engine/
├── config.yaml                  # soglie, schedule, impostazioni non-segrete
├── .env                         # segreti (non committato)
├── google-ads.yaml              # credenziali Google Ads API (non committato)
├── main.py                      # entry point
├── setup_auth.py                # script one-time per OAuth2 token iniziale
├── collector/
│   └── google_ads.py            # fetch dati API
├── analyzer/
│   ├── scorer.py                # logica scoring KW
│   └── suggester.py             # Claude API per nuove KW
├── generator/
│   ├── landing.py               # genera JSON landing
│   ├── campaign.py              # genera bozza campagna
│   └── copy.py                  # genera copy annunci RSA
├── dashboard/
│   ├── server.py                # FastAPI routes
│   └── templates/
│       └── index.html           # UI Alpine.js
├── notifier/
│   └── email.py                 # report via Resend
├── scheduler/
│   └── it.mediocreditofacile.adsengine.plist  # launchd config
└── data/
    ├── raw/                     # dati grezzi Google Ads (YYYY-MM-DD.json)
    ├── proposals/               # azioni in attesa (YYYY-MM-DD.json)
    └── exclusions.yaml          # lista KW/settori da escludere
```

---

## Schema `landing-pages.json` (completo)

Ogni entry nel file `mediocreditofacile/src/data/landing-pages.json` segue questo schema:

```json
{
  "slug": "string",              // URL path: mediocreditofacile.it/{slug}
  "metaTitle": "string",         // <title> SEO (max 60 caratteri)
  "metaDescription": "string",   // meta description SEO (max 155 caratteri)
  "heroTitle": "string",         // titolo principale H1
  "heroSubtitle": "string",      // sottotitolo hero
  "ctaText": "string",           // testo pulsante CTA (opzionale, default: "Richiedi Consulenza")
  "benefits": [
    {
      "icon": "string",          // nome icona Material Symbols
      "title": "string",         // titolo benefit (max 40 caratteri)
      "description": "string"    // descrizione benefit (max 120 caratteri)
    }
  ]
}
```

Il Generator produce sempre tutte le chiavi obbligatorie. `ctaText` è opzionale.

---

## Schema `data/proposals/YYYY-MM-DD.json`

```json
{
  "date": "YYYY-MM-DD",
  "to_pause": [
    {
      "keyword": "string",
      "campaign": "string",
      "ad_group": "string",
      "cost": 0.00,
      "conversions": 0,
      "match_type": "EXACT|PHRASE|BROAD",
      "reason": "string",
      "status": "pending|approved|rejected"
    }
  ],
  "to_reward": [
    {
      "keyword": "string",
      "campaign": "string",
      "ad_group": "string",
      "match_type": "EXACT|PHRASE|BROAD",
      "cpc": 0.00,
      "ctr": 0.00,
      "suggested_landing_slug": "string",
      "suggested_kw_variants": ["string"],
      "status": "pending|approved|rejected"
    }
  ],
  "to_review": [
    {
      "keyword": "string",
      "conversions": 0,
      "cost_per_conversion": 0.00,
      "quality_note": "string",
      "alberto_feedback": "string|null",
      "status": "pending|reviewed"
    }
  ],
  "landing_proposals": [
    {
      "source": "auto|manual",
      "trigger_keyword": "string|null",
      "angle_input": "string|null",
      "landing_json": {},
      "status": "pending|approved|rejected"
    }
  ],
  "campaign_drafts": [
    {
      "campaign_name": "string",
      "ad_group_name": "string",
      "keywords": ["string"],
      "landing_slug": "string",
      "headlines": ["string"],      // min 10, max 15 elementi (max 30 char ciascuno)
      "descriptions": ["string"],   // esattamente 4 elementi (max 90 char ciascuno)
      "status": "pending|approved|rejected"
    }
  ]
}
```

---

## Regole di Scoring KW

Configurabili in `config.yaml`. Valori di default:

```yaml
scoring:
  pause_threshold_cost: 10.00      # €10 con 0 conversioni → pausa proposta
  reward_cpc_percentile: 40        # sotto il 40° percentile CPC → reward
  reward_ctr_percentile: 60        # sopra il 60° percentile CTR → reward
  review_min_conversions: 1        # almeno 1 conversione → revisione qualità
  auto_approve_pause: false        # mai auto-approvare pause senza conferma

exclusions:
  file: data/exclusions.yaml       # lista settori/termini fuori target
```

**Nota:** il pulsante "Approva tutto" in Tab 1 NON esegue azioni automaticamente. Mostra un riepilogo e richiede una conferma esplicita. La pausa di una KW con 0 conversioni è proposta ma mai eseguita senza click deliberato di Alberto.

### Classificazione

| Regola | Condizione | Azione proposta |
|---|---|---|
| Taglia | costo > €10 AND conversioni = 0 | Pausa KW |
| Fuori target | match lista `exclusions.yaml` | KW negativa |
| Premia | CPC < 40° percentile AND CTR > 60° percentile | Landing dedicata |
| Revisione | conversioni ≥ 1 | Feedback qualità da Alberto |

### Lista Esclusioni (`data/exclusions.yaml`)

```yaml
# Termini che indicano target fuori business
excluded_terms:
  - privati
  - consumatori
  - mutuo prima casa
  - prestito personale
  - cessione del quinto

# Settori non serviti
excluded_sectors:
  - agricoltura
  - startup pre-revenue
```

Alberto gestisce e aggiorna questo file manualmente o via dashboard.

---

## Flusso Generazione Landing

```
Input: KW "fotovoltaico aziendale capannone in affitto"
  ↓
Claude API identifica angolo + pain point + soluzione MCF
  ↓
Genera JSON completo (con tutti i campi dello schema)
  ↓
Aggiunge proposta a data/proposals/YYYY-MM-DD.json (status: pending)
  ↓
Dashboard Tab 2 mostra la proposta con diff visuale
  ↓
Alberto approva
  ↓
Commit in mediocreditofacile/src/data/landing-pages.json
  ↓
Vercel auto-deploy da branch main (~30 secondi)
  ↓
Sistema crea automaticamente campaign_draft collegato nella stessa proposal
  ↓
Dashboard Tab 3 mostra la bozza campagna pronta per revisione
```

**Nota Vercel:** il deploy avviene direttamente su `main`. Non è previsto un preview step. Il rischio è minimo perché la landing va live ma non riceve traffico finché Alberto non approva anche la campagna/URL update.

### Input Angolo Manuale

Alberto scrive in linguaggio naturale nella dashboard:
> "PMI che hanno avuto rifiuti bancari e cercano alternative"

Il sistema genera la landing completa e la propone con la stessa procedura.

---

## Formato Annunci: Responsive Search Ads (RSA)

Google Ads usa attualmente gli **RSA (Responsive Search Ads)**. Gli Expanded Text Ads sono deprecati.

Ogni bozza annuncio generata include:
- **Headline:** 10-15 titoli (max 30 caratteri ciascuno) — Google sceglie i 3 da mostrare
- **Description:** 4 descrizioni (max 90 caratteri ciascuna) — Google sceglie le 2 da mostrare

Il Generator produce sempre almeno 10 headline e 4 description per annuncio, con varietà semantica per massimizzare il Quality Score.

---

## Aggiornamento Final URL Annunci

Quando una landing è live e una campagna draft è approvata, il sistema propone l'aggiornamento del Final URL degli **annunci esistenti** nel gruppo.

**Comportamento:** viene creata una **nuova variante dell'annuncio** (non modifica in place) per preservare la storia performance dell'annuncio originale. La vecchia variante viene messa in pausa (proposta, non automatica).

---

## Tracking Conversioni per Landing — Strategia UTM

Per misurare le performance per landing, ogni URL negli annunci include parametri UTM automatici:

```
https://mediocreditofacile.it/{slug}
  ?utm_source=google
  &utm_medium=cpc
  &utm_campaign={campaign_name}
  &utm_content={slug}
  &utm_term={keyword}
```

I report settimanali e mensili leggono questi dati da Google Ads (tramite il parametro `{lpurl}` + ValueTrack) per calcolare il costo per conversione per landing.

---

## Struttura Campagna Generata

```
Campagna: "[Prodotto] — Angoli"
│
├── Gruppo: "[Nome Angolo]"
│   ├── Keywords: [lista KW, match type PHRASE di default]
│   ├── RSA 1: 12 headline + 4 description
│   ├── RSA 2: variante semantica
│   └── Final URL: mediocreditofacile.it/{slug}?utm_...
```

Le bozze non vengono mai pubblicate su Google Ads senza approvazione esplicita nella dashboard.

---

## Dashboard — Schermate

### Tab 1 — KW Review
- Tabella KW con: keyword, match type, costo, CPC, conversioni, azione proposta
- Pulsanti: [Pausa] [Negativa] [Landing →] [Salta]
- Sezione `to_review`: KW con conversioni, campo note per feedback qualità di Alberto
- Pulsante "Approva selezionate" con conferma modale (non approva tutto in automatico)

### Tab 2 — Landing
- Lista landing proposte con anteprima heroTitle e angolo
- Pulsanti: [Modifica] [Approva] [Rifiuta]
- Campo libero per inserimento angolo manuale + [Genera Landing →]
- Diff visuale prima/dopo per ogni modifica

### Tab 3 — Campagne
- Lista bozze campagna con struttura gruppi annunci e preview RSA
- Pulsanti: [Vedi dettaglio] [Pubblica] [Rifiuta]
- Ogni pubblicazione richiede conferma esplicita con riepilogo delle modifiche

---

## Sistema Notifiche

### Report Giornaliero (ogni mattina, ore 8:00)
**Oggetto:** `MCF Ads Engine — Report [data] | N azioni da approvare`

Contenuto:
- Numero azioni per tipo (pause, landing, URL update)
- Link dashboard: `http://localhost:5000`

### Report Settimanale (ogni lunedì, ore 8:00)
Contenuto:
- Variazione CTR / CPC / conversioni vs settimana precedente
- KW in miglioramento da premiare
- KW in zona grigia da monitorare
- Performance landing attive (conversioni e costo per conversione via UTM; CTR riportato a livello gruppo annunci, non per singola landing)
- Nuove KW long-tail suggerite da Claude per la settimana

### Report Mensile (primo del mese, ore 8:00)
Contenuto:
- Overview completa campagne attive
- Ranking angoli per performance (costo per conversione)
- Suggerimenti strategici: nuovi angoli, prodotti sottoesposti
- Confronto mese precedente

---

## Scheduling (macOS launchd)

Lo script gira automaticamente tramite `launchd`. Il file plist in `scheduler/` viene installato con un comando una tantum:

```bash
cp scheduler/it.mediocreditofacile.adsengine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/it.mediocreditofacile.adsengine.plist
```

Orari configurati in `config.yaml`:
```yaml
schedule:
  daily_run: "08:00"
  weekly_report_day: "monday"
  monthly_report_day: 1
```

---

## Autenticazione Google Ads API

Google Ads API richiede:
1. **Developer Token** — richiesto via Google Ads Manager (processo one-time)
2. **OAuth2 Client ID + Secret** — da Google Cloud Console
3. **Refresh Token** — ottenuto la prima volta con browser interattivo

### Setup iniziale (one-time)
```bash
python setup_auth.py
```
Apre il browser, Alberto autorizza l'accesso, il refresh token viene salvato in `google-ads.yaml`.

### File `google-ads.yaml` (non committato, in `.gitignore`)
```yaml
developer_token: "..."
client_id: "..."
client_secret: "..."
refresh_token: "..."
login_customer_id: "..."   # ID account Manager
```

### File `.env` (non committato, in `.gitignore`)
```
ANTHROPIC_API_KEY=...
RESEND_API_KEY=...
NOTIFICATION_EMAIL=alberto@...
```

---

## Gestione Errori e Rollback

- Se il deploy Vercel fallisce: il sistema invia notifica email e non propone aggiornamenti URL finché la landing non è live
- Se Google Ads API è irraggiungibile: lo script logga l'errore, salta il run, notifica via email
- Se Claude API non risponde: il Generator salta la generazione, la proposta rimane vuota con flag `generation_failed`
- Non esiste rollback automatico su Git: se una landing committata ha problemi, Alberto ripristina manualmente dalla dashboard o via Git

---

## Dipendenze Esterne

| Dipendenza | Stato | Note |
|---|---|---|
| Account Google Ads Manager | ✅ attivo | |
| Google Cloud Project + API abilitata | ✅ attivo | |
| Developer Token Google Ads | da richiedere | Processo ~1 settimana |
| OAuth2 credentials (Client ID/Secret) | da configurare | |
| Refresh Token OAuth2 | da generare | Via `setup_auth.py` |
| `google-ads.yaml` | da creare | Locale, non committato |
| Chiave API Claude (Anthropic) | da creare | |
| Account Resend | da creare | Piano gratuito sufficiente |
| `git` CLI autenticato | ✅ attivo | Già usato nel progetto |
| Repository `mediocreditofacile` + Vercel | ✅ attivo | |

---

## Vincoli e Limiti

- La dashboard gira solo in locale (localhost) — non è esposta su internet
- Nessuna modifica a Google Ads senza approvazione esplicita nella dashboard
- Il sistema non tocca il budget delle campagne — solo KW, annunci e URL
- Le soglie di scoring sono configurabili senza toccare il codice
- La pausa KW con 0 conversioni non è mai automatica, anche se apparentemente "sicura"

---

## Fasi di Rollout

| Fase | Contenuto | Rischio |
|---|---|---|
| 1 — Solo analisi | Collector + Analyzer + report email | Zero (solo lettura) |
| 2 — Landing automatiche | Generator + dashboard landing + commit Vercel | Basso (landing live ma senza traffico) |
| 3 — URL update annunci | Nuova variante RSA con Final URL aggiornato | Medio → approvazione obbligatoria |
| 4 — Campagne complete | Creazione gruppi annunci e pubblicazione | Alto → approvazione obbligatoria + conferma modale |
