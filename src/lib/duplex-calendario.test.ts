import { describe, expect, it } from 'vitest';
import { aMeseAnno, calendarioPagamenti, dataEstesaDaIso, finestreConsegna, inizioTrimestreSuccessivo } from './duplex-calendario';

const d = (s: string) => {
  const [y, m, g] = s.split('-').map(Number);
  return new Date(y, m - 1, g);
};
const iso = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('calendario pagamenti Grenke', () => {
  it('trimestre solare successivo', () => {
    expect(iso(inizioTrimestreSuccessivo(d('2026-09-21')))).toBe('2026-10-01');
    expect(iso(inizioTrimestreSuccessivo(d('2026-10-13')))).toBe('2027-01-01');
    expect(iso(inizioTrimestreSuccessivo(d('2026-12-31')))).toBe('2027-01-01');
    // Consegna il primo giorno di un trimestre: la locazione parte dal trimestre dopo.
    expect(iso(inizioTrimestreSuccessivo(d('2026-10-01')))).toBe('2027-01-01');
  });

  it("l'esempio di Alberto: consegna 21 settembre, 79 euro al mese", () => {
    const c = calendarioPagamenti(d('2026-09-21'), 79, 60, 'tradizionale');
    expect(c.giorniProRata).toBe(10);
    expect(c.costoGiornaliero).toBe(2.63);
    expect(c.importoProRata).toBe(26.33);
    expect(c.importoTrimestre).toBe(237);
    expect(iso(c.primaFattura)).toBe('2026-10-01');
  });

  it('Grace Period: consegna a ottobre, si paga da aprile', () => {
    const c = calendarioPagamenti(d('2026-10-13'), 79, 60, 'grace');
    expect(iso(c.inizioLocazione)).toBe('2027-01-01');
    expect(iso(c.primaFattura)).toBe('2027-04-01');
    expect(c.giorniProRata).toBe(80);
  });

  // Date reali di pratiche ReteRent: la scadenza del portale e' il giorno dopo la fine.
  it('tradizionale: consegna 18/04/25 a 60 mesi, scadenza 01/07/30', () => {
    const c = calendarioPagamenti(d('2025-04-18'), 100, 60, 'tradizionale');
    expect(iso(c.fineContratto)).toBe('2030-06-30');
  });

  it('Grace Period: consegna 27/04/26 a 60 mesi, scadenza 01/10/31', () => {
    const c = calendarioPagamenti(d('2026-04-27'), 100, 60, 'grace');
    expect(iso(c.primaFattura)).toBe('2026-10-01');
    expect(iso(c.fineContratto)).toBe('2031-09-30');
  });

  it('Grace Period: consegna 18/12/24 a 24 mesi, scadenza 01/04/27', () => {
    const c = calendarioPagamenti(d('2024-12-18'), 100, 24, 'grace');
    expect(iso(c.fineContratto)).toBe('2027-03-31');
  });
});

describe('finestre di consegna rispetto a oggi', () => {
  it('oggi 21 settembre: entro il 30/9 Grace da gennaio, ottobre-dicembre da aprile', () => {
    const [ora, poi] = finestreConsegna(d('2026-09-21'));
    expect(iso(ora.al)).toBe('2026-09-30');
    expect(iso(ora.pagaTradizionale)).toBe('2026-10-01');
    expect(iso(ora.pagaGrace)).toBe('2027-01-01');
    expect(iso(poi.dal)).toBe('2026-10-01');
    expect(iso(poi.al)).toBe('2026-12-31');
    expect(iso(poi.pagaGrace)).toBe('2027-04-01');
  });
});

describe('preposizione davanti al mese', () => {
  it('ad aprile e ad agosto; a ottobre, a gennaio e a luglio', () => {
    expect(aMeseAnno(d('2027-04-01'))).toBe('ad aprile 2027');
    expect(aMeseAnno(d('2027-08-01'))).toBe('ad agosto 2027');
    expect(aMeseAnno(d('2027-10-01'))).toBe('a ottobre 2027');
    expect(aMeseAnno(d('2027-01-01'))).toBe('a gennaio 2027');
    expect(aMeseAnno(d('2027-07-01'))).toBe('a luglio 2027');
  });
});

describe('data per esteso da AAAA-MM-GG', () => {
  it('scrive giorno, mese e anno in italiano', () => {
    expect(dataEstesaDaIso('2026-10-15')).toBe('15 ottobre 2026');
  });
  it('il primo del mese con l ordinale', () => {
    expect(dataEstesaDaIso('2027-01-01')).toBe('1° gennaio 2027');
  });
  it('legge la data come giorno di calendario, senza fuso orario', () => {
    // new Date('2026-12-31') e' mezzanotte UTC: a ovest di Greenwich sarebbe il 30
    expect(dataEstesaDaIso('2026-12-31')).toBe('31 dicembre 2026');
  });
});
