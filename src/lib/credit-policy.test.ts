import { describe, it, expect } from 'vitest';
import { valutaCredito, annoInizio, ETICHETTE_FIERA } from './credit-policy';

const oggi = new Date('2026-09-23');
const base = { importo: 30000, fatturato: 1_000_000, patrimonioNetto: null, utile: 50_000, inizioAttivita: '2010-05-01', oggi };

describe('credit policy', () => {
  it('azienda solida e fornitura piccola: verde', () => {
    expect(valutaCredito(base).semaforo).toBe('verde');
  });

  it('utile in perdita: rosso', () => {
    expect(valutaCredito({ ...base, utile: -1 }).semaforo).toBe('rosso');
  });

  it('utile a zero: giallo con anticipo 10%', () => {
    const e = valutaCredito({ ...base, utile: 0 });
    expect(e.semaforo).toBe('giallo');
    expect(e.anticipo).toBe(10);
  });

  it('attiva da due anni: giallo, da meno di uno: rosso', () => {
    expect(valutaCredito({ ...base, inizioAttivita: '2024-03-01' }).semaforo).toBe('giallo');
    expect(valutaCredito({ ...base, inizioAttivita: '2026-01-10' }).semaforo).toBe('rosso');
  });

  it('fornitura oltre il 20% del fatturato: rosso, come nel tool Marotta (scatta il massimale)', () => {
    expect(valutaCredito({ ...base, importo: 250_000 }).semaforo).toBe('rosso');
    expect(valutaCredito({ ...base, importo: 400_000 }).semaforo).toBe('rosso');
  });

  it('senza bilancio non puo essere verde', () => {
    expect(valutaCredito({ ...base, fatturato: null, utile: null }).semaforo).toBe('giallo');
  });

  it('senza importo valuta il resto e non inventa il rapporto', () => {
    const e = valutaCredito({ ...base, importo: null });
    expect(e.semaforo).toBe('verde');
    expect(e.criteri.find((c) => c.chiave === 'rapporto')?.ok).toBeNull();
  });

  it('legge la data nei due formati', () => {
    expect(annoInizio('2010-05-01')).toBe(2010);
    expect(annoInizio('01-05-2010')).toBe(2010);
    expect(annoInizio(null)).toBeNull();
  });

  it('le etichette non promettono niente', () => {
    for (const t of Object.values(ETICHETTE_FIERA)) expect(t).not.toMatch(/approv|delibera|tasso/i);
  });
});
