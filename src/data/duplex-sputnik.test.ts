import { describe, expect, it } from 'vitest';
import { coefficienteSputnik } from './duplex-sputnik';
import { coefficienteGrace } from './duplex-grace';

const canone = (p: number, d: number, c: number | null) => Math.round((p * (c as number)) / 100 * 100) / 100;

describe('tabella Sputnik del portale Duplex', () => {
  it('canoni reali letti dal simulatore ReteRent', () => {
    expect(canone(1931, 60, coefficienteSputnik(1931, 60))).toBe(51.6);
    expect(canone(3500, 60, coefficienteSputnik(3500, 60))).toBe(81);
    expect(canone(2259, 60, coefficienteSputnik(2259, 60))).toBe(60.37);
    expect(canone(10000, 60, coefficienteSputnik(10000, 60))).toBe(227.77);
    expect(canone(1931, 24, coefficienteSputnik(1931, 24))).toBe(96.83);
  });

  it('le fasce contano: sotto i 2.500 il coefficiente e il piu alto', () => {
    expect(coefficienteSputnik(2500, 60)).toBe(2.6724);
    expect(coefficienteSputnik(2501, 60)).toBe(2.31438);
    expect(coefficienteSputnik(499, 60)).toBeNull();
    // Sputnik quota anche i 30 mesi, il portale Duplex no: qui restano le quattro durate.
    expect(coefficienteSputnik(10000, 30)).toBeNull();
  });

  it('la Grace sta sotto la Sputnik sulle durate lunghe, sopra su quelle corte', () => {
    expect(coefficienteGrace(1931, 60)!).toBeLessThan(coefficienteSputnik(1931, 60)!);
    expect(coefficienteGrace(1931, 24)!).toBeGreaterThan(coefficienteSputnik(1931, 24)!);
  });
});
