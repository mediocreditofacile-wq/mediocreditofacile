-- Citta' del fornitore: compare nel prospetto, accanto alla ragione sociale
-- ("fornito e installato da GREEN-GO SRLS (Avellino)"). Prima il nome era
-- cablato nel motore Python e ogni portale diverso da InnovaLux stampava
-- il nome sbagliato sotto gli occhi del cliente finale.
ALTER TABLE app.fornitore ADD COLUMN IF NOT EXISTS citta text;
UPDATE app.fornitore SET citta = 'Avellino' WHERE slug = 'green-go' AND citta IS NULL;
