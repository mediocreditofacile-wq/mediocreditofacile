// Tabella Grenke ESG++++ contro il PDF del kit ("Tabella ESG ++++", riletto il 12/10/2026).
//
// Le celle attese sono copiate dal documento, non dall'implementazione: fino al
// 12/10/2026 il file dei coefficienti coincideva col PDF solo nella fascia
// 20.001-40.000, e nessun test se n'era accorto.

import { describe, expect, it } from 'vitest';
import { ESG_COEFFS, getEsgCoeff } from './esg';

// Una riga per durata, otto colonne come sul PDF (prima e ultima cifra della fascia)
const FASCE = [
  [800, 2000],
  [2001, 8000],
  [8001, 20000],
  [20001, 40000],
  [40001, 80000],
  [80001, 120000],
  [120001, 160000],
  [160001, 240000],
] as const;

const PDF: Record<number, (number | null)[]> = {
  24: [4.652, 4.631, 4.61, 4.6, 4.59, 4.58, 4.569, 4.549],
  30: [3.806, 3.786, 3.765, 3.744, 3.734, 3.724, 3.714, 3.693],
  36: [3.239, 3.218, 3.188, 3.167, 3.157, 3.147, 3.136, 3.116],
  48: [2.538, 2.517, 2.486, 2.455, 2.445, 2.435, 2.425, 2.404],
  60: [2.114, 2.094, 2.063, 2.032, 2.012, 1.991, 1.981, 1.971],
  72: [1.835, 1.815, 1.784, 1.754, 1.733, 1.713, 1.702, 1.692],
  84: [null, null, null, null, 1.578, 1.567, 1.557, 1.547],
};

describe('ESG++++ coincide col PDF del kit, cella per cella', () => {
  for (const [durata, riga] of Object.entries(PDF)) {
    it(`${durata} mesi`, () => {
      riga.forEach((atteso, i) => {
        const [da, a] = FASCE[i];
        // Agli estremi della fascia e nel mezzo: le soglie sono il punto dove si sbaglia
        for (const importo of [da, Math.round((da + a) / 2), a]) {
          expect(getEsgCoeff(importo, Number(durata)), `${durata} mesi, ${importo} euro`).toBe(atteso);
        }
      });
    });
  }

  it('fuori tabella non quota: sotto 800 e sopra 240.000 euro', () => {
    expect(getEsgCoeff(799, 60)).toBeNull();
    expect(getEsgCoeff(240_001, 60)).toBeNull();
  });

  it('le durate sono quelle del PDF, niente di piu', () => {
    expect(Object.keys(ESG_COEFFS).map(Number)).toEqual([24, 30, 36, 48, 60, 72, 84]);
  });

  it('15.000 euro a 60 mesi danno 309,45, non i 293,70 della vecchia tabella', () => {
    expect(Math.round(15_000 * getEsgCoeff(15_000, 60)!) / 100).toBe(309.45);
  });
});
