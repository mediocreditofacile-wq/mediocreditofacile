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
- src/pages/tools/arca-energia.astro → area partner Arca Energia (password: `arcaenergia`, localStorage key `mcf_arcaenergia_auth`, noindex). Monta `SimulatoreFotovoltaico` con prop `assicurazioneOpzionale`, `varianteForm="arcaenergia"`, `zonaFissa="sud"`, `abilitaLeasing`, `abilitaAgevolazioni`. Include switch noleggio/leasing, iperammortamento 4.0 e Sabatini 4.0 (la ZES Unica è stata rimossa: chiusa nel registro `AGEVOLAZIONI_STATO`).
- src/pages/tools/age-srl.astro → area partner AGE SRL (password: `age-srl`, localStorage key `mcf_agesrl_auth`, noindex). Stessa struttura di Arca Energia + download preventivo PDF brandizzato MCF.
- src/pages/tools/edilizia-gierre.astro → area partner Edilizia GIERRE SRL (password: `gierreedilizia`, localStorage key `mcf_ediliziagierre_auth`, noindex). Pattern diverso dai partner fotovoltaico: monta `SimulatoreNoleggio` (Grenke) per simulazione canone su attrezzature edili / muletti / mezzi Isuzu, e ha un form dedicato di caricamento pratica con checklist documenti DINAMICA: sotto 10.000 € documenti base; sopra 10.000 € aggiunge reddituali differenziati per forma giuridica (Ditta Individuale/Lavoratore Autonomo → ultime 2 dichiarazioni + situazione contabile 2025; SRL/SPA/SAPA/SNC/SAS/Cooperativa → ultimi 2 bilanci + bilancio definitivo 2025). Form invia a `/api/submit-edilizia-gierre`. Ratio interna (NON esposta in pagina): Master Rent del partner intestato ad Alba Leasing per Cerved 4 con approvazione automatica; le pratiche dei suoi clienti vengono ruotate manualmente da Alberto su ReteRent o PagaRent in base al merito.
- src/pages/tools/simulatore-leasing-lomartire.astro → variante riservata a Lorenzo Lo Martire (password `lorenzo`, localStorage key `mcf_lomartire_auth`, noindex). Aggiunta il 13/05/2026. Monta `SimulatoreLeasing` con `varianteLoMartire`: provvigioni al minimo per ogni partner (prima condizione del listino), spese istruttoria = istruttoria partner + 1,00% × importo (markup Lo Martire). Per Alba in promo Easy Lease il markup sale a 1,20% (l'istruttoria partner e' gia' azzerata dalla campagna). In pagina compaiono due righe separate "Spese istruttoria partner" + "Compenso intermediario"; il PDF al cliente le accorpa in un'unica voce "Spese istruttoria". Compensi configurabili in `COMPENSO_LOMARTIRE_PERC` e `COMPENSO_LOMARTIRE_ALBA_PROMO_PERC` in `src/data/leasing.ts`.
- src/pages/tools/simulatore-leasing-fornitori.astro → variante PUBBLICA per fornitori/segnalatori (no password). Aggiunta il 12/05/2026. Monta `SimulatoreLeasing` con `varianteFornitori`: spread fissato al medio commerciale di ciascun partner (SELLA 2,75% / ALBA 3,00% / CREDEM 2,80%, configurabile su `PartnerLeasing.spreadFornitori` in `src/data/leasing.ts`), nessun riferimento alla provvigione (nemmeno in pagina), nessun select per scegliere lo spread. Stesso PDF brandizzato MCF "client-safe" della variante interna. URL pubblico ma noindex: si condivide via WhatsApp/email ai rivenditori. Include la promo Alba Easy Lease (vedi sezione dedicata sotto).
- src/pages/tools/stilo.astro → portale partner STILO S.R.L. (Paolo Bonardi, responsabile commerciale). Login con EMAIL + password (user: `bonardipaolo@gmail.com`, password: `stilosrl`, localStorage key `mcf_stilo_auth`, noindex). Aggiunto il 23/07/2026 clonando il portale Expo Energia: stessa struttura (dashboard a card, simulatore, form pratica con upload documenti, lista richieste con stato), ma monta `SimulatorePortale` con **quattro prodotti a confronto** selezionabili da menu a tendina: Grenke **Pioneer** (durate 24-60) i tre prodotti **BCC Rent&Lease** — locazione operativa, locazione finanziaria (leasing) e finanziamento finalizzato (`classeBcc={3}` telecomunicazioni — durate 18-60) — e la **campagna BCC tasso zero a 10 mesi**, documento extra in checklist "Offerta / preventivo al cliente finale", submit → `/api/submit-stilo`. Ratio interna (NON esposta in pagina): STILO e' attivabile su due canali, BCC Rent & Lease (rapida su telefonia e server, esclude Horeca ed edilizia) e Grenke/ReteRent tabella Pioneer; la rotazione la decide Alberto per categoria cliente e merito. Censimento ReteRent inviato a Giada il 22/07/2026 (manca la CI del legale rappresentante Angela Meniconi).
- src/pages/tools/expo-energia.astro → portale partner Expo Energia Srl (Massimo Palermo). Login con EMAIL + password (user: `massimopalermo10@gmail.com`, password: `expoenergia`, localStorage key `mcf_expoenergia_auth`, noindex). Aggiunto il 07/07/2026: replica in casa MCF del portale dealer ReteRent (reterent.difrently.com/dealer/dashboard) con dashboard a card (Simulazioni/Preventivi/Richieste/Documenti), simulatore `SimulatoreExpoEnergia` (Preact island) con due tabelle coefficienti — ESG fotovoltaico (da `src/data/esg.ts`, nuovo file dati condiviso) e Pioneer hardware/casse (da `src/data/grenke.ts`) — e doppio calcolo in stile ReteRent: dal prezzo di vendita alla griglia canoni su tutte le durate (ESG 24-84 con disponibilita' per fascia, Pioneer 24-60) e dal canone al prezzo (solve per fascia). Stampa client-safe brandizzata MCF via window.print (area `.see__print` visibile solo in stampa). Form caricamento pratica con checklist documenti dinamica (stessa logica GIERRE + preventivo fornitore sempre richiesto), **upload documenti** (PDF/immagini/p7m/Office, max 25 MB a file, drag&drop) direttamente dal browser allo store Vercel Blob privato `mcf-pratiche` via `/api/blob-upload` (bypassa il limite 4,5 MB delle serverless), e **sezione "Le tue richieste"**: lista pratiche con documenti scaricabili e stato (Ricevuta / In lavorazione / In delibera / Approvata / Declinata). Il gate accetta DUE account: partner (Massimo) e admin (email `mediocreditofacile@gmail.com` + chiave `EXPO_PORTAL_ADMIN_KEY`, verificata server-side); l'admin vede un select di stato per riga e l'aggiornamento arriva al partner entro ~1 minuto (cache CDN dei blob al minimo consentito, 60s). Submit → `/api/submit-expo-energia`. Ratio interna (NON esposta in pagina): censimento ReteRent/Grenke di Expo Energia in corso (scheda in PROGETTI/Clienti/Expo Energia/); nel frattempo le pratiche arrivano a MCF che le carica sui portali (ReteRent ESG/Pioneer o PagaRent) in base al merito.
- **Motore condiviso dei portali partner** (Expo Energia, Stilo, prossimi): `src/data/portali-partner.ts` e' il registro server-side (slug, ragione sociale, password partner, prefisso id pratica) usato dalle API; `src/lib/pratiche-partner.ts` contiene tutta la logica di submit (id pratica, record JSON su Blob, mail Resend con link ai documenti, inoltro Zapier), cosi' gli endpoint `/api/submit-<slug>.ts` sono involucri di 10 righe che passano partner, documenti extra della checklist e nota di lavorazione interna. Il simulatore e' `src/components/tools/SimulatorePortale.tsx` (ex SimulatoreExpoEnergia) con prop `tabelle` (`'esg'`, `'pioneer'`, `'bcc-lo'`; con una sola tabella lo switch si nasconde), `partner`, `etichetteBene` e `classeBcc`. **Per aggiungere un dealer**: voce nel registro + pagina `/tools/<slug>.astro` (clone di stilo.astro) + `/api/submit-<slug>.ts` + slug nella lista noindex della sitemap + card nell'hub `/tools/`. Le API `blob-upload`, `pratiche-expo` e `pratica-doc` sono gia' multi-partner: ogni partner vede e scarica solo la propria cartella `pratiche/<slug>/`, l'admin vede tutto. NOTA: la password del gate vive nello script della singola pagina (non nel registro) per non esporre nel bundle di un partner le credenziali degli altri; il registro resta server-side.
- **Coefficienti BCC Rent&Lease** (`src/data/bcc.ts`, 23/07/2026): BCC quota diversamente da Grenke, per **classe di rischio del bene** oltre che per durata e fascia di importo, e offre **tre prodotti**: locazione operativa (`lo`), locazione finanziaria/leasing (`lf`) e finanziamento finalizzato (`ff`). I coefficienti NON esistono come tabella nel planner `#_BCCRLplanner_LO+LF+FF_260226.xlsx`: escono dal modello (provvista → TIR → cash flow). Sono stati estratti ricalcolando l'intero planner in Python con la libreria `formulas` (le poche formule di sola visualizzazione vengono congelate al loro valore perche' il parser non le digerisce). **Per rigenerarli quando cambia il planner**: `python3 scripts/genera-coefficienti-bcc.py [percorso-planner]`, che rifa' tutte le griglie e si ferma da solo se il caso noto di verifica non torna. Config: canone/rata fissa mensile, anticipo primo canone, provvigione 3%, pagamento fornitore 2 giorni, ristorno spese SI, riscatto 1% su LO/LF e nessuno su FF. **Validazione**: 75.000 € a 60 mesi classe 3 in LO danno 1.540,06 come il preventivatore, e l'intera griglia LO coincide cifra per cifra con quella validata a mano da Alberto. Il coefficiente e' **costante dentro ogni fascia** (verificato su due campioni per fascia), quindi le fasce sono scaglioni netti. Il **finanziamento finalizzato non dipende dalla classe di rischio** (il bene e' subito del cliente). Le **spese di istruttoria sono una tantum** e si sommano a parte (`bccSpeseIstruttoria()`), sul FF si aggiunge l'**imposta sostitutiva** 2,5‰ oltre i 18 mesi (`bccImpostaFinanziamento()`). Griglie leggibili e note operative: `~/Desktop/AREE/Nord_Est_Group/BCC/COEFFICIENTI_BCC_LOLF.md`. **Campagna tasso zero** (`BCC_TASSO_ZERO`, dal file `# BCCRL_NEWCAMPAIGN'260430.xlsx`, in vigore dal 01/04/2026): TAN azzerato per il cliente, rata = imponibile / 10, costo a carico del FORNITORE pari al 5,30% dell'imponibile (costante, verificato) piu' 75 € di istruttoria. Implementata **solo a 10 mesi**, l'unica durata del planner di campagna: per le altre il contributo cambia e BCC non l'ha comunicato. Nel simulatore compare un riquadro **"Il conto per te, come fornitore"** con prezzo di vendita, contributo, istruttoria e **netto bonificato da BCC** (es. su 12.000 € il cliente paga 1.200/mese e al fornitore restano 11.289 €): serve al partner per decidere se proporre la campagna e quanto caricare sul prezzo. Il riquadro e' a schermo ma NON nella stampa per il cliente finale, dove compare solo "tasso zero, nessun interesse a carico del cliente". Per sospenderla: `attiva: false`.
- src/pages/tools/econocom-pa.astro → area partner Arca Energia per il **noleggio operativo Econocom destinato alla Pubblica Amministrazione** (password: `gianfranco`, localStorage key `mcf_econocompa_auth`, noindex). Aggiunto il 26/05/2026 su richiesta di Gianfranco (commerciale Arca Energia) per le sue interlocuzioni con comuni, ASL, aziende ospedaliere e municipalizzate (parcheggi fotovoltaici, riqualificazione energetica, illuminazione). Monta `SimulatoreEconocomPA` (Preact island) con coefficienti su 4 fasce di investimento per durata 60 mesi (formula `rata = importo × coefficiente`, niente istruttoria, niente riscatto, niente IVA — rata indicativa). Importo minimo 150.000 €. Coefficienti forniti da Luca Silvestrin (Econocom) e centralizzati in `src/data/econocom-pa.ts`. **Include business plan opzionale** (toggle "Confronta con la bolletta dell'ente") che riusa il modello energetico di Arca Energia estratto in `src/data/bp-fotovoltaico.ts`: input potenza kWp + bolletta €/mese + accumulo + profilo ente (ospedale 24/7, ufficio, presidio territoriale), output card "La rata si sostiene con la bolletta?" (bolletta − autoconsumo + rata − immissione = costo netto, differenza vs bolletta attuale) + card produzione/autoconsumo/autosufficienza. Zona di irraggiamento forzata a Sud Italia. Niente Iper/Sabatini/ZES (la PA non li sfrutta con questo modello). La pagina espone in evidenza i **tre paletti operativi della PA** (cessione del contratto a societa' di locazione, fuori codice degli appalti, accettazione condizioni generali) e include form di caricamento progetto con conferma esplicita dei tre vincoli. Lead vanno a `/api/submit-econocom-pa` per essere inoltrati poi a Luca per la quotazione su misura. Estendibilita': per aggiungere altre durate (es. 72/84 mesi) o nuove fasce modificare `src/data/econocom-pa.ts`; per cambiare zona di irraggiamento esporre una prop sul componente.
- src/pages/tools/simulazione-leasing.astro → strumento INTERNO MCF (password: `mcf-leasing`, localStorage key `mcf_leasing_auth`, noindex). Aggiunto il 12/05/2026 dopo reverse engineering del quotatore Lease for Business di Affida (SELLA, ALBA, CREDEM). Monta `SimulatoreLeasing` (Preact island) con switch tra i tre partner per leasing strumentale generico. Spread variabile da select (8 condizioni SELLA, 10 ALBA, 14 CREDEM — su ALBA cambiano per durata: 36m vs 60-84m). Agevolazioni cumulabili (Nuova Sabatini ord/4.0 con formula MISE su VAN interessi, iperammortamento L. 199/2025 parametrizzato per tipologia bene). La ZES Unica è stata rimossa perché chiusa: lo stato di ogni agevolazione è nel registro `AGEVOLAZIONI_STATO` (`src/data/leasing.ts`), i toggle compaiono solo se `agevolazioneAttiva` passa. Pagina = uso interno: Alberto vede TUTTO incluso provvigione caricata sulla rata. PDF generato è invece "client-safe": brandizzato MCF, nessun riferimento al partner finanziario, nessuna provvigione, tasso del piano OPZIONALE via toggle. Matematica validata contro 18 simulazioni del quotatore Affida (6 SELLA + 6 ALBA + 6 CREDEM) con errore massimo 0,42€ per rate da centinaia di euro.
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

## Simulatore Leasing — modello matematico
Il componente `src/components/tools/SimulatoreLeasing.tsx` calcola la rata leasing applicando due modelli distinti riconducibili alle banche partner di Affida:
- **Sella Leasing × Affida** e **Credem Leasing** (modello `capitale-gonfiato`): il quotatore Affida espone un "Tasso leasing" più alto come display marketing, ma il calcolo reale usa Spread + Euribor 3M sul capitale gonfiato della provvigione. SELLA: importo min 9.000 €, spese istruttoria 380 €, incasso 6 €, provvigione fissa 1% su 8 livelli di spread. CREDEM: importo min 5.000 €, spese istruttoria 350 €, incasso 5 €, provvigione VARIABILE per condizione (1% → 4,25% su 14 livelli). Entrambi: il cliente paga la provvigione attraverso una rata leggermente più alta.
- **Alba Leasing** (modello `standard`): tasso leasing = Spread Lordo + Euribor 3M, formula francese standard sul capitale finanziato; provvigione (60% sullo spread lordo, 30% per durate ≤48 mesi) è esterna al calcolo cliente. Importo min 5.000 €, spese istruttoria 400 €, incasso 5 €. Le condizioni cambiano per durata: 36m vs 60-84m hanno listini distinti.

Tutti e tre i partner: rata francese su (durata - 1) rate (il primo mese è l'anticipo), riscatto attualizzato e sottratto dal capitale. Validato contro 18 simulazioni del quotatore Lease for Business di Affida (6 SELLA + 6 ALBA + 6 CREDEM) con errore max 0,42 € su rate di centinaia di euro.

Destinazione d'uso: STRUMENTO INTERNO. La pagina mostra ad Alberto tutti i numeri (provvigione caricata sulla rata visibile per modello capitale-gonfiato), il PDF generato è invece "client-safe": brandizzato MCF, nessun riferimento al partner finanziario, nessuna provvigione esposta, NESSUNA indicazione del tasso applicato. La rata mostrata è etichettata come "indicativa" e accompagnata da una nota esplicita ("La rata definitiva sarà assegnata in base al rating di merito creditizio del cliente, una volta esaminata la documentazione") in evidenza sotto il box rata.

Prop `varianteLoMartire` (boolean, default false): variante riservata a Lorenzo Lo Martire (intestatario delle pratiche tramite il simulatore dedicato `/tools/simulatore-leasing-lomartire`). Effetti:
- Provvigioni al MINIMO per ogni partner: usa sempre la prima condizione del listino applicabile alla durata corrente (la riga con spread minimo). Nessuna scelta utente: il select condizione e' nascosto.
- Spese istruttoria mostrate = istruttoria partner standard + `COMPENSO_LOMARTIRE_PERC` × importo (default 1,00%, sommato).
- Per Alba in promo Easy Lease: il markup sale automaticamente a `COMPENSO_LOMARTIRE_ALBA_PROMO_PERC` (default 1,20%) e la spesa partner e' azzerata dalla promo.
- Nel breakdown della pagina due righe separate ("Spese istruttoria partner" + "Compenso intermediario X% sull'importo" in evidenza viola); nel PDF cliente le voci sono accorpate in una unica riga "Spese istruttoria" con la somma, senza distinzione.
- Come la variante fornitori: nasconde provvigione, spread e tasso del piano sia in pagina sia nel PDF.

Prop `varianteFornitori` (boolean, default false): attiva la modalità per pagina pubblica destinata ai fornitori/rivenditori. Effetti:
- Nasconde la riga "Provvigione caricata sulla rata" anche in pagina (i fornitori non devono mai vederla)
- Sostituisce il select "Condizione (spread)" con un display read-only che mostra lo spread medio commerciale del partner
- Imposta automaticamente la condizione corrispondente a `PartnerLeasing.spreadFornitori` (cercata nelle condizioni applicabili alla durata corrente; fallback a quella con spread immediatamente superiore se non c'è match esatto). Si aggiorna al cambio di partner o durata.
- Spread medi commerciali: SELLA 2,75% / ALBA 3,00% / CREDEM 2,80%. Modificabili in `src/data/leasing.ts` su ogni `PartnerLeasing`.

### Promo Alba Easy Lease (campagna a tempo)
Configurazione in `ALBA_EASY_LEASE` in `src/data/leasing.ts`. Comunicazione Help Desk Alba di maggio 2026: condizioni dedicate alla rete segnalatori MCF.
- Scadenza: 30 giugno 2026
- Importo max: 200.000 €
- Prodotti: strumentale (per ora la nostra unica tipologia bene)
- Override automatico quando ALBA + importo eligibile: anticipo 0%, spese istruttoria 0 €
- Cumulabile con Sabatini, MCC – Fondo di Garanzia, Crediti d'imposta
- Funzione `easyLeaseEligibile(partner, importo, tipologia)` ritorna true quando va applicata
- UI: badge arancione "Promo Easy Lease attiva" sul bottone partner Alba; banner promo evidenziato (palette fwarm) sopra i pannelli con toggle per disattivarla manualmente; righe "Anticipo / Spese istruttoria" in evidenza nel breakdown; banner di avviso "Sopra soglia" quando ALBA + importo > 200k
- Nel PDF: blocco promo arancione sopra la tabella se attiva
- Quando la promo termina (o si vuole sospenderla): mettere `attiva: false` in `ALBA_EASY_LEASE`

Agevolazioni in `src/data/leasing.ts`:
- `calcolaSabatiniMise(costo, tipo)` — formula MISE su VAN interessi: tasso 2,75% (ordinaria) o 3,575% (4.0), 60 mesi, 6 quote annuali. Restituisce contributo totale, annuo e mensile.
- `calcolaIperammortamentoBene(costo, tipologia)` — versione parametrizzata per tipologia bene (oggi solo 'strumentale-generico' = 15 anni, coeff 6,67%; estendibile). Resta `calcolaIperammortamento` legacy per FV (9 anni hardcoded).
- `calcolaZES(costo, regione, dimensione)` — credito d'imposta su ZES Unica, soglia 200k. La funzione resta ma la ZES è OGGI CHIUSA (vedi registro sotto): non compare in nessun simulatore.

### Registro stato agevolazioni — check automatico (luglio 2026)
`AGEVOLAZIONI_STATO` in `src/data/leasing.ts` è la fonte di verità su quali agevolazioni sono aperte. Ogni voce (`iperammortamento`, `sabatini`, `zes`) ha `{ attiva: boolean, scadenza?: 'YYYY-MM-DD', nota?: string }`. La funzione `agevolazioneAttiva(key)` ritorna true solo se `attiva === true` E (nessuna `scadenza` o scadenza non ancora superata); il controllo sulla data gira nel browser a ogni visita, quindi la chiusura è automatica. Entrambi i simulatori (`SimulatoreLeasing` e `SimulatoreFotovoltaico`) mostrano ogni toggle agevolazione solo se `agevolazioneAttiva` passa, e ne guardano anche il calcolo. Per chiudere un'agevolazione: `attiva: false` (subito) o `scadenza` (alla data). Per riaprirla: `attiva: true`. Stato attuale: iperammortamento e Sabatini aperti, **ZES chiusa (`attiva: false`, finestra credito d'imposta esaurita)**.

Costanti `EURIBOR_3M` e `EURIBOR_3M_DATA` da aggiornare manualmente quando il valore di mercato cambia in modo significativo.

Cumulabilità: Sabatini ordinaria/4.0 mutuamente esclusive (è la stessa misura, scelta tipo dentro il toggle); iperammortamento cumulabile con tutto. La regola ZES/Sabatini non cumulabili resta cablata nei componenti ma è inerte finché la ZES è chiusa.

## Architettura landing page
Le landing dinamiche si generano da landing-pages.json. Per creare una nuova landing basta aggiungere un oggetto al JSON con: slug, title, subtitle, benefits (array 3 oggetti), ctaText. Il template [slug].astro fa il resto.

**Campi opzionali di personalizzazione (JSON):**
- `valueTitle`, `valueText`, `valueText2` → personalizzano la sezione Value Proposition
- `formHeading`, `formSubheading`, `formCta` → se tutti e tre valorizzati, il template aggiunge un secondo ContactForm dopo i Benefits (form intermedio) e personalizza anche il form finale con gli stessi valori. Serve per landing di conversione dove il CTA del Hero promette qualcosa di specifico (es. "Calcola il tuo canone") e il form ne è la porta di ingresso.

Le 6 landing fotovoltaico (`noleggio-fotovoltaico-*`) sono state DISMESSE il 2 giugno 2026 e consolidate nel pillar organico `/noleggio-operativo-fotovoltaico` (vedi sotto). Erano landing di conversione per la campagna Ads fotovoltaico (ora spenta); in organico si cannibalizzavano (sei pagine quasi gemelle sulla stessa query) e Google non le indicizzava. I sei vecchi slug fanno 301 al pillar (vedi sezione Redirect). I numeri di riferimento del modello (impianto 30 kW, canone 526 €/mese, bolletta risparmiata 759 €/mese, +233 €/mese) vivono ora nel pillar.

Le altre landing da JSON (noleggio-operativo, leasing-strumentale, finanziamenti-pmi, diventa-partner, finanza-veloce, noleggio-operativo-ristorazione) usano solo i campi base e mantengono il form generico in fondo pagina.

Le landing finanziamenti e agevolazioni sono pagine Astro dedicate (non da JSON) con CSS scoped e form custom.

**Pagine SEO dedicate (giugno 2026, non da JSON).** Cluster organico costruito sui search terms reali dell'account Ads (non su Semrush). Tutte con `Layout`, navbar completa, FAQ + schema FAQPage, schema servizio, canonical www, campo `fonte`, ContactForm. Linkate dal footer.
- `src/pages/societa-di-noleggio-operativo.astro` → `/societa-di-noleggio-operativo`. Pagina prodotto sul posizionamento hub multi-società (intercetta "società di noleggio operativo", "società finanziarie per noleggio operativo").
- `src/pages/noleggio-operativo-grenke.astro` → `/noleggio-operativo-grenke`. Cattura la ricerca brand "noleggio operativo grenke" posizionando MCF come CANALE Grenke (broker indipendente), NON come alternativa: Grenke è partner. Niente pagine analoghe su Peac Solutions/Johix (decisione di Alberto: brand sensibili, non toccare).
- `src/pages/noleggio-operativo-fotovoltaico.astro` → `/noleggio-operativo-fotovoltaico`. Pillar organico end-user che ha sostituito le 6 landing Ads: confronto bolletta vs rata, sei vantaggi (zero anticipo, fuori bilancio, canone fisso, chiavi in mano, tetto, deducibilità), FAQ. Linka al simulatore fotovoltaico e ai blog fotovoltaico (cluster da rinforzare).
- Il simulatore `/tools/simulatore-noleggio-operativo` è stato rafforzato (FAQ + schema FAQPage e WebApplication, campo `fonte`).
- Fix SEO globale: `ToolLayout.astro` ora ha canonical su www (era apex, in conflitto con sitemap).
- Sitemap (`astro.config.mjs`): aggiunto `filter` che esclude dalla sitemap le pagine `noindex` (partner riservati `/tools/*` + thank-you page), prima ci finivano mandando segnali in conflitto.

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
- `src/pages/api/submit-econocom-pa.ts` → endpoint dedicato all'area Econocom PA (`/tools/econocom-pa`), aggiunto il 26 maggio 2026. Riceve i dati del progetto da segnalare ad Econocom per la Pubblica Amministrazione (ente, tipo intervento, importo previsto, descrizione) + tre checkbox di conferma vincoli operativi (cessione contratto, fuori codice appalti, accettazione condizioni generali). Manda mail Resend dettagliata a `mediocreditofacile@gmail.com` con subject `Nuovo progetto Econocom PA — [Ente] — [Importo]`, evidenziando in rosso i vincoli non confermati. Inoltra a Zapier su `ZAPIER_WEBHOOK_URL` (con `nome` reso parlante: "Ente — Econocom PA (Arca Energia)" per Pipedrive). Log separati `form_submitted_econocompa` / `form_rejected_econocompa` / `lead_lost_econocompa`. Validazione minima: serve almeno `ente_nome` + uno tra `telefono` ed `email`.
- `src/pages/api/submit-edilizia-gierre.ts` → endpoint dedicato all'area pratiche di Edilizia GIERRE SRL (`/tools/edilizia-gierre`), aggiunto il 6 maggio 2026. Riceve i dati pratica dal partner (cliente finale + bene da noleggiare) e manda mail Resend dettagliata a `mediocreditofacile@gmail.com` con subject `Nuova pratica Edilizia GIERRE — [Ragione Sociale] — [Importo]`: tabelle separate per dati cliente, bene, note del partner e checklist documenti calcolata server-side via `buildChecklist()` (replica esattamente la logica della checklist mostrata in pagina). Inoltra a Zapier su `ZAPIER_WEBHOOK_URL` (con `nome` reso parlante: "Ragione sociale — Edilizia GIERRE (partner)" per Pipedrive). Log separati `form_submitted_edilizia` / `form_rejected_edilizia` / `lead_lost_edilizia`. Validazione minima: serve almeno `ragione_sociale` + uno tra `telefono` ed `email`.
- `src/pages/api/submit-expo-energia.ts` → endpoint dedicato al portale partner Expo Energia Srl (`/tools/expo-energia`), aggiunto il 7 luglio 2026. Clone adattato di submit-edilizia-gierre: riceve i dati pratica (cliente finale + tipologia/bene/importo/durata/canone simulato) e manda mail Resend dettagliata a `mediocreditofacile@gmail.com` con subject `Nuova pratica Expo Energia — [Ragione Sociale] — [Importo]`, con checklist documenti calcolata server-side (base + preventivo fornitore, reddituali sopra 10.000 € per forma giuridica). Inoltra a Zapier su `ZAPIER_WEBHOOK_URL` (`nome`: "Ragione sociale — Expo Energia (partner)"). Assegna un id pratica `EE-AAAAMMGG-HHMMSS` e salva il record JSON su Vercel Blob (`pratiche/expo-energia/<id>/pratica.json`, store privato) per alimentare la lista richieste del portale; la mail include i link di download dei documenti allegati (via `/api/pratica-doc?k=<chiave admin>`). Log separati `form_submitted_expoenergia` / `form_rejected_expoenergia` / `lead_lost_expoenergia`. Validazione minima: `ragione_sociale` + uno tra `telefono` ed `email`.
- `src/pages/api/submit-stilo.ts` → endpoint del portale STILO (`/tools/stilo`), aggiunto il 23 luglio 2026. Involucro sottile su `src/lib/pratiche-partner.ts`: passa il partner Stilo, il documento extra "Offerta / preventivo al cliente finale" e la nota di lavorazione (BCC Rent & Lease oppure Grenke/ReteRent Pioneer). Log `form_submitted_stilo` / `form_rejected_stilo` / `lead_lost_stilo`.
- `src/pages/api/blob-upload.ts` → genera i token per l'upload client-side dei documenti pratica su Vercel Blob (SDK `@vercel/blob/client`, `handleUpload`). Autorizzazione via `clientPayload.auth` (password partner o chiave admin), path ammessi solo sotto `pratiche/expo-energia/`, max 25 MB a file, content types documentali. I file NON passano dalla serverless: il browser carica direttamente sullo store.
- `src/pages/api/pratiche-expo.ts` → lista e stato delle pratiche dei portali partner (nome storico: serve TUTTI i partner, non solo Expo Energia). Query `?partner=<slug>` su GET e campo `partner` nel body della POST; senza parametro risponde su Expo Energia per retrocompatibilita' con le pagine gia' in cache. GET = lista record (bearer: password partner o chiave admin; risponde anche `ruolo`, usato dal gate per verificare la chiave admin). POST = aggiorna stato (solo admin). Stati: Ricevuta / In lavorazione / In delibera / Approvata / Declinata.
- `src/pages/api/pratica-doc.ts` → download di un documento dallo store privato: proxy autenticato (bearer partner/admin, oppure `?k=<chiave admin>` per i link nelle mail). Solo path sotto `pratiche/expo-energia/`.
- `src/pages/api/cerved.ts` → proxy Cerved API per lookup P.IVA (GET, cache in-memory 24h, CORS per mcf-marotta.netlify.app)
- `src/pages/api/credit-ai.ts` → layer AI credit policy via Claude Haiku (POST, CORS per mcf-marotta.netlify.app)
- Tutte usano `export const prerender = false` per funzionare come serverless functions
- IMPORTANTE: il dominio fa redirect da `mediocreditofacile.it` a `www.mediocreditofacile.it` — usare sempre `www` nelle chiamate fetch dal frontend

## Environment Variables (Vercel)
- `ZAPIER_WEBHOOK_URL` → webhook form contatti MCF standard
- `ZAPIER_WEBHOOK_URL_AGEVOLAZIONI` → webhook Zapier dedicato alla pipeline Pipedrive "Agevolazioni IMC" (partnership Ambico). Predisposto il 21 aprile 2026, valore oggi vuoto: l'endpoint `submit-agevolazioni` salta la chiamata se la variabile non e' valorizzata. Va popolato quando lo Zap dedicato verra' creato.
- `CERVED_CONSUMER_KEY` → API key Cerved (header: `apikey`)
- `ANTHROPIC_API_KEY` → API key Anthropic per layer AI credit policy
- `BLOB_READ_WRITE_TOKEN` → token dello store Vercel Blob privato `mcf-pratiche` (creato il 7 luglio 2026 via CLI, collegato al progetto: la env e' auto-gestita da Vercel su prod/preview/dev; in locale sta in `.env.local`). Usato da blob-upload, pratiche-expo, pratica-doc e submit-expo-energia.
- `EXPO_PORTAL_ADMIN_KEY` → chiave admin del portale Expo Energia (login di Alberto sul gate + autorizzazione update stato + link download nelle mail). Impostata su prod/preview/dev il 7 luglio 2026; valore anche in `.env.local`.
- `RESEND_API_KEY` → chiave Resend per notifiche mail dirette dai form (aggiunta il 20 aprile 2026, Fase 1 safety net). Riusata anche da `submit-agevolazioni` per le notifiche a MCF + Ambico.

## Redirect (vercel.json)
- `/agevolazioni/nuova-sabatini-2026` → 301 → `/finanziamenti/agevolazioni/nuova-sabatini-2026`
- `/agevolazioni/fondo-garanzia-mcc` → 301 → `/finanziamenti/agevolazioni/fondo-garanzia-mcc`
- `/noleggio-fotovoltaico-zero-anticipo` → 301 → `/noleggio-operativo-fotovoltaico`
- `/noleggio-fotovoltaico-no-debito` → 301 → `/noleggio-operativo-fotovoltaico`
- `/noleggio-fotovoltaico-canone-fisso` → 301 → `/noleggio-operativo-fotovoltaico`
- `/noleggio-fotovoltaico-senza-burocrazia` → 301 → `/noleggio-operativo-fotovoltaico`
- `/noleggio-fotovoltaico-breve-termine` → 301 → `/noleggio-operativo-fotovoltaico`
- `/noleggio-fotovoltaico-tetto-affitto` → 301 → `/noleggio-operativo-fotovoltaico`

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
