# Mediocredito Facile — Progetto Astro

## Stack
- Framework: Astro (SSG)
- Hosting: Vercel
- Dominio: mediocreditofacile.it
- CRM: Pipedrive
- Ads: Google Ads (account AW-16800748626)
- Tracking: GTM + GA4
- Form: webhook Zapier → Pipedrive
- Webhook URL: https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/

## Struttura progetto
- src/data/landing-pages.json → definizioni landing page (slug, titolo, sottotitolo, benefits, CTA)
- src/layouts/Layout.astro → layout base + CSS globale + GTM
- src/components/ → Header, Hero, Benefits, HowItWorks, ContactForm, Footer
- src/pages/[slug].astro → generatore dinamico landing da JSON
- src/pages/index.astro → homepage (navbar completa)
- public/images/ → foto (hero-fotovoltaico.png, pannelli-tetto.png, hero-homepage.png, consulenza-business.png)
- src/pages/finanziamenti/ → landing page core finanziamenti IFIS (chirografario, strutturato, factoring)
- src/pages/finanziamenti/agevolazioni/ → hub agevolazioni + 3 landing (Sabatini, MCC, Bando ISI)
- src/pages/grazie-fin.astro → thank you page finanziamenti (conversion tag form_finanziamenti)
- src/pages/grazie-agev.astro → thank you page agevolazioni (conversion tag form_agevolazioni). Riceve `?fonte=<slug>` da SabatiniCalculator, FondoGaranziaChecker, BandoIsiChecker e dal form di iperammortamento-2026; in mancanza di querystring, fallback su referrer. dataLayer event: `form_agevolazioni` + `generate_lead`.
- src/pages/tools/energyteam.astro → area partner EnergyTeam (password: `energyteam`, localStorage key `mcf_energyteam_auth`, noindex). Monta `SimulatoreFotovoltaico` con prop `assicurazioneOpzionale` e `varianteForm="energyteam"`.
- src/pages/tools/arca-energia.astro → area partner Arca Energia (password: `arcaenergia`, localStorage key `mcf_arcaenergia_auth`, noindex). Monta `SimulatoreFotovoltaico` con prop `assicurazioneOpzionale`, `varianteForm="arcaenergia"`, `zonaFissa="sud"`, `abilitaLeasing`, `abilitaAgevolazioni`. Include switch noleggio/leasing, iperammortamento 4.0, Sabatini 4.0 e ZES Unica.
- src/pages/tools/age-srl.astro → area partner AGE SRL (password: `age-srl`, localStorage key `mcf_agesrl_auth`, noindex). Stessa struttura di Arca Energia + download preventivo PDF brandizzato MCF.
- src/pages/partner/guida-noleggio-operativo.astro → pillar page per partner/rivenditori (29 aprile 2026). Riprende il deck Claude Design "Guida operativa MCF 2026" e lo riadatta a pagina web responsive. 11 sezioni: hero, indice ancorato, definizione, otto vantaggi commerciali, fatturazione (canone, pro-rata, tabelle spese, assicurazione All Risk), documenti istruttoria per 4 tipologie cliente, documenti decorrenza, tre opzioni fine contratto, FAQ partner (8 domande tipiche), glossario, CTA finale con form (fonte: `guida-partner-noleggio`). Stile scoped con prefix `.gp-*`. Tre immagini dedicate generate via `mcp__mcf-image__mcf_generate_photo` (style documentary editorial, anti-pattern AI): `/images/guida-partner-hero-officina.webp`, `/images/guida-partner-fatturazione-desk.webp`, `/images/guida-partner-fine-contratto.webp`. URL pubblico: `/partner/guida-noleggio-operativo`. Si integra come approfondimento di `/diventa-partner` (la landing resta conversion-focused, la pillar è informazionale + asset commerciale per WhatsApp/email/LinkedIn).

## Simulatore Fotovoltaico — prop del componente
Il componente `src/components/tools/SimulatoreFotovoltaico.tsx` accetta queste prop opzionali:
- `modalitaPartner?: boolean` → fascia lead "Scarica PDF" con sblocco via form (usata in `simulatore-fotovoltaico-partner.astro`)
- `assicurazioneOpzionale?: boolean` → toggle UI per l'assicurazione all-risk (1,83% annuo). Default OFF.
- `varianteForm?: 'standard' | 'energyteam' | 'arcaenergia'` → variante del form. `'energyteam'` e `'arcaenergia'` mostrano form partner+cliente+checklist documenti e inviano a Zapier con la fonte corrispondente.
- `zonaFissa?: 'nord' | 'centro' | 'sud' | 'isole'` → forza irraggiamento e nasconde selettore zona.
- `abilitaLeasing?: boolean` → mostra switch Noleggio Operativo / Leasing Finanziario. Il leasing usa ammortamento alla francese con TAN, anticipo e riscatto configurabili. Dati default dal preventivo l4b (TAN 6.24%, anticipo 20%, riscatto 1%).
- `abilitaAgevolazioni?: boolean` → mostra toggle Iperammortamento 4.0 e Sabatini 4.0 (solo in modalità leasing + business plan attivo). L'iperammortamento non si applica al noleggio operativo.

Dati leasing e agevolazioni: `src/data/leasing.ts`.
Le prop sono retrocompatibili: pagine esistenti non cambiano comportamento.

## Architettura landing page
Le landing dinamiche si generano da landing-pages.json. Per creare una nuova landing basta aggiungere un oggetto al JSON con: slug, title, subtitle, benefits (array 3 oggetti), ctaText. Il template [slug].astro fa il resto.

**Campi opzionali di personalizzazione (JSON):**
- `valueTitle`, `valueText`, `valueText2` → personalizzano la sezione Value Proposition
- `formHeading`, `formSubheading`, `formCta` → se tutti e tre valorizzati, il template aggiunge un secondo ContactForm dopo i Benefits (form intermedio) e personalizza anche il form finale con gli stessi valori. Serve per landing di conversione dove il CTA del Hero promette qualcosa di specifico (es. "Calcola il tuo canone") e il form ne è la porta di ingresso.

Le 6 landing fotovoltaico (`noleggio-fotovoltaico-*`) usano tutti questi campi: sono landing di conversione con CTA/form allineati, ognuna con angolo distinto e numeri concreti (riferimento: impianto 30 kW, canone 526 €/mese, bolletta risparmiata 759 €/mese). Riscritte il 20 aprile 2026 nel voice profile di Alberto.

Le altre landing (noleggio-operativo, leasing-strumentale, finanziamenti-pmi, diventa-partner, finanza-veloce, noleggio-operativo-ristorazione) usano solo i campi base e mantengono il form generico in fondo pagina.

Le landing finanziamenti e agevolazioni sono pagine Astro dedicate (non da JSON) con CSS scoped e form custom.

## ContactForm — prop del componente
Il componente `src/components/ContactForm.astro` accetta queste prop opzionali:
- `fonte?: string` → valorizza il campo nascosto `fonte` nel payload (slug della landing)
- `heading?: string` → titolo del blocco form (default: "Richiedi Preventivo Gratuito")
- `subheading?: string` → sottotitolo (default: "Compila il modulo e ti ricontatteremo entro 24 ore lavorative. Nessun impegno.")
- `ctaText?: string` → testo del bottone di submit (default: "Richiedi Preventivo Gratuito")
- `variant?: 'primary' | 'secondary'` → 'primary' è il form finale (mantiene `id="contatti"` per l'anchor scroll dal CTA Hero); 'secondary' è il form intermedio nella pagina (nessun id anchor, invia un campo `variante=secondary` al webhook per distinguere in Pipedrive). Default: 'primary'.
- `endpoint?: string` → URL dell'API a cui POST il form. Default `/api/submit`. Diventa l'attributo `action` del form e l'URL del fetch script.
- `redirectOnSuccess?: string` → URL su cui fare `window.location.href` dopo il submit (anche su errore di rete). Default `/grazie`. Viene scritto come `data-redirect` sul form e letto dallo script di submit.

Lo script di submit agisce su tutti i form presenti in pagina via `querySelectorAll`, così il form intermedio e quello finale vengono entrambi gestiti senza collisioni. Endpoint e redirect sono letti dinamicamente da `form.action` e `form.dataset.redirect`, quindi più form sulla stessa pagina possono avere endpoint/redirect diversi.

## Regole componenti
- Header.astro ha prop "minimal" (boolean). minimal=true → solo logo + telefono (per landing ads). minimal=false → navbar completa (per homepage e pagine sito).
- Le landing con slug che contiene "fotovoltaico" mostrano le foto hero-fotovoltaico.png e pannelli-tetto.png.
- Form invia a webhook Zapier. Thank you pages: /grazie (vendor), /grazie-fin (finanziamenti IFIS), /grazie-agev (agevolazioni Sabatini/MCC/ISI/Iperammortamento).
- Il campo `fonte` nei form identifica la provenienza: "finanziamenti-ifis", "sabatini", "fondo-garanzia-mcc", "bando-isi-inail".

## Brand (aggiornato aprile 2026)

Logo wordmark tipografico "Mediocredito Facile" — DUE parole (non tre):
- "Mediocredito" è UNA PAROLA UNICA. Il cambio colore/peso avviene senza spazi:
  - "Medio" (prima parte) — #664CCD (viola), weight 700
  - "credito" (seconda parte, attaccata) — #293C5B (charcoal) / bianco su sfondo scuro, weight 300
  - In SVG: usare <tspan> nidificati dentro un unico <text>, SENZA whitespace tra i tspan
  - In HTML: <span> nidificati con display: inline, nessun gap
- "Facile" — #FE6F3A (arancio), weight 800 — parola separata da uno spazio
- Claim: "L'OFFICINA DEL CREDITO" — weight 400, letter-spacing 3.5px, #664CCD
- Componente: src/components/Logo.astro (varianti: principale, compatto, inline, dark)
- Monogramma MCF: M e F bianche weight 800, C arancio #FE6F3A weight 700, sfondo viola #664CCD

Palette:
- Arancio primario (CTA): #FE6F3A (--mcf-primary)
- Viola accento (titoli, link): #664CCD (--mcf-accent)
- Arancio accessibile (testo piccolo su bianco): #D45A2E (--mcf-primary-dark)
- Charcoal (corpo testo): #444451 (--mcf-charcoal)
- Rich Black (titoli forti): #0F1020 (--mcf-black)
- Taupe (note, footer): #787782 (--mcf-taupe)
- Ghost White (sfondo sezioni): #F8F7FA (--mcf-ghost)
- Platinum (bordi, separatori): #E1DEE3 (--mcf-platinum)
- Melon (sfondi caldi): #F0A78F (--mcf-melon)
- Gradient: linear-gradient(135deg, #FE6F3A, #664CCD)

Font: Manrope (Google Fonts, weights 300-400-500-600-700-800)
Mai nero puro #000000 — usare sempre #0F1020 o #444451

## Convenzioni
- Telefono: +39 393 995 7840 (link tel:+393939957840)
- Email: mediocreditofacile@gmail.com
- Privacy: link a /privacy su tutti i form
- Immagini: sempre in public/images/, nomi kebab-case
- Form — campo "fonte" OBBLIGATORIO: ogni form del sito deve avere un campo nascosto `fonte` con lo slug della pagina. Per le landing dinamiche (da landing-pages.json), il componente ContactForm accetta la prop `fonte` e lo slug viene passato automaticamente in [slug].astro. Per i form inline nelle pagine statiche, usare `<input type="hidden" name="fonte" value="[slug]" />`. Il campo arriva a Zapier e da lì nella mail di notifica e in Pipedrive, così ogni lead porta con sé l'informazione della pagina di provenienza.

## API Routes (Vercel serverless)
- `src/pages/api/submit.ts` → endpoint form contatti standard MCF. Dal 20 aprile 2026 ha safety net: invia mail diretta via Resend (mittente `onboarding@resend.dev`, destinatario `mediocreditofacile@gmail.com`) IN PARALLELO alla chiamata Zapier. Logga ogni submission come JSON strutturato (evento `form_submitted` con esito di entrambi i canali). Se entrambi falliscono, logga `lead_lost` con payload completo per recupero manuale. Risponde sempre 200 al browser per non degradare la UX. Honeypot loggato come `form_rejected` per debug.
- `src/pages/api/submit-agevolazioni.ts` → endpoint dedicato alla campagna Agevolazioni in partnership con Ambico Group (aggiunto il 21 aprile 2026). Usato SOLO dalle 4 landing `/finanziamenti/agevolazioni/*` (Sabatini, MCC, Bando ISI, Iperammortamento). Notifica Resend in copia a `mediocreditofacile@gmail.com` e `mkt@ambicogroup.it` con subject `Nuovo lead Agevolazioni — [fonte]`, header che dichiara la partnership e tabella con i dati calcolo inviati dai calcolatori (importo, tipologia bene, contributo stimato, ecc.). Chiamata Zapier opzionale tramite env var `ZAPIER_WEBHOOK_URL_AGEVOLAZIONI` (oggi vuota: quando verra' creato lo Zap dedicato alla pipeline Pipedrive "Agevolazioni IMC", basta valorizzarla e l'endpoint inizia a chiamarlo). Log separati `form_submitted_agevolazioni` / `lead_rejected_agevolazioni` / `lead_lost_agevolazioni` per tenere i dati della campagna isolabili nei log Vercel. Se Zapier non e' configurato, non conta come errore nel calcolo del `lead_lost`.
- `src/pages/api/cerved.ts` → proxy Cerved API per lookup P.IVA (GET, cache in-memory 24h, CORS per mcf-marotta.netlify.app)
- `src/pages/api/credit-ai.ts` → layer AI credit policy via Claude Haiku (POST, CORS per mcf-marotta.netlify.app)
- Tutte usano `export const prerender = false` per funzionare come serverless functions
- IMPORTANTE: il dominio fa redirect da `mediocreditofacile.it` a `www.mediocreditofacile.it` — usare sempre `www` nelle chiamate fetch dal frontend

## Environment Variables (Vercel)
- `ZAPIER_WEBHOOK_URL` → webhook form contatti MCF standard
- `ZAPIER_WEBHOOK_URL_AGEVOLAZIONI` → webhook Zapier dedicato alla pipeline Pipedrive "Agevolazioni IMC" (partnership Ambico). Predisposto il 21 aprile 2026, valore oggi vuoto: l'endpoint `submit-agevolazioni` salta la chiamata se la variabile non e' valorizzata. Va popolato quando lo Zap dedicato verra' creato.
- `CERVED_CONSUMER_KEY` → API key Cerved (header: `apikey`)
- `ANTHROPIC_API_KEY` → API key Anthropic per layer AI credit policy
- `RESEND_API_KEY` → chiave Resend per notifiche mail dirette dai form (aggiunta il 20 aprile 2026, Fase 1 safety net). Riusata anche da `submit-agevolazioni` per le notifiche a MCF + Ambico.

## Redirect (vercel.json)
- `/agevolazioni/nuova-sabatini-2026` → 301 → `/finanziamenti/agevolazioni/nuova-sabatini-2026`
- `/agevolazioni/fondo-garanzia-mcc` → 301 → `/finanziamenti/agevolazioni/fondo-garanzia-mcc`

## Finanziamenti IFIS (aprile 2026)
Campagna acquisizione lead per finanziamenti bancari IFIS. Struttura:
- `/finanziamenti/` → landing core (chirografario, strutturato, factoring). Form 4 campi: nome, telefono, forma giuridica, importo. Fonte: "finanziamenti-ifis".
- `/finanziamenti/agevolazioni/` → hub indice delle 3 agevolazioni
- `/finanziamenti/agevolazioni/nuova-sabatini-2026` → landing Sabatini con calcolatore (SabatiniCalculator.tsx)
- `/finanziamenti/agevolazioni/fondo-garanzia-mcc` → landing MCC con checker (FondoGaranziaChecker.tsx)
- `/finanziamenti/agevolazioni/bando-isi-inail` → landing Bando ISI Inail (nuova)
- `/grazie-fin` → thank you page finanziamenti (GTM event: form_finanziamenti)
- 5 blog articles: pillar (finanziamenti-pmi-guida-completa), Sabatini, MCC, ISI, cross-tema (combinare)
- Vincoli prodotto IFIS: minimo 50.000 euro, solo societa' di capitali (SRL, SPA, SAPA)
- Logo IFIS autorizzato: public/images/partners/ifis.svg
- Mai nominare IFIS nelle pagine (si dice "finanziamento bancario dedicato")
- Budget Ads: 15 euro/giorno, 4 Ad Group (Finanziamenti, Sabatini, MCC, ISI)
- Navbar: "Finanziamenti PMI" nel dropdown Servizi punta a /finanziamenti/

## Deploy
- Git push su main → Vercel auto-deploy
- Dev locale: npm run dev → http://localhost:4321

## Nota
Il Marotta Tool vive in ~/dev/marotta-tool/ con il suo CLAUDE.md dedicato.
Le API Cerved e credit-ai in src/pages/api/ servono anche il Marotta Tool (CORS abilitato per mcf-marotta.netlify.app).

---

# MCF Ads Engine — Guida operativa

## Approccio
Questo progetto si costruisce con un approccio **learning by doing**.
- Non dare mai per scontato che l'utente sappia dove si trovano i file o come eseguire i comandi
- Indica sempre il percorso completo dei file (es. `/Users/alberto/mediocreditofacile/mcf-ads-engine/`)
- Prima di chiedere di eseguire un comando, spiega cosa fa e cosa ci si aspetta di vedere
- Se qualcosa non va come previsto, fermati e analizza l'errore prima di andare avanti

## Dove si trova cosa
- **Progetto sito web (Astro):** `/Users/alberto/mediocreditofacile/`
- **MCF Ads Engine (da creare):** `/Users/alberto/mediocreditofacile/mcf-ads-engine/`
- **Landing pages JSON:** `/Users/alberto/mediocreditofacile/src/data/landing-pages.json`
- **Documentazione e piani:** `/Users/alberto/mediocreditofacile/docs/superpowers/`
- **Credenziali Google Ads (locale, mai committare):** `/Users/alberto/mediocreditofacile/mcf-ads-engine/google-ads.yaml`
- **Variabili d'ambiente (locale, mai committare):** `/Users/alberto/mediocreditofacile/mcf-ads-engine/.env`

## Come aprire il terminale nella cartella giusta
Quando devi eseguire comandi per il progetto ads engine:
```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
```

## Credenziali necessarie (da configurare una volta)
1. **Google Ads Developer Token** → va in `google-ads.yaml` come `developer_token`
2. **Google OAuth2 Client ID + Secret** → da Google Cloud Console, vanno in `google-ads.yaml`
3. **Google Refresh Token** → generato da `python setup_auth.py` (una volta sola)
4. **Anthropic API Key** → va in `.env` come `ANTHROPIC_API_KEY`
5. **Resend API Key** → va in `.env` come `RESEND_API_KEY`
6. **Email notifiche:** mediocreditofacile@gmail.com → va in `.env` come `NOTIFICATION_EMAIL`

## Account Google Ads
- Account ID: AW-16800748626
- Manager Account: configurato
- Developer Token: già ottenuto (non scrivere il valore qui)

## Regola di auto-aggiornamento (OBBLIGATORIA)

Alla fine di ogni sessione di lavoro, prima di chiudere:

### 1. Aggiorna QUESTO CLAUDE.md

Se la sessione ha modificato qualcosa di strutturale, aggiorna la sezione pertinente di questo file. Esempi:
- Nuovo componente o pagina → aggiorna "Struttura progetto"
- Nuova API route → aggiorna "API Routes"
- Cambio brand (colori, logo, font) → aggiorna "Brand"
- Nuova landing page → aggiorna la lista delle landing e il meccanismo di generazione
- Nuova variabile d'ambiente → aggiorna "Environment Variables"
- Nuovo comportamento dei form → aggiorna le sezioni form

Il CLAUDE.md e' la fonte di verita' per chiunque (umano o AI) lavori sul codice dopo di te. Se resta vecchio, il prossimo reimplementa cose sbagliate.

### 2. Aggiorna le reference Cowork

Se la sessione ha modificato campagne, landing page, o brand:
- Aggiorna `~/Desktop/_AI/knowledge/reference/mediocredito-facile/campagne/context-marketing.md` con le modifiche fatte
- Aggiorna la data "Ultimo aggiornamento" in testa al file
- Se le modifiche riguardano il brand, aggiorna anche `~/Desktop/_AI/knowledge/reference/mediocredito-facile/brand/brand-guidelines.md`

Questo mantiene sincronizzate le reference che Cowork usa per skill, triage e copywriting.
