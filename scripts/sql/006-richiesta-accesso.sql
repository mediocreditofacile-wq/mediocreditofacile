-- Richieste di accesso dalla rete del fornitore.
--
-- L'installatore che legge la lettera compila il modulo sulla pagina di accesso
-- del portale. La richiesta NON crea un account: arriva al referente, che
-- approva e fa partire l'invito. Un modulo pubblico che attiva da solo farebbe
-- entrare chiunque nel portale del fornitore, e da li' si generano offerte col
-- suo marchio.
CREATE TABLE IF NOT EXISTS app.richiesta_accesso (
  id               bigserial PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  azienda          text,
  email            text NOT NULL,
  telefono         text,
  nota             text,
  stato            text NOT NULL DEFAULT 'nuova',   -- nuova, approvata, rifiutata
  creato           timestamptz NOT NULL DEFAULT now(),
  gestita_da       text REFERENCES "user"(id) ON DELETE SET NULL,
  gestita_il       timestamptz
);

-- Una sola richiesta aperta per email e fornitore: chi clicca due volte non
-- finisce due volte nella lista del referente.
CREATE UNIQUE INDEX IF NOT EXISTS richiesta_aperta_idx
  ON app.richiesta_accesso (organization_id, lower(email))
  WHERE stato = 'nuova';

CREATE INDEX IF NOT EXISTS richiesta_org_idx ON app.richiesta_accesso (organization_id, creato DESC);
