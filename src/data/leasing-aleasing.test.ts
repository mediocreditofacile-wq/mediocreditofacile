// A-Leasing contro i suoi due preventivi del 23/09/2026 (80.000 euro, anticipo 10%,
// riscatto 1%, tasso di riferimento 2,70): i numeri attesi sono quelli stampati sui PDF,
// non ricalcolati. Si rifanno col tasso del preventivo, quindi non dipendono
// dall'Euribor del sito.

import { describe, expect, it } from 'vitest';
import { leasingPartner } from '../lib/motore/proposte';
import {
  ALEASING,
  PARTNERS_LEASING,
  PARTNERS_LEASING_MOTORE,
  SELLA,
  calcolaRataLeasingPartner,
} from './leasing';

const RIFERIMENTO_PREVENTIVO = 2.7;
const preventivo = (durata: number) => calcolaRataLeasingPartner(ALEASING, 80000, durata, 10, 1, 1, RIFERIMENTO_PREVENTIVO);

describe('A-Leasing rifa i suoi preventivi', () => {
  it('48 mesi: 47 canoni da 1.790,00, totale con anticipo e riscatto 92.930', () => {
    const r = preventivo(48);
    expect(r.numRate).toBe(47);
    expect(r.rataMensile).toBe(1790);
    expect(r.anticipo).toBe(8000);
    expect(r.riscatto).toBe(800);
    expect(r.anticipo + r.numRate * r.rataMensile + r.riscatto).toBe(92930);
    expect(r.speseIstruttoria).toBe(250);
    expect(r.speseIncassoRata).toBe(5);
  });

  it('60 mesi: 59 canoni da 1.473,00, totale con anticipo e riscatto 95.707', () => {
    const r = preventivo(60);
    expect(r.numRate).toBe(59);
    expect(r.rataMensile).toBe(1473);
    expect(r.anticipo + r.numRate * r.rataMensile + r.riscatto).toBe(95707);
  });

  it('la provvigione del 3% sta nel capitale, come su Sella', () => {
    expect(preventivo(48).provvigione).toBe(2400);
  });

  it('senza la dilazione del riscatto il canone esatto sarebbe un altro: la dilazione conta', () => {
    const senza = calcolaRataLeasingPartner({ ...ALEASING, dilazioneRiscattoMesi: 0, canoneAllEuroInSu: false }, 80000, 48, 10, 1, 1, RIFERIMENTO_PREVENTIVO);
    const con = calcolaRataLeasingPartner({ ...ALEASING, canoneAllEuroInSu: false }, 80000, 48, 10, 1, 1, RIFERIMENTO_PREVENTIVO);
    expect(con.rataMensile).toBeGreaterThan(senza.rataMensile);
  });
});

describe('A-Leasing nel motore', () => {
  it('quota solo 48 e 60 mesi', () => {
    expect([36, 48, 60, 72, 84].map((d) => leasingPartner(ALEASING, 80000, d, 10, 0, 1) !== null)).toEqual([false, true, true, false, false]);
  });

  it('il canone e\' un intero di euro anche con l\'Euribor del sito', () => {
    for (const d of [48, 60]) expect(Number.isInteger(leasingPartner(ALEASING, 63_417.5, d, 10, 0, 1)!.rata)).toBe(true);
  });

  it('non entra nei simulatori leasing del sito, solo nel motore', () => {
    expect(PARTNERS_LEASING.map((p) => p.key)).toEqual(['sella', 'alba', 'credem']);
    expect(PARTNERS_LEASING_MOTORE.map((p) => p.key)).toEqual(['sella', 'alba', 'credem', 'aleasing']);
  });

  it('gli altri partner restano ai centesimi e senza dilazione', () => {
    const r = calcolaRataLeasingPartner(SELLA, 80000, 48, 10, 1, 397300, RIFERIMENTO_PREVENTIVO);
    expect(Number.isInteger(r.rataMensile)).toBe(false);
  });
});
