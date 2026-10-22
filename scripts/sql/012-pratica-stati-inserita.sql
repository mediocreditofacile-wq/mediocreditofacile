-- Tre stati nuovi della pratica (22/10/2026), decisi da Alberto dopo la telefonata con
-- Luca Maimone (Led Office): dice su quale canale MCF ha caricato la pratica.
--
--   inserita-pagarent   Inserita PagaRent
--   inserita-reterent   Inserita ReteRent
--   inserita-esterno    Inserita fornitore esterno (master rent, fornitore convenzionato)
--
-- Li imposta solo MCF. Referente e agente leggono "Inserita presso la società di
-- noleggio", senza il nome: il server riduce lo stato prima di mandarlo al browser
-- (src/lib/motore/stati-pratica.ts). Valgono per tutti i fornitori del motore.
-- Idempotente: rilanciare il file non fa danni.

ALTER TABLE app.pratica DROP CONSTRAINT IF EXISTS pratica_stato_check;
ALTER TABLE app.pratica
  ADD CONSTRAINT pratica_stato_check CHECK (stato IN (
    'ricevuta', 'in-lavorazione',
    'inserita-pagarent', 'inserita-reterent', 'inserita-esterno',
    'in-delibera', 'approvata', 'declinata'
  ));
