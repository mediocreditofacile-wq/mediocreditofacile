// Le richieste di verifica che MCF addebita al fornitore: un cliente (partita
// IVA) al mese, nel mese italiano. Regola decisa da Alberto il 15/10/2026.

import { describe, expect, it } from 'vitest';
import { contoRichieste, etichettaMese, meseDi, mesePrecedenteDi, meseRichiesto, riepilogoMesi, verificheContate } from './richieste';

const V = (id: string, piva: string, creato: string) => ({ id, piva, creato });

describe('mese italiano', () => {
  it('la mezzanotte conta in ora italiana, non UTC', () => {
    // 31 ottobre alle 23:30 UTC e' gia' il 1° novembre in Italia (ora solare, +1)
    expect(meseDi('2026-10-31T23:30:00.000Z')).toBe('2026-11');
    expect(meseDi('2026-10-31T22:30:00.000Z')).toBe('2026-10');
    // in estate (+2): il 30 settembre alle 22:30 UTC e' il 1° ottobre
    expect(meseDi('2026-09-30T22:30:00.000Z')).toBe('2026-10');
  });
  it('il mese chiesto dalla pagina, se valido; altrimenti il mese corrente', () => {
    const oggi = new Date('2026-10-15T10:00:00Z');
    expect(meseRichiesto('2026-09', oggi)).toBe('2026-09');
    expect(meseRichiesto('2026-13', oggi)).toBe('2026-10');
    expect(meseRichiesto("2026-10'; drop", oggi)).toBe('2026-10');
    expect(meseRichiesto(null, oggi)).toBe('2026-10');
  });
  it('etichetta leggibile', () => {
    expect(etichettaMese('2026-10')).toBe('ottobre 2026');
  });
});

describe('richieste del mese', () => {
  const verifiche = [
    V('a', '01234567890', '2026-10-02T09:00:00Z'),
    V('b', '01234567890', '2026-10-20T09:00:00Z'), // stesso cliente, stesso mese: non conta di nuovo
    V('c', '09876543210', '2026-10-21T09:00:00Z'),
    V('d', '01234567890', '2026-11-03T09:00:00Z'), // stesso cliente, mese dopo: conta
    V('e', '05555555555', '2026-09-30T08:00:00Z'),
  ];
  it('un cliente al mese, mesi dal piu recente', () => {
    expect(riepilogoMesi(verifiche)).toEqual([
      { mese: '2026-11', richieste: 1 },
      { mese: '2026-10', richieste: 2 },
      { mese: '2026-09', richieste: 1 },
    ]);
  });
  it('quali righe contano: la prima verifica del cliente nel mese', () => {
    expect([...verificheContate(verifiche)].sort()).toEqual(['a', 'c', 'd', 'e']);
  });
  it('conta la prima anche se le righe arrivano dalla piu recente', () => {
    expect([...verificheContate([...verifiche].reverse())].sort()).toEqual(['a', 'c', 'd', 'e']);
  });
  it('nessuna verifica: nessun mese', () => {
    expect(riepilogoMesi([])).toEqual([]);
  });
});

describe('conto delle richieste, solo per MCF', () => {
  it('richieste per prezzo, e margine sulla spesa del mese', () => {
    expect(contoRichieste(12, 5, 14.37)).toEqual({ importo: 60, margine: 45.63 });
  });
  it('senza prezzo impostato non si fattura', () => {
    expect(contoRichieste(12, null, 14.37)).toEqual({ importo: null, margine: null });
  });
  it('senza spesa nota: importo si, margine no', () => {
    expect(contoRichieste(3, 5, null)).toEqual({ importo: 15, margine: null });
  });
  it('mese precedente, anche a cavallo d anno', () => {
    expect(mesePrecedenteDi('2026-10')).toBe('2026-09');
    expect(mesePrecedenteDi('2027-01')).toBe('2026-12');
  });
});
