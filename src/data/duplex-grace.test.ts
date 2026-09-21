import { describe, expect, it } from 'vitest';
import { coefficienteGrace } from './duplex-grace';

// Canoni mostrati dal simulatore ReteRent (Duplex International, tabella GRACE PERIOD).
describe('tabella Grace Period Duplex', () => {
  it('10.000 euro tornano come sul portale', () => {
    const canone = (d: number) => Math.round(10000 * (coefficienteGrace(10000, d) as number)) / 100;
    expect(canone(24)).toBe(503.2);
    expect(canone(36)).toBe(348.7);
    expect(canone(48)).toBe(270);
    expect(canone(60)).toBe(224.9);
  });

  it('scaglioni e limiti', () => {
    expect(coefficienteGrace(2500, 60)).toBe(2.649);
    expect(coefficienteGrace(2500.5, 60)).toBe(2.649);
    expect(coefficienteGrace(2501, 60)).toBe(2.287);
    expect(coefficienteGrace(499, 60)).toBeNull();
    expect(coefficienteGrace(500001, 60)).toBeNull();
    // La tabella non quota i 30 mesi.
    expect(coefficienteGrace(10000, 30)).toBeNull();
  });
});
