-- Settore "mezzi" (22/10/2026).
--
-- Nasce con Bergamelli sul motore (spec mcf_spec-bergamelli-motore): macchine e mezzi
-- d'opera venduti da piu' venditori (Manc, Nol System), ognuno con le sue categorie,
-- noleggio Grenke o Econocom a seconda del bene e confronto sul leasing con i partner
-- Sella, Credem e Alba. I venditori che firmano, le categorie con la domanda sul
-- targato, gli spread del leasing e l'anticipo stanno tutti in una colonna sola.
--
-- jsonb con le chiavi in camelCase, come le quattro colonne di 011 (letto da
-- src/lib/motore/config-mezzi.ts). E' null su tutte le carrozzerie che non vendono
-- mezzi: Led Office, Duplex, Fas Italia e il demo non cambiano. Il settore non ha un
-- check (008 lo lascia libero): 'mezzi' non chiede altro.
--
-- Va applicata PRIMA di pubblicare il codice: la SELECT di carrozzeria.ts nomina la
-- colonna per tutti i fornitori del motore, e senza di lei la query fallisce.
-- Idempotente: rilanciare il file non fa danni.

ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS mezzi jsonb;
