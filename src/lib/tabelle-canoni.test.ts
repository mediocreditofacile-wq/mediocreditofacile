// Tabella Grenke ESG++++ applicata al portale Green-Go.
//
// I canoni attesi sono ricalcolati a mano dalla tabella (canone = importo x
// coefficiente / 100), non copiati dall'implementazione: se qualcuno cambia il
// listino senza accorgersene, questi test lo dicono.

import { describe, expect, it } from 'vitest';
import { TABELLA_ESG, TABELLA_PAGARENT, getTabella } from './tabelle-canoni';
import { calcolaPreventivo, importoQuotabile, type InputPreventivo } from './prospetti-pv';

describe('tabella ESG', () => {
  it('espone le durate del fotovoltaico, senza i 24 mesi', () => {
    expect(TABELLA_ESG.durate).toEqual([36, 48, 60, 72, 84]);
  });

  it('30.000 euro a 60 mesi danno 609,60 (fascia 20.001-40.000, 2,032%)', () => {
    expect(TABELLA_ESG.coefficiente(30_000, 60)).toBe(2.032);
    expect(Math.round(30_000 * 2.032) / 100).toBe(609.6);
  });

  it('50.000 euro a 84 mesi danno 767,50 (fascia 40.001-80.000, 1,535%)', () => {
    expect(TABELLA_ESG.coefficiente(50_000, 84)).toBe(1.535);
    expect(Math.round(50_000 * 1.535) / 100).toBe(767.5);
  });

  it('gli 84 mesi partono dai 40.001 euro', () => {
    expect(TABELLA_ESG.durateDisponibili(30_000)).toEqual([36, 48, 60, 72]);
    expect(TABELLA_ESG.durateDisponibili(50_000)).toEqual([36, 48, 60, 72, 84]);
  });

  it('copre tutto il taglio di Green-Go, da 15.000 a 60.000', () => {
    for (const importo of [15_000, 25_000, 40_000, 60_000]) {
      expect(TABELLA_ESG.quotabile(importo)).toBe(true);
      expect(TABELLA_ESG.durateDisponibili(importo).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('i riscatti sono quelli Grenke', () => {
    expect(TABELLA_ESG.riscatto).toMatchObject({ 36: 6, 48: 4, 60: 3, 72: 3 });
  });
});

describe('il motore usa la tabella che riceve', () => {
  const base: InputPreventivo = {
    cliente: 'Prova SRL',
    comune: 'Avellino',
    provincia: 'AV',
    forma_giuridica: 'societa-capitali',
    rif_preventivo: '',
    kwp: 30,
    kwh_accumulo: 0,
    importo: 30_000,
    installazione: 'tetto',
    consumo_annuo: null,
    prezzo_kwh: null,
    profilo: 'diurno',
    durata: null,
  };

  it('su ESG il canone a 60 mesi e 609,60 e la tabella e dichiarata', () => {
    const c = calcolaPreventivo({ ...base, durata: 60 }, TABELLA_ESG);
    expect(c.tabella).toBe('esg');
    expect(c.canone).toBe(609.6);
    expect(c.durata).toBe(60);
    expect(c.riscattoPct).toBe(3);
  });

  it('senza tabella resta PagaRent, e i canoni sono diversi', () => {
    const esg = calcolaPreventivo({ ...base, durata: 60 }, TABELLA_ESG);
    const pagarent = calcolaPreventivo({ ...base, durata: 60 });
    expect(pagarent.tabella).toBe('pagarent');
    // Sono due operatori diversi: se questi due numeri coincidono, qualcuno
    // ha allineato le tabelle credendole la stessa cosa.
    expect(pagarent.canone).not.toBe(esg.canone);
  });

  it('su ESG gli 84 mesi entrano nel ventaglio sopra i 40.000', () => {
    const grande = calcolaPreventivo({ ...base, importo: 50_000, kwp: 50 }, TABELLA_ESG);
    expect(grande.durate).toContain(84);
    expect(Object.keys(grande.canoni).map(Number)).toContain(84);

    const piccolo = calcolaPreventivo({ ...base, importo: 30_000 }, TABELLA_ESG);
    expect(piccolo.durate).not.toContain(84);
  });

  it('una durata non disponibile per quell importo non viene applicata', () => {
    // 84 mesi chiesti su 30.000: non esistono, si torna alla consigliata
    const c = calcolaPreventivo({ ...base, importo: 30_000, durata: 84 }, TABELLA_ESG);
    expect(c.durata).not.toBe(84);
    expect(c.durate).toContain(c.durata);
  });

  it('fuori range il motore si ferma invece di inventare un canone', () => {
    expect(() => calcolaPreventivo({ ...base, importo: 500 }, TABELLA_ESG)).toThrow(/fuori_range/);
    expect(importoQuotabile(500, TABELLA_ESG)).toBe(false);
    expect(importoQuotabile(30_000, TABELLA_ESG)).toBe(true);
  });
});

describe('calcolo inverso, dal canone al prezzo', () => {
  it('chiude il giro: 35.000 euro danno 711,20 e 711,20 riportano a 35.000', () => {
    const canone = Math.round(35_000 * TABELLA_ESG.coefficiente(35_000, 60)!) / 100;
    expect(canone).toBe(711.2);
    expect(TABELLA_ESG.prezzoDaCanone(711.2, 60)).toBeCloseTo(35_000, 0);
  });

  it('sceglie la fascia in cui il prezzo ricade davvero', () => {
    // Un canone basso sta in una fascia bassa, uno alto in una alta: il
    // coefficiente dipende dal prezzo, quindi non c'e' una formula unica.
    const piccolo = TABELLA_ESG.prezzoDaCanone(60, 60)!;
    const grande = TABELLA_ESG.prezzoDaCanone(2000, 60)!;
    expect(TABELLA_ESG.coefficiente(piccolo, 60)).not.toBe(TABELLA_ESG.coefficiente(grande, 60));
    expect(Math.round(piccolo * TABELLA_ESG.coefficiente(piccolo, 60)!) / 100).toBeCloseTo(60, 0);
    expect(Math.round(grande * TABELLA_ESG.coefficiente(grande, 60)!) / 100).toBeCloseTo(2000, 0);
  });

  it('un canone che nessuna fascia regge non viene arrotondato: torna null', () => {
    // Meglio dire che non esiste che dare all'agente un numero inventato
    expect(TABELLA_ESG.prezzoDaCanone(999_999, 60)).toBeNull();
    expect(TABELLA_ESG.prezzoDaCanone(0, 60)).toBeNull();
  });

  it('vale anche su PagaRent, che ha il suo listino', () => {
    const prezzo = TABELLA_PAGARENT.prezzoDaCanone(500, 60);
    expect(prezzo).toBeGreaterThan(0);
    expect(Math.round(prezzo! * TABELLA_PAGARENT.coefficiente(prezzo!, 60)!) / 100).toBeCloseTo(500, 0);
  });
});

describe('getTabella', () => {
  it('risolve gli id noti', () => {
    expect(getTabella('esg')).toBe(TABELLA_ESG);
    expect(getTabella('pagarent')).toBe(TABELLA_PAGARENT);
  });

  it('su un id sconosciuto non esplode: torna il default', () => {
    expect(getTabella('boh')).toBe(TABELLA_PAGARENT);
    expect(getTabella(null)).toBe(TABELLA_PAGARENT);
  });
});
