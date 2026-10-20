-- Settore "distinta" e prefiltro (20/10/2026).
--
-- Nasce con Led Office (Emme 2 Servizi) sul motore (spec mcf_spec-ledoffice-motore_v1):
-- il commerciale compone una distinta di beni dal catalogo, il cliente passa da un
-- prefiltro a quattro esiti e il canale di quotazione (Econocom, Grenke, Pagarent)
-- lo sceglie il motore, mai l'agente. I default lasciano Duplex, Fas Italia, il demo
-- e Green-Go esattamente come sono: tutte le colonne nuove sono facoltative.
--
-- Il settore non ha un check (008 lo lascia libero): 'distinta' non chiede niente.
-- Il check di regole_semaforo invece si allarga a 'prefiltro'.
--
-- canale e riservato (su proposta e pratica) li legge solo l'admin MCF: le query di
-- storico e pratiche per referente e agente selezionano colonne esplicite e non le
-- prendono. Vale anche per le tre tabelle in fondo: clienti segnalati da MCF, pratiche
-- lavorate fuori dal portale e storico dei prezzi del catalogo non escono mai verso
-- il commerciale. Tutto idempotente: rilanciare il file non fa danni.

-- Configurazione per carrozzeria (jsonb, chiavi in camelCase: src/lib/motore/config-distinta.ts)
ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS canali jsonb;
ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS societa_fornitrice jsonb;
ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS checklist jsonb;
ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS categorie jsonb;

ALTER TABLE app.carrozzeria DROP CONSTRAINT IF EXISTS carrozzeria_regole_semaforo_chk;
ALTER TABLE app.carrozzeria
  ADD CONSTRAINT carrozzeria_regole_semaforo_chk CHECK (regole_semaforo IN ('credit-policy', 'locatore', 'prefiltro'));

-- Segnali che il server ha letto alla ricerca (capitale sociale, addetti, bilanci con ricavi...)
ALTER TABLE app.ricerca_merito ADD COLUMN IF NOT EXISTS segnali jsonb;

-- Canale scelto dal motore e percorso della proposta per il locatore: solo admin
ALTER TABLE app.proposta ADD COLUMN IF NOT EXISTS canale text;
ALTER TABLE app.proposta ADD COLUMN IF NOT EXISTS riservato jsonb;
ALTER TABLE app.pratica ADD COLUMN IF NOT EXISTS canale text;
ALTER TABLE app.pratica ADD COLUMN IF NOT EXISTS riservato jsonb;

-- Una riga a ogni cambio di prezzo o di validita' di una voce del catalogo,
-- dal Pannello MCF o dall'import. Il seed scrive la prima.
CREATE TABLE IF NOT EXISTS app.catalogo_storico (
  id               bigserial PRIMARY KEY,
  fornitore_slug   text NOT NULL REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  codice           text NOT NULL,
  prezzo           numeric(12,2) NOT NULL,
  valido_fino      date,
  registrato       timestamptz NOT NULL DEFAULT now(),
  da_utente        text
);

CREATE INDEX IF NOT EXISTS catalogo_storico_voce_idx ON app.catalogo_storico (fornitore_slug, codice, registrato DESC);

-- Clienti che MCF ha segnato a mano. 'blocco' = non lavorabile dal portale,
-- 'rosso' = il prefiltro esce rosso. La gestisce solo l'admin MCF; la leggono
-- soltanto le carrozzerie con regole prefiltro.
CREATE TABLE IF NOT EXISTS app.cliente_segnalato (
  piva             text PRIMARY KEY,
  ragione_sociale  text,
  motivo           text NOT NULL CHECK (motivo IN ('insoluto', 'sofferenze', 'altro')),
  effetto          text NOT NULL CHECK (effetto IN ('blocco', 'rosso')),
  nota             text,
  creato           timestamptz NOT NULL DEFAULT now(),
  da_utente        text
);

-- Pratiche che MCF ha lavorato fuori dal portale. Servono alla regola "pratica
-- recente": la stessa partita IVA negli ultimi sei mesi.
CREATE TABLE IF NOT EXISTS app.pratica_esterna (
  id               bigserial PRIMARY KEY,
  piva             text NOT NULL,
  ragione_sociale  text,
  fornitore_slug   text,
  canale           text,
  data             date NOT NULL,
  esito            text,
  importo          numeric(12,2),
  fonte            text,
  creato           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pratica_esterna_piva_idx ON app.pratica_esterna (piva, data DESC);
