import { describe, expect, it } from 'vitest';
import { contenutoPreventivo, pdfPreventivo, righeCanoni, tipologiaValida } from './preventivo-simulatore';
import { getAdjustedCoeff } from '../data/grenke';

const OGGI = new Date(2026, 9, 24);

describe('preventivo del simulatore', () => {
  it('canoni su tutte le durate base, con lo stesso coefficiente del simulatore', () => {
    const righe = righeCanoni('Altri Beni Strumentali', 25_000);
    expect(righe.map((r) => r.durata)).toEqual([24, 30, 36, 48, 60]);
    const r36 = righe.find((r) => r.durata === 36)!;
    expect(r36.canone).toBe(Math.round(25_000 * getAdjustedCoeff(25_000, 36)!) / 100);
    expect(r36.trimestre).toBeCloseTo(r36.canone * 3, 2);
    expect(r36.riscatto).toBe(1500);
  });

  it('il fotovoltaico arriva a 84 mesi solo dove la tabella lo prevede', () => {
    expect(righeCanoni('Fotovoltaico', 50_000).map((r) => r.durata)).toContain(84);
    expect(righeCanoni('Fotovoltaico', 20_000).map((r) => r.durata)).not.toContain(84);
  });

  it('una tipologia sconosciuta vale come bene strumentale generico', () => {
    expect(tipologiaValida('<script>')).toBe('Altri Beni Strumentali');
  });

  it('segna la durata scelta e non nomina societa di noleggio', () => {
    const doc = contenutoPreventivo({
      intestatario: 'ROSSI SRL', piva: '01234567890', tipologia: 'Altri Beni Strumentali',
      importo: 25_000, durataScelta: 36, documenti: ['Visura camerale'], oggi: OGGI,
    });
    const testo = JSON.stringify(doc);
    expect(testo).toContain('36 mesi (scelta)');
    expect(testo).toContain('controlli di congruità');
    expect(testo.toLowerCase()).not.toContain('grenke');
    expect(testo).not.toContain('Registro');
  });

  it('senza azienda verificata si intesta alla partita IVA', () => {
    const doc = contenutoPreventivo({ intestatario: null, piva: '01234567890', tipologia: '', importo: 9000, durataScelta: null, documenti: [], oggi: OGGI });
    expect(doc.sottotitolo).toContain('Partita IVA 01234567890');
  });

  it('esce un PDF', () => {
    const { base64 } = pdfPreventivo({ intestatario: 'ROSSI SRL', piva: '01234567890', tipologia: 'Server', importo: 12_000, durataScelta: 48, documenti: ['Visura camerale'], oggi: OGGI });
    expect(Buffer.from(base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  });
});
