-- Settore "macchine" e tre impostazioni per carrozzeria (15/10/2026).
--
-- Nasce con Duplex sul motore (spec mcf_spec-duplex-motore_v1): una tabella del
-- noleggio affiancata (la Grace Period), le regole del semaforo (credit policy del
-- tool Marotta oppure criteri del locatore) e il leasing acceso o spento. I default
-- lasciano gli altri fornitori esattamente come sono.
--
-- L'esito degli eventi negativi della ricerca sta sulla riga della ricerca: il
-- registro su Blob rilegge i file sovrascritti dalla cache (CLAUDE.md, Documenti
-- ufficiali), Postgres no.

ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS tabella_alternativa text;
ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS regole_semaforo text NOT NULL DEFAULT 'credit-policy';
ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS leasing boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  ALTER TABLE app.carrozzeria
    ADD CONSTRAINT carrozzeria_regole_semaforo_chk CHECK (regole_semaforo IN ('credit-policy', 'locatore'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE app.ricerca_merito ADD COLUMN IF NOT EXISTS eventi jsonb;
