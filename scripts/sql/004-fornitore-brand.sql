-- Marchio del fornitore sui documenti che gira ai propri installatori.
--
-- Green-Go ha chiesto che il prospetto di noleggio esca a nome suo: lo manda
-- alla sua rete di installatori come servizio della sua community, e un
-- documento che porta il marchio di un altro non se lo puo' girare.
--
-- Vale SOLO per il noleggio operativo. Il prospetto di leasing resta a marchio
-- Mediocredito Facile con l'iscrizione OAM: e' un prodotto finanziario, e
-- l'intermediario va identificato.
ALTER TABLE app.fornitore ADD COLUMN IF NOT EXISTS brand_logo text;    -- percorso sullo store Blob
ALTER TABLE app.fornitore ADD COLUMN IF NOT EXISTS brand_colore text;  -- colore della testata, es. #1e6145

UPDATE app.fornitore
   SET brand_logo = 'brand/green-go.png', brand_colore = '#1e6145'
 WHERE slug = 'green-go' AND brand_logo IS NULL;
