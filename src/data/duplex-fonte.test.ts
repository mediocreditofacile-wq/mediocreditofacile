// I prezzi Duplex vengono da un listino, e i due file lo dicono in testa: quale
// listino, quando e' stato letto e dove sta la copia nel repo.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CARTELLA = path.join(process.cwd(), 'src/data');
const LISTINO_PDF = 'src/data/fonti/duplex-listino-italia-2024.pdf';

describe.each(['duplex-listino.json', 'duplex-accessori.json'])('%s', (nome) => {
  const testo = fs.readFileSync(path.join(CARTELLA, nome), 'utf8');
  const dati = JSON.parse(testo);

  it('in testa la fonte: listino, data di lettura e copia nel repo', () => {
    expect(Object.keys(dati)[0]).toBe('_fonte');
    expect(dati._fonte).toMatch(/Listino ITALIA 2024/);
    expect(dati._fonte).toMatch(/16\/10\/2026/);
    expect(dati._fonte).toContain(LISTINO_PDF);
  });
});

it('la fonte degli accessori dice da dove vengono i carrelli', () => {
  const { _fonte } = JSON.parse(fs.readFileSync(path.join(CARTELLA, 'duplex-accessori.json'), 'utf8'));
  for (const codice of ['420495000', '420492000', '620495000']) expect(_fonte).toContain(codice);
});

it('la copia del listino e\' nel repo', () => {
  expect(fs.statSync(path.join(process.cwd(), LISTINO_PDF)).size).toBeGreaterThan(1_000_000);
});
