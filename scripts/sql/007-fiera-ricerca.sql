-- Ricerche della verifica partita IVA sulla pagina /fiera.
--
-- Serve a due anelli di protezione che devono valere su tutte le istanze della
-- funzione, non su una sola: il limite di frequenza per indirizzo (10 al minuto)
-- e il tetto giornaliero globale. E fa da contatore delle ricerche servite dalla
-- cache, che il registro spesa su Blob non vede.
--
-- Niente dati personali: l'indirizzo IP e' salvato come impronta con segreto, la
-- partita IVA cercata non si salva (e' di un cliente del fornitore, un terzo).
CREATE TABLE IF NOT EXISTS app.fiera_ricerca (
  id           bigserial PRIMARY KEY,
  quando       timestamptz NOT NULL DEFAULT now(),
  ip_hash      text NOT NULL,
  dispositivo  text,
  esito        text NOT NULL,   -- trovata, non_trovata, errore, frequenza, registrazione, tetto_giorno, tetto_spesa
  fonte        text             -- openapi, cache, scheda: solo 'openapi' costa
);

CREATE INDEX IF NOT EXISTS fiera_ricerca_ip_idx ON app.fiera_ricerca (ip_hash, quando DESC);
CREATE INDEX IF NOT EXISTS fiera_ricerca_quando_idx ON app.fiera_ricerca (quando DESC) WHERE fonte = 'openapi';
