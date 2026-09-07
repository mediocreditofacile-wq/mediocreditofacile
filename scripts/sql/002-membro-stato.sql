-- Sospensione di un agente, per fornitore e non per persona.
--
-- Il ban del plugin Admin di Better Auth vale su tutta l'applicazione: sarebbe
-- sbagliato qui, perche' gli agenti di Green-Go sono plurimandatari e domani
-- possono avere un accesso anche al portale di un altro fornitore. Il referente
-- che chiude un rapporto deve chiudere quello, non l'accesso della persona.
--
-- Il ban resta a MCF, per i casi in cui una persona non deve entrare da nessuna
-- parte. Questa tabella e' la sospensione del singolo rapporto.
--
-- Nessuna cancellazione: la riga membro resta, i preventivi continuano a puntare
-- a un utente che esiste, e lo storico non perde l'attribuzione.

CREATE TABLE IF NOT EXISTS app.membro_stato (
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  user_id          text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  attivo           boolean NOT NULL DEFAULT true,
  motivo           text,
  aggiornato       timestamptz NOT NULL DEFAULT now(),
  aggiornato_da    text REFERENCES "user"(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, user_id)
);
