# Verifica cliente sul simulatore: piano di lavoro

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (scelto: esecuzione nella sessione, Alberto ha detto "vai").

**Goal:** sotto il simulatore di noleggio operativo, due moduli che verificano il cliente finale con la ricerca economica Openapi, mandano il lead ad Alberto e mostrano l'esito su /grazie.

**Architecture:** regole pure e testate in `src/lib/esito-simulatore.ts` (esito, documenti, indicazioni) e `src/lib/mail-simulatore.ts` (corpo della mail); protezioni in `src/lib/guardia-simulatore.ts` su una tabella nuova; endpoint `/api/simulatore-verifica`; isola Preact `VerificaSimulatore.tsx` al posto del vecchio modulo; `/grazie` legge l'esito da `sessionStorage`.

**Tech Stack:** Astro, Preact, Vitest, Openapi (IT-advanced, IT-full), Resend via `inviaMail()`, Neon via `src/lib/db.ts`, `waitUntil` di `@vercel/functions`.

**Spec:** `docs/superpowers/specs/2026-10-24-simulatore-verifica-cliente-design.md`

## Global Constraints

- Verde società di capitali: anni compiuti >= 2, `annoBilancio === annoBilancioAtteso(oggi)`, importo <= 20% del fatturato, utile > 0.
- Verde ditte e società di persone: anni compiuti >= 2.
- Rosso: anni compiuti < 2. Anzianità illeggibile: giallo. Forma sconosciuta: capitali.
- Cessata, in liquidazione, inattiva o non trovata: nessun colore, nessuna scheda.
- Scheda da 0,81 solo su verde, solo cliente finale, dopo contatti validi, se non già in cache.
- Tetto mensile `OPENAPI_TETTO_SIMULATORE` default 20 euro; giornaliero `SIMULATORE_TETTO_GIORNO` default 40 ricerche a pagamento; 10 richieste al minuto per IP.
- Nessun dato personale nell'URL: l'esito passa a /grazie in `sessionStorage`, chiave `mcf_esito_simulatore`, cancellata appena letta.
- Testi: mai "approvato", mai promessa di esito; sempre "Valutazione indicativa sui dati pubblici del registro imprese, non è una delibera."
- Nessun anno scritto a mano.

## Review Focus

1. Partita IVA del cliente uguale a quella del fornitore: si verifica una volta sola e la mail lo segnala.
2. Importo non calcolato nel simulatore: il modulo lo chiede, il server rifiuta senza importo (400 `importo_mancante`).
3. Openapi che non risponde: niente colore, lead consegnato lo stesso, mail che lo dice.
4. Ricerca servita dalla cache: non conta nei tetti.
5. Ritorno su /grazie da un altro modulo del sito: pagina invariata.

---

### Task 1: formaCodice e sorgente `simulatore` in openapi.ts
Files: `src/lib/openapi.ts`, test in `src/lib/openapi-sorgenti.test.ts`.
- `RicercaBase.formaCodice: string | null` da `detailedLegalForm.code` (null nei non trovati).
- `Sorgente` aggiunge `'simulatore'`; `sorgentiVuote`, `sorgenteDaPercorso` la riconoscono; `entroIlTetto` usa `OPENAPI_TETTO_SIMULATORE` (default 20) per gli euro di questa sorgente.
- Test: `sorgenteDaPercorso(['openapi','costi','2026-10','simulatore','x.json'])` vale `'simulatore'`.

### Task 2: regole pure dell'esito
File: `src/lib/esito-simulatore.ts`, test `src/lib/esito-simulatore.test.ts`.
- `classeFormaRicerca(codice, descrizione): 'capitali'|'persone'|'individuale'` (codice via `tipoVisura`, altrimenti parole della descrizione).
- `anniCompiuti(data: string|null, oggi: Date): number|null`.
- `aziendaFerma(stato: string|null): boolean` (cessata, liquidazione, inattiva, scioglimento, fallimento).
- `valutaSimulatore(d: DatiEsito): EsitoSimulatore` con `colore: 'verde'|'giallo'|'rosso'`, `criteri: {chiave, nome, valore, ok}[]`, `indicazioni: string[]`.
- `documentiSimulatore(classe, importo, oggi): string[]`.
- Test con date fisse (24/10/2026): SRL 2025 utile 15% verde; SRL 2024 giallo; SRL perdita giallo; SRL 25% giallo; ditta 5 anni senza bilancio verde; SNC verde; 1 anno rosso; 2 anni esatti verde; data mancante giallo; documenti sotto e sopra 10.000 per le tre classi, con l'anno del bilancio calcolato.

### Task 3: protezioni
Files: `scripts/sql/014-simulatore-verifica.sql`, `src/lib/guardia-simulatore.ts`.
- Tabella `app.simulatore_verifica (id, quando, ip_hash, esito, fonte)`.
- `troppeRichiesteSimulatore(ipHash)`, `ricercheOggiSimulatore()`, `annotaSimulatore()`, `servizioAttivo(): {attivo, motivo}` (tetto euro prudente come la fiera, tetto giorno). Errori del database: si salta, resta il tetto in euro.

### Task 4: mail
File: `src/lib/mail-simulatore.ts`, test `src/lib/mail-simulatore.test.ts`.
- `oggettoMail(l)`, `corpoMail(l): string` puri. Test: oggetto con ragione sociale, importo, colore; corpo con escape dell'HTML e link a /tools/valutazione quando la scheda è ordinata.

### Task 5: endpoint
File: `src/pages/api/simulatore-verifica.ts`.
- POST form-data; trappola `website`; `privacy`; `variante` in `azienda|cliente`; partite IVA con `piva.ts`; contatti con `controllaReferente`; importo > 0.
- Ricerca cliente (e fornitore se diversa), esito, mail, `waitUntil(schedaAzienda(piva, {sorgente:'simulatore'}))` se verde ed entro tetto.
- Risposta: `{ ok, consegnato, esito }` con i soli dati da mostrare.

### Task 6: interfaccia
Files: `src/components/tools/VerificaSimulatore.tsx`, `src/components/tools/verifica-simulatore.css`, `src/pages/tools/simulatore-noleggio-operativo.astro`.
- Due schede, campi della spec, importo/durata/tipologia/canone letti dal simulatore al momento dell'invio. Risposta in `sessionStorage`, poi `/grazie`. Eventi GTM `simulatore_verifica_inviata`.
- Via il vecchio modulo e lo script Zapier.

### Task 7: /grazie
File: `src/pages/grazie.astro`.
- Se c'è `mcf_esito_simulatore`, sostituisce il blocco con esito, numeri, indicazioni, documenti; stili in `<style is:global>`.

### Task 8: verifica e documentazione
- `npm test`, `npm run build`, prova in locale senza spese, aggiornamento `CLAUDE.md`.
