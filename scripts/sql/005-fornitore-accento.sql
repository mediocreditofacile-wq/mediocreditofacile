-- Secondo colore del fornitore: e' quello dei titoli di sezione e delle righe
-- evidenziate, mentre brand_colore veste la banda di testata e le tabelle.
-- Servono due toni perche' il colore della banda e' scuro per reggere il testo
-- bianco, e sui titoli su fondo chiaro un tono cosi' scuro pesa.
ALTER TABLE app.fornitore ADD COLUMN IF NOT EXISTS brand_accento text;
UPDATE app.fornitore SET brand_accento = '#2e8056' WHERE slug = 'green-go' AND brand_accento IS NULL;
