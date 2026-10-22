// I due listini che il portale Led Office aggiunge al registro: Pioneer (beni
// strumentali, fino a 100.000 euro) ed Econocom (beni da 150.000, 36-48-60 mesi).
// Nessun coefficiente nuovo: i numeri vengono da src/data/grenke.ts e da
// src/data/econocom.ts, e questi test lo verificano.

import { describe, expect, it } from 'vitest';
import { ECONOCOM_COEFFICIENTI } from '../data/econocom';
import { PIONEER_COEFFS, PIONEER_LETTO, getPioneerCoeff } from '../data/grenke';
import { TABELLA_ECONOCOM, TABELLA_PIONEER, getTabella, tabellaSeEsiste } from './tabelle-canoni';

describe('listino Pioneer sul motore', () => {
  it('pioneer: coefficienti di PIONEER_COEFFS, durate 24-60 senza 30, fino a 100.000', () => {
    expect(TABELLA_PIONEER.durate).toEqual([24, 36, 48, 60]);
    expect(TABELLA_PIONEER.coefficiente(60_000, 60)).toBe(getPioneerCoeff(60_000, 60));
    expect(TABELLA_PIONEER.quotabile(100_000)).toBe(true);
    expect(TABELLA_PIONEER.quotabile(100_001)).toBe(false);
  });

  it('da 500 euro in su, non sotto', () => {
    expect(TABELLA_PIONEER.importoMin).toBe(500);
    expect(TABELLA_PIONEER.importoMax).toBe(100_000);
    expect(TABELLA_PIONEER.quotabile(499)).toBe(false);
    expect(TABELLA_PIONEER.quotabile(500)).toBe(true);
  });

  it('il 30 mesi della tabella non si espone: durata fuori elenco, coefficiente nullo', () => {
    expect(PIONEER_COEFFS[30]).toBeDefined();
    expect(TABELLA_PIONEER.coefficiente(60_000, 30)).toBeNull();
    expect(TABELLA_PIONEER.prezzoDaCanone(2_000, 30)).toBeNull();
    expect(TABELLA_PIONEER.durateDisponibili(60_000)).toEqual([24, 36, 48, 60]);
  });

  it('le fasce cambiano ai confini del listino', () => {
    // 2.500 e 2.501 stanno in due fasce diverse a 60 mesi (2,573 e 2,221)
    expect(TABELLA_PIONEER.coefficiente(2_500, 60)).toBe(2.573);
    expect(TABELLA_PIONEER.coefficiente(2_501, 60)).toBe(2.221);
    expect(TABELLA_PIONEER.coefficiente(100_000, 24)).toBe(4.743);
  });

  it('il riscatto non si mostra', () => {
    expect(TABELLA_PIONEER.riscatto).toEqual({});
  });

  it('dal canone al prezzo e ritorno: la fascia e quella giusta', () => {
    for (const [prezzo, durata] of [[1_500, 24], [4_000, 36], [8_000, 48], [60_000, 60], [100_000, 60]] as const) {
      const c = TABELLA_PIONEER.coefficiente(prezzo, durata)!;
      const canone = (prezzo * c) / 100;
      expect(TABELLA_PIONEER.prezzoDaCanone(canone, durata)).toBeCloseTo(prezzo, 6);
    }
    expect(TABELLA_PIONEER.prezzoDaCanone(0, 60)).toBeNull();
    // un canone che nessuna fascia regge a quella durata
    expect(TABELLA_PIONEER.prezzoDaCanone(1, 60)).toBeNull();
  });

  it('PIONEER_LETTO: la data di lettura del PDF e null finche non si conosce', () => {
    expect(PIONEER_LETTO === null || PIONEER_LETTO.length > 0).toBe(true);
  });
});

describe('listino Econocom sul motore', () => {
  it('36, 48 e 60 mesi, solo da 150.000, coefficiente in percento', () => {
    expect(TABELLA_ECONOCOM.durate).toEqual([36, 48, 60]);
    expect(TABELLA_ECONOCOM.quotabile(149_999)).toBe(false);
    expect(TABELLA_ECONOCOM.coefficiente(150_000, 36)).toBeCloseTo(3.152, 10);
    expect(TABELLA_ECONOCOM.coefficiente(150_000, 48)).toBeCloseTo(2.473, 10);
    expect(TABELLA_ECONOCOM.coefficiente(150_000, 60)).toBeCloseTo(2.076, 10);
    expect(TABELLA_ECONOCOM.coefficiente(200_000, 24)).toBeNull();
  });

  it('i coefficienti sono quelli di ECONOCOM_COEFFICIENTI, uguali su tutti gli importi', () => {
    for (const [durata, c] of Object.entries(ECONOCOM_COEFFICIENTI)) {
      for (const importo of [150_000, 299_999, 300_000, 900_000, 10_000_000]) {
        expect(TABELLA_ECONOCOM.coefficiente(importo, Number(durata))).toBeCloseTo(c * 100, 10);
      }
    }
  });

  it('da 150.000 fino a 10 milioni, riscatto non mostrato', () => {
    expect(TABELLA_ECONOCOM.importoMin).toBe(150_000);
    expect(TABELLA_ECONOCOM.importoMax).toBe(10_000_000);
    expect(TABELLA_ECONOCOM.quotabile(150_000)).toBe(true);
    expect(TABELLA_ECONOCOM.quotabile(10_000_000)).toBe(true);
    expect(TABELLA_ECONOCOM.quotabile(10_000_001)).toBe(false);
    expect(TABELLA_ECONOCOM.coefficiente(10_000_001, 60)).toBeNull();
    expect(TABELLA_ECONOCOM.riscatto).toEqual({});
  });

  it('le durate disponibili sono 36, 48 e 60 mesi, e solo sopra i 150.000', () => {
    expect(TABELLA_ECONOCOM.durateDisponibili(400_000)).toEqual([36, 48, 60]);
    expect(TABELLA_ECONOCOM.durateDisponibili(149_999)).toEqual([]);
  });

  it('dal canone al prezzo: ritrova l\'importo e rifiuta durate e canoni fuori tabella', () => {
    expect(TABELLA_ECONOCOM.prezzoDaCanone(400_000 * 0.02076, 60)).toBeCloseTo(400_000, 6);
    expect(TABELLA_ECONOCOM.prezzoDaCanone(400_000 * 0.03152, 36)).toBeCloseTo(400_000, 6);
    expect(TABELLA_ECONOCOM.prezzoDaCanone(8_000, 24)).toBeNull();
    expect(TABELLA_ECONOCOM.prezzoDaCanone(0, 60)).toBeNull();
    // il canone di un bene da 100.000 euro, sotto la soglia: la tabella non lo regge
    expect(TABELLA_ECONOCOM.prezzoDaCanone(2_000, 60)).toBeNull();
  });
});

describe('le due tabelle nel registro', () => {
  it('le note non nominano nessun operatore', () => {
    for (const t of [TABELLA_PIONEER, TABELLA_ECONOCOM]) {
      expect(t.nota ?? '').not.toMatch(/grenke|econocom|pagarent|rete ?rent/i);
    }
  });

  it('le note dicono le condizioni da dare al cliente', () => {
    expect(TABELLA_PIONEER.nota).toBe('Canone mensile. Assicurazione obbligatoria, non compresa nel canone.');
    expect(TABELLA_ECONOCOM.nota).toBe('Canone mensile indicativo, da confermare. Condizioni definite caso per caso.');
  });

  it('getTabella risolve i due id nuovi', () => {
    expect(getTabella('pioneer').id).toBe('pioneer');
    expect(getTabella('econocom-pa').id).toBe('econocom-pa');
    expect(tabellaSeEsiste('pioneer')).toBe(TABELLA_PIONEER);
    expect(tabellaSeEsiste('econocom-pa')).toBe(TABELLA_ECONOCOM);
  });
});
