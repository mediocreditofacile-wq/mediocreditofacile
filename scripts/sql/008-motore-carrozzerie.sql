-- Motore dei portali fornitore: un solo portale, una carrozzeria per fornitore.
--
-- Il fornitore resta quello di app.fornitore (organizzazione Better Auth, slug,
-- prefisso, listino del noleggio, marchio). Una riga in app.carrozzeria dice che
-- quel fornitore lavora sul motore e come: settore, partner del leasing, soglia
-- sotto cui il leasing non si propone, budget mensile delle ricerche.
-- Green-Go ha la riga in app.fornitore ma non qui: resta sul suo portale.

CREATE TABLE IF NOT EXISTS app.carrozzeria (
  slug             text PRIMARY KEY REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  -- 'fotovoltaico' accende il business plan energetico; 'generico' no
  settore          text NOT NULL DEFAULT 'generico',
  -- Etichetta del bene a video e nei documenti, es. "Impianto fotovoltaico"
  etichetta_bene   text NOT NULL DEFAULT 'Bene strumentale',
  -- Partner del leasing: sella | alba | credem (src/data/leasing.ts)
  partner_leasing  text NOT NULL DEFAULT 'alba',
  -- Sotto questo imponibile il leasing non si propone (0 = sempre)
  soglia_leasing   numeric(12,2) NOT NULL DEFAULT 0,
  -- Euro di ricerche Openapi a pagamento nel mese, per questo fornitore soltanto
  tetto_mese_euro  numeric(8,2) NOT NULL DEFAULT 30,
  -- Fornitore dimostrativo: "catalogo dimostrativo" a video e nei PDF
  demo             boolean NOT NULL DEFAULT false,
  -- Documenti in piu' nella checklist della pratica, oltre a quelli di legge
  documenti_extra  jsonb NOT NULL DEFAULT '[]'::jsonb,
  creato           timestamptz NOT NULL DEFAULT now(),
  aggiornato       timestamptz NOT NULL DEFAULT now()
);

-- Catalogo del fornitore. Gli attributi dipendono dal settore (kWp e accumulo sul
-- fotovoltaico) e stanno in jsonb, cosi' un settore nuovo non chiede una migrazione.
-- Il codice e' unico per fornitore: l'import da Excel aggiorna per codice.
CREATE TABLE IF NOT EXISTS app.catalogo_voce (
  id               bigserial PRIMARY KEY,
  fornitore_slug   text NOT NULL REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  codice           text NOT NULL,
  nome             text NOT NULL,
  descrizione      text,
  prezzo           numeric(12,2) NOT NULL CHECK (prezzo > 0),
  attributi        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordine           integer NOT NULL DEFAULT 0,
  attivo           boolean NOT NULL DEFAULT true,
  aggiornato       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fornitore_slug, codice)
);

CREATE INDEX IF NOT EXISTS catalogo_fornitore_idx ON app.catalogo_voce (fornitore_slug, ordine);

-- Ricerche di merito fatte dagli agenti. Servono a tre cose: lo storico, il
-- legame fra la proposta e i numeri su cui e' stata calcolata, e il divieto di
-- far arrivare quei numeri dal browser. La proposta legge il fatturato da qui,
-- non da quello che il client manda: un agente non puo' farsi verde da solo.
CREATE TABLE IF NOT EXISTS app.ricerca_merito (
  id               text PRIMARY KEY,
  fornitore_slug   text NOT NULL REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE RESTRICT,
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  piva             text NOT NULL,
  ragione_sociale  text,
  -- fatturato, patrimonio netto, utile, inizio attivita', rating
  dati_credito     jsonb NOT NULL,
  da_cache         boolean NOT NULL DEFAULT false,
  creato           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ricerca_org_idx ON app.ricerca_merito (organization_id, creato DESC);
CREATE INDEX IF NOT EXISTS ricerca_utente_idx ON app.ricerca_merito (user_id, creato DESC);

-- Proposte salvate: quelle per cui l'agente ha chiesto il preventivo PDF.
-- I numeri restano qui per intero (nessun coefficiente), i PDF su Blob.
CREATE TABLE IF NOT EXISTS app.proposta (
  id               text PRIMARY KEY,           -- <prefisso>-AAAAMMGG-HHMMSS
  fornitore_slug   text NOT NULL REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE RESTRICT,
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  ricerca_id       text REFERENCES app.ricerca_merito(id) ON DELETE RESTRICT,
  piva             text NOT NULL,
  cliente_nome     text NOT NULL,
  voce_codice      text,
  descrizione      text NOT NULL,
  prezzo           numeric(12,2) NOT NULL,
  semaforo         text NOT NULL,
  anticipo         numeric(5,2) NOT NULL DEFAULT 0,
  markup           numeric(5,2) NOT NULL DEFAULT 0,
  dati             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- input dell'agente
  numeri           jsonb NOT NULL,                       -- proposte calcolate
  documenti        jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_pronti       boolean NOT NULL DEFAULT false,
  creato           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposta_org_idx ON app.proposta (organization_id, creato DESC);
CREATE INDEX IF NOT EXISTS proposta_utente_idx ON app.proposta (user_id, creato DESC);

-- Pratiche caricate dagli agenti. Lo stato si sposta liberamente da uno
-- qualunque a un altro qualunque, anche di piu' passi alla volta: la storia dei
-- cambi resta in 'storia'. La verifica eventi negativi parte all'invio e il suo
-- esito sta in 'negativita': lo vede solo MCF.
CREATE TABLE IF NOT EXISTS app.pratica (
  id               text PRIMARY KEY,           -- <prefisso>-P-AAAAMMGG-HHMMSS
  fornitore_slug   text NOT NULL REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE RESTRICT,
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  proposta_id      text REFERENCES app.proposta(id) ON DELETE RESTRICT,
  piva             text NOT NULL,
  cliente_nome     text NOT NULL,
  importo          numeric(12,2) NOT NULL,
  stato            text NOT NULL DEFAULT 'ricevuta'
                   CHECK (stato IN ('ricevuta', 'in-lavorazione', 'in-delibera', 'approvata', 'declinata')),
  dati             jsonb NOT NULL DEFAULT '{}'::jsonb,
  documenti        jsonb NOT NULL DEFAULT '[]'::jsonb,
  negativita       jsonb,
  storia           jsonb NOT NULL DEFAULT '[]'::jsonb,
  creato           timestamptz NOT NULL DEFAULT now(),
  aggiornato       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pratica_org_idx ON app.pratica (organization_id, creato DESC);
CREATE INDEX IF NOT EXISTS pratica_utente_idx ON app.pratica (user_id, creato DESC);
