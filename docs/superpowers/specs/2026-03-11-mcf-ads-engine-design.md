# MCF Ads Engine — Design Spec
**Data:** 2026-03-11
**Progetto:** Mediocredito Facile
**Versione:** 1.0

---

## Obiettivo

Automatizzare il ciclo completo di gestione campagne Google Ads Search per Mediocredito Facile, integrando analisi KW, generazione landing page e creazione campagne in un unico flusso semi-automatico con approvazione umana per le modifiche alle campagne live.

---

## Architettura

Il sistema si chiama **MCF Ads Engine** ed è composto da 4 blocchi:

### 1. Collector
- Scarica ogni mattina i dati degli ultimi 30 giorni da Google Ads API
- Dati raccolti per keyword: impressioni, click, costo, conversioni, quality score, campagna, gruppo annunci
- Output: file JSON raw in `mcf-ads-engine/data/raw/`

### 2. Analyzer
- Classifica ogni KW in base alle regole di scoring
- Produce tre liste: `to_pause`, `to_reward`, `to_review`
- Genera suggerimenti KW long-tail via Claude API per le KW in `to_reward`

### 3. Generator
- Per le KW `to_reward`: genera proposta landing (slug, heroTitle, heroSubtitle, benefits)
- Per gli angoli inseriti manualmente: genera landing completa da input in linguaggio naturale
- Per ogni landing approvata: genera bozza struttura campagna (gruppi annunci, KW, copy annunci, URL finale)
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
| Deploy landing | Git commit → Vercel (auto-deploy) |
| Email notifiche | Resend (gratuito fino a 3k/mese) |
| Configurazione | config.yaml |

---

## Struttura Directory

```
mcf-ads-engine/
├── config.yaml                  # soglie, credenziali, schedule
├── main.py                      # entry point
├── collector/
│   └── google_ads.py            # fetch dati API
├── analyzer/
│   ├── scorer.py                # logica scoring KW
│   └── suggester.py             # Claude API per nuove KW
├── generator/
│   ├── landing.py               # genera JSON landing
│   ├── campaign.py              # genera bozza campagna
│   └── copy.py                  # genera copy annunci
├── dashboard/
│   ├── server.py                # FastAPI routes
│   └── templates/
│       └── index.html           # UI Alpine.js
├── notifier/
│   └── email.py                 # report via Resend
└── data/
    ├── raw/                     # dati grezzi Google Ads
    └── proposals/               # azioni in attesa di approvazione
```

---

## Regole di Scoring KW

Configurabili in `config.yaml`. Valori di default:

```yaml
scoring:
  pause_threshold_cost: 10.00      # €10 con 0 conversioni → pausa
  reward_cpc_percentile: 40        # sotto il 40° percentile CPC → reward
  reward_ctr_percentile: 60        # sopra il 60° percentile CTR → reward
  review_min_conversions: 1        # almeno 1 conversione → revisione qualità
```

### Classificazione

| Regola | Condizione | Azione proposta |
|---|---|---|
| Taglia | costo > €10 AND conversioni = 0 | Pausa KW |
| Fuori target | match lista esclusioni | KW negativa |
| Premia | CPC < 40° percentile AND CTR > 60° percentile | Landing dedicata |
| Revisione | conversioni ≥ 1 | Flag per feedback qualità |

---

## Flusso Generazione Landing

```
Input: KW "fotovoltaico aziendale capannone in affitto"
  ↓
Claude API identifica:
  - angolo principale
  - pain point dell'utente
  - soluzione specifica MCF
  ↓
Genera JSON:
  {
    "slug": "fotovoltaico-capannone-affitto-pmi",
    "heroTitle": "...",
    "heroSubtitle": "...",
    "benefits": [...]
  }
  ↓
Dashboard mostra diff
  ↓
Alberto approva
  ↓
Commit in mediocreditofacile/src/data/landing-pages.json
  ↓
Vercel auto-deploy (~30 secondi)
  ↓
Google Ads: proposta aggiornamento Final URL annunci collegati
```

### Input Angolo Manuale

Alberto scrive in linguaggio naturale nella dashboard:
> "PMI che hanno avuto rifiuti bancari e cercano alternative"

Il sistema genera la landing completa e la propone per approvazione con la stessa procedura.

---

## Struttura Campagna Generata

```
Campagna: "[Prodotto] — Angoli"
│
├── Gruppo: "[Nome Angolo]"
│   ├── Keywords: [lista KW match]
│   ├── Annuncio 1: 3 titoli + 2 descrizioni
│   ├── Annuncio 2: variante
│   └── Final URL: mediocreditofacile.it/[slug-landing]
```

Le bozze campagna non vengono mai pubblicate su Google Ads senza approvazione esplicita nella dashboard.

---

## Dashboard — Schermate

### Tab 1 — KW Review
- Tabella KW con: keyword, costo, CPC, conversioni, azione proposta
- Pulsanti: [Pausa] [Negativa] [Landing →] [Salta]
- Pulsante "Approva tutto" per azioni non rischiose (pausa KW senza conversioni)

### Tab 2 — Landing
- Lista landing proposte con anteprima heroTitle e angolo
- Pulsanti: [Modifica] [Approva] [Rifiuta]
- Campo libero per inserimento angolo manuale + [Genera Landing →]
- Diff visuale prima/dopo per ogni modifica

### Tab 3 — Campagne
- Lista bozze campagna con struttura gruppi annunci
- Pulsanti: [Vedi dettaglio] [Pubblica] [Rifiuta]
- Ogni pubblicazione richiede conferma esplicita

---

## Sistema Notifiche

### Report Giornaliero (ogni mattina)
**Oggetto:** `MCF Ads Engine — Report [data] | N azioni da approvare`

Contenuto:
- Numero azioni per tipo (pause, landing, URL update)
- Link dashboard: `http://localhost:5000`

### Report Settimanale (ogni lunedì)
Contenuto:
- Variazione CTR / CPC / conversioni vs settimana precedente
- KW in miglioramento da premiare
- KW in zona grigia da monitorare
- Performance landing attive
- Nuove KW suggerite da Claude per la settimana

### Report Mensile (primo del mese)
Contenuto:
- Overview completa campagne attive
- Ranking angoli per performance
- Costo per conversione per landing
- Suggerimenti strategici: nuovi angoli, prodotti sottoesposti
- Confronto mese precedente

---

## Flusso Iterazione e Feedback

In qualsiasi tab Alberto può scrivere una nota libera:
> "Cambia il benefit 2 della landing fotovoltaico-capannone: metti più enfasi sulla semplicità burocratica"

Il sistema:
1. Aggiorna il JSON tramite Claude API
2. Mostra il diff nella dashboard
3. Attende approvazione prima di committare

---

## Fasi di Rollout

| Fase | Contenuto | Rischio |
|---|---|---|
| 1 — Solo analisi | Collector + Analyzer + report email | Zero (solo lettura) |
| 2 — Landing automatiche | Generator + dashboard landing | Basso |
| 3 — URL update annunci | Modifica Final URL con approvazione | Medio |
| 4 — Campagne complete | Creazione gruppi annunci e pubblicazione | Alto → approvazione obbligatoria |

---

## Dipendenze Esterne

- Account Google Ads Manager attivo ✅
- Google Cloud Project con API abilitata ✅
- OAuth2 credentials per Google Ads API (da configurare)
- Chiave API Claude (Anthropic)
- Account Resend (email notifiche)
- Repository `mediocreditofacile` con Vercel deploy attivo ✅

---

## Vincoli e Limiti

- La dashboard gira solo in locale (localhost) — non è esposta su internet
- Nessuna modifica a Google Ads senza approvazione esplicita nella dashboard
- Il sistema non tocca il budget delle campagne — solo KW, annunci e URL
- Le soglie di scoring sono configurabili senza toccare il codice
