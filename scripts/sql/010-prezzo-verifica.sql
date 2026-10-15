-- Prezzo per richiesta di verifica che MCF addebita al fornitore (15/10/2026).
--
-- Una richiesta e' un cliente (partita IVA) nel mese: la regola sta in
-- src/lib/motore/richieste.ts. Null = il fornitore non paga le verifiche.
-- Il prezzo lo vede solo l'admin MCF, nel Pannello MCF.

ALTER TABLE app.carrozzeria ADD COLUMN IF NOT EXISTS prezzo_verifica numeric(8,2);
