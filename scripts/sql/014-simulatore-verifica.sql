-- Verifiche del cliente sul simulatore di noleggio operativo (dal 24/10/2026).
--
-- Ogni invio prenota qui una riga PRIMA di spendere (src/lib/guardia-simulatore.ts),
-- sotto un lock: frequenza per indirizzo, invii del giorno (tetto delle mail),
-- ricerche a pagamento del giorno e spesa del mese si contano da questa tabella,
-- cosi' due richieste in parallelo non leggono lo stesso conteggio e nessun tetto
-- costa operazioni sullo store Blob. Niente dati personali: l'IP e' un'impronta
-- con segreto, partite IVA e contatti vanno solo nella mail ad Alberto.
CREATE TABLE IF NOT EXISTS app.simulatore_verifica (
  id        bigserial PRIMARY KEY,
  quando    timestamptz NOT NULL DEFAULT now(),
  ip_hash   text NOT NULL,
  esito     text NOT NULL,              -- in_corso, verde, giallo, rosso, ferma, non_trovata, non_verificata, frequenza, tetto_invii
  ricerche  smallint NOT NULL DEFAULT 0, -- ricerche IT-advanced a pagamento (prenotate, poi quelle fatte)
  schede    smallint NOT NULL DEFAULT 0  -- schede complete da 0,81 (prenotata, poi ordinata o no)
);

CREATE INDEX IF NOT EXISTS simulatore_verifica_ip_idx ON app.simulatore_verifica (ip_hash, quando DESC);
CREATE INDEX IF NOT EXISTS simulatore_verifica_quando_idx ON app.simulatore_verifica (quando DESC);
