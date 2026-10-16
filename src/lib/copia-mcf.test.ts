// Fase sperimentale decisa da Alberto il 16/10/2026: fino al 31/12/2026 ogni
// mail che il sito manda a un destinatario esterno parte con MCF in copia
// nascosta, per controllare che sia tutto in ordine. Poi si spegne da sola.

import { describe, expect, it } from 'vitest';
import { copiaMcfAttiva, copiaNascostaMcf, invitiPerGiro } from './copia-mcf';

const MCF = 'mediocreditofacile@gmail.com';
const OGGI = new Date('2026-10-16T10:00:00+02:00');

describe('copia nascosta a MCF', () => {
  it('a un destinatario esterno: MCF in copia nascosta', () => {
    expect(copiaNascostaMcf(['leo@example.invalid'], OGGI)).toEqual([MCF]);
  });
  it('se la mail va gia a MCF non serve la copia', () => {
    expect(copiaNascostaMcf([MCF], OGGI)).toEqual([]);
    expect(copiaNascostaMcf(['MedioCreditoFacile@Gmail.com'], OGGI)).toEqual([]);
  });
  it('MCF fra i destinatari insieme a un esterno: niente copia, la mail ce l ha gia', () => {
    expect(copiaNascostaMcf([MCF, 'mkt@example.invalid'], OGGI)).toEqual([]);
  });
  it('vale fino al 31 dicembre 2026 compreso, in ora italiana', () => {
    expect(copiaNascostaMcf(['x@example.invalid'], new Date('2026-12-31T23:30:00+01:00'))).toEqual([MCF]);
    // il 31/12 alle 23:30 UTC in Italia e' gia' il 1° gennaio
    expect(copiaNascostaMcf(['x@example.invalid'], new Date('2026-12-31T23:30:00Z'))).toEqual([]);
    expect(copiaNascostaMcf(['x@example.invalid'], new Date('2027-01-02T10:00:00+01:00'))).toEqual([]);
    expect(copiaMcfAttiva(OGGI)).toBe(true);
    expect(copiaMcfAttiva(new Date('2027-01-01T00:00:01+01:00'))).toBe(false);
  });
});

describe('inviti per giro, col tetto Resend di 100 mail al giorno', () => {
  it('con la copia attiva il giro si dimezza: ogni invito vale due mail', () => {
    expect(invitiPerGiro(OGGI)).toBe(40);
  });
  it('finita la fase sperimentale torna a 80', () => {
    expect(invitiPerGiro(new Date('2027-01-01T09:00:00+01:00'))).toBe(80);
  });
});
