// Documenti della pratica in allegato alla mail a MCF (22/10/2026) e ZIP unico.

import { describe, expect, it } from 'vitest';
import { LIMITE_ALLEGATI_BYTES, nomiUnici, ordineAllegati, scegliAllegati } from './allegati-pratica';
import { documentiMancanti, documentoAlPostoGiusto, VOCE_ZIP, zipAmmesso } from './pratica-distinta-regole';

const MB = 1024 * 1024;

describe('scegliAllegati', () => {
  it('tutto dentro quando sta nel limite', () => {
    const r = scegliAllegati([{ n: 'a', byte: 5 * MB }, { n: 'b', byte: 10 * MB }]);
    expect(r.allegati.map((d) => d.n)).toEqual(['a', 'b']);
    expect(r.esclusi).toEqual([]);
  });

  it('un file che non ci sta resta fuori, i piccoli dopo partono lo stesso', () => {
    const r = scegliAllegati([{ n: 'a', byte: 20 * MB }, { n: 'grande', byte: 15 * MB }, { n: 'c', byte: 3 * MB }]);
    expect(r.allegati.map((d) => d.n)).toEqual(['a', 'c']);
    expect(r.esclusi.map((d) => d.n)).toEqual(['grande']);
  });

  it('un file vuoto o illeggibile non si allega', () => {
    expect(scegliAllegati([{ n: 'vuoto', byte: 0 }]).esclusi).toHaveLength(1);
  });

  it('il limite lascia spazio alla codifica base64 sotto i 40 MB di Resend', () => {
    expect(Math.ceil(LIMITE_ALLEGATI_BYTES / 3) * 4).toBeLessThan(38 * MB);
  });
});

describe('ordine e nomi', () => {
  it('lo ZIP unico va per primo', () => {
    const docs = [{ voce: 'Visura' }, { voce: VOCE_ZIP }, { voce: 'Documento' }];
    expect(ordineAllegati(docs).map((d) => d.voce)).toEqual([VOCE_ZIP, 'Visura', 'Documento']);
  });

  it('due file con lo stesso nome prendono un numero', () => {
    expect(nomiUnici(['ci.pdf', 'CI.pdf', 'bilancio', 'bilancio'])).toEqual(['ci.pdf', 'CI (2).pdf', 'bilancio', 'bilancio (2)']);
  });
});

describe('ZIP unico', () => {
  it('passa un .zip dichiarato come zip o senza tipo; non un pdf rinominato', () => {
    expect(zipAmmesso('documenti.zip', 'application/zip')).toBe(true);
    expect(zipAmmesso('documenti.ZIP', 'application/x-zip-compressed')).toBe(true);
    expect(zipAmmesso('documenti.zip', '')).toBe(true);
    expect(zipAmmesso('documenti.zip', 'application/pdf')).toBe(false);
    expect(zipAmmesso('documenti.pdf', 'application/zip')).toBe(false);
  });

  it('sotto la voce ZIP solo .zip, sotto le altre nessun .zip', () => {
    expect(documentoAlPostoGiusto({ voce: VOCE_ZIP, pathname: 'pratiche/x/bozze/u/tutto-AbC123.zip' })).toBe(true);
    expect(documentoAlPostoGiusto({ voce: VOCE_ZIP, pathname: 'pratiche/x/bozze/u/visura-AbC123.pdf' })).toBe(false);
    expect(documentoAlPostoGiusto({ voce: 'Visura camerale', pathname: 'pratiche/x/bozze/u/tutto-AbC123.zip' })).toBe(false);
    expect(documentoAlPostoGiusto({ voce: 'Visura camerale', pathname: 'pratiche/x/bozze/u/visura-AbC123.pdf' })).toBe(true);
  });

  it('con lo ZIP le voci obbligatorie non mancano piu\'', () => {
    const voci = [{ nome: 'Visura camerale', obbligatoria: true }, { nome: 'Bilancio', obbligatoria: false }] as any[];
    expect(documentiMancanti(voci, [], false).obbligatori).toEqual(['Visura camerale']);
    const zip = [{ nome: 'tutto.zip', pathname: 'p/tutto.zip', size: 10, voce: VOCE_ZIP }];
    expect(documentiMancanti(voci, zip, false)).toEqual({ obbligatori: [], facoltativi: [] });
  });
});
