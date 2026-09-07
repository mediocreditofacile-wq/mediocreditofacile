-- Tabelle applicative dei portali con accesso nominale.
--
-- Convivono con quelle di Better Auth, che stanno nello schema public
-- (user, session, account, verification, organization, member, invitation).
-- Le nostre stanno in schema app, cosi' e' sempre chiaro cosa e' identita' e
-- cosa e' applicazione, e una migrazione di Better Auth non sfiora i nostri dati.

CREATE SCHEMA IF NOT EXISTS app;

-- Ponte tra l'organizzazione di Better Auth e il mondo che gia' esiste nel sito.
-- Blob, registro partner e API ragionano per slug (green-go), l'autenticazione
-- ragiona per organization_id: questa tabella tiene insieme le due cose, cosi'
-- non riscriviamo il codice dei portali gia' in produzione.
CREATE TABLE IF NOT EXISTS app.fornitore (
  slug             text PRIMARY KEY,
  organization_id  text NOT NULL UNIQUE REFERENCES "organization"(id) ON DELETE RESTRICT,
  nome             text NOT NULL,
  prefisso         text NOT NULL,           -- prefisso degli id preventivo, es. GG
  tabella_canoni   text NOT NULL DEFAULT 'esg',  -- 'esg' (Grenke) oppure 'bcc'
  attivo           boolean NOT NULL DEFAULT true,
  creato           timestamptz NOT NULL DEFAULT now()
);

-- Indice dello storico preventivi. I due PDF restano su Vercel Blob: qui sta
-- quello su cui si interroga (chi lavora, su che taglio, in che zona), che su
-- file JSON costringerebbe a leggere N documenti a ogni apertura del portale.
CREATE TABLE IF NOT EXISTS app.preventivo (
  id                 text PRIMARY KEY,       -- GG-AAAAMMGG-HHMMSS
  fornitore_slug     text NOT NULL REFERENCES app.fornitore(slug) ON DELETE RESTRICT,
  organization_id    text NOT NULL REFERENCES "organization"(id) ON DELETE RESTRICT,
  -- Identificativo stabile dell'utente, non la sua email, che puo' cambiare.
  -- Nessun ON DELETE CASCADE: gli utenti si disattivano, non si cancellano.
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  creato             timestamptz NOT NULL DEFAULT now(),

  cliente_nome       text NOT NULL,
  comune             text,
  provincia          text,
  forma_giuridica    text NOT NULL,
  rif_preventivo     text,

  kwp                numeric(10,2) NOT NULL,
  kwh_accumulo       numeric(10,2) NOT NULL DEFAULT 0,
  importo            numeric(12,2) NOT NULL,
  installazione      text NOT NULL,
  consumo_annuo      numeric(12,2),
  prezzo_kwh         numeric(6,4),
  profilo            text NOT NULL,

  tabella_canoni     text NOT NULL,          -- quale listino ha prodotto il canone
  durata             integer NOT NULL,
  durata_consigliata integer,
  canone             numeric(12,2) NOT NULL,
  numeri             jsonb NOT NULL,         -- risultati completi, nessun coefficiente
  documenti          jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_pronti         boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS preventivo_org_creato_idx ON app.preventivo (organization_id, creato DESC);
CREATE INDEX IF NOT EXISTS preventivo_utente_creato_idx ON app.preventivo (user_id, creato DESC);

-- Coda degli inviti. Serve perche' Resend nel piano gratuito accetta 100 email
-- al giorno e Green-Go ha circa duecento agenti da attivare: gli inviti partono
-- a scaglioni, chi fallisce per tetto raggiunto torna in fila invece di essere
-- perso, e il referente vede a che punto e' ciascuno.
CREATE TABLE IF NOT EXISTS app.invito (
  id               bigserial PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  email            text NOT NULL,
  nome             text NOT NULL,
  ruolo            text NOT NULL,            -- 'agente' oppure 'referente'
  stato            text NOT NULL DEFAULT 'da_inviare',
                   -- da_inviare -> inviato -> accettato, oppure fallito
  invitation_id    text,                     -- id Better Auth, valorizzato all'invio
  tentativi        integer NOT NULL DEFAULT 0,
  ultimo_errore    text,
  creato_da        text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  creato           timestamptz NOT NULL DEFAULT now(),
  inviato_il       timestamptz,
  accettato_il     timestamptz
);

-- Un solo invito pendente per email dentro la stessa organizzazione: senza
-- questo, due clic del referente creano due inviti e due email.
CREATE UNIQUE INDEX IF NOT EXISTS invito_org_email_aperto_idx
  ON app.invito (organization_id, lower(email))
  WHERE stato IN ('da_inviare', 'inviato');

CREATE INDEX IF NOT EXISTS invito_coda_idx ON app.invito (stato, creato) WHERE stato = 'da_inviare';
