import { describe, expect, it } from 'vitest';
import {
  annualitaPolizza,
  polizzaAnnua,
  riscatto,
  speseIstruttoria,
  totaleContratto,
} from './duplex-costi';

describe('costi accessori Duplex', () => {
  it('istruttoria a fasce', () => {
    expect(speseIstruttoria(1931)).toBe(75);
    expect(speseIstruttoria(12_500)).toBe(75);
    expect(speseIstruttoria(12_501)).toBe(90);
    expect(speseIstruttoria(30_000)).toBe(100);
  });

  it('polizza: sotto i 3.239 euro vale il minimo', () => {
    // 3,55% di 1.931 fa 68,55, sotto il minimo fatturabile.
    expect(polizzaAnnua(1931)).toBe(115);
    expect(polizzaAnnua(10_000)).toBe(355);
    // Soglia: il minimo smette di mordere quando la percentuale lo supera.
    expect(polizzaAnnua(3239)).toBe(115);
    expect(polizzaAnnua(3240)).toBeCloseTo(115.02, 2);
  });

  it('annualita e riscatto', () => {
    expect(annualitaPolizza(60)).toBe(5);
    expect(annualitaPolizza(48)).toBe(4);
    expect(riscatto(1931, 60)).toBe(57.93);
    expect(riscatto(1931, 24)).toBe(193.1);
    expect(riscatto(1931, 30)).toBeNull();
  });

  it('totale del caso Duplex 340 a 60 mesi, polizza esclusa', () => {
    // 51,60 x 60 canoni + 75 istruttoria + 57,93 riscatto. La polizza resta fuori.
    expect(totaleContratto(1931, 51.6, 60)).toBe(3228.93);
    expect(totaleContratto(1931, 51.15, 60)).toBe(3201.93);
  });
});
