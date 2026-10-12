// Motore delle proposte: semaforo, markup, anticipo, soglia del leasing.
//
// Sono regole commerciali che nessuno rilegge nel codice: se cambiano, deve
// cadere un test. I canoni attesi si ricavano dalle stesse tabelle del sito
// (getEsgCoeff, calcolaRataLeasingPartner), non da numeri scritti a mano.

import { describe, expect, it } from 'vitest';
import { getEsgCoeff } from '../../data/esg';
import { ALBA, calcolaRataLeasingPartner, getCondizioneFornitori } from '../../data/leasing';
import type { Carrozzeria } from './carrozzeria';
import { calcolaProposte, leasingPartner, tabellaConMarkup, type DatiBilancio } from './proposte';
import { getTabella } from '../tabelle-canoni';

const r2 = (v: number) => Math.round(v * 100) / 100;
const OGGI = new Date('2026-10-09T10:00:00Z');

const DEMO: Carrozzeria = {
  slug: 'demo-fotovoltaico', nome: 'Demo', citta: null, prefisso: 'DF', organizationId: 'org',
  tabellaCanoni: 'esg', brand: { logo: null, colore: null, accento: null },
  settore: 'fotovoltaico', etichettaBene: 'Impianto fotovoltaico', partnerLeasing: 'alba',
  sogliaLeasing: 80000, tettoMeseEuro: 30, demo: true, documentiExtra: [], attivo: true,
};

// Azienda solida: 98.000 euro sono meno del 10% del fatturato
const SOLIDA: DatiBilancio = {
  fatturato: 1_200_000, patrimonioNetto: 400_000, utile: 60_000, inizioAttivita: '2010-03-01',
};

describe('verde: condizioni standard', () => {
  const e = calcolaProposte(98000, SOLIDA, DEMO, OGGI);

  it('nessun markup e nessun anticipo in piu', () => {
    expect(e.semaforo).toBe('verde');
    expect(e.markup).toBe(0);
    expect(e.anticipoRichiesto).toBe(0);
    expect(e.bloccate).toBe(false);
  });

  it('il noleggio esce su tutte le durate che la tabella ESG concede, al centesimo', () => {
    expect(e.noleggio.map((n) => n.durata)).toEqual([36, 48, 60, 72, 84]);
    for (const n of e.noleggio) {
      expect(n.canone).toBe(r2((98000 * getEsgCoeff(98000, n.durata)!) / 100));
    }
  });

  it('il leasing e\' quello di Alba allo spread dei fornitori, anticipo 10% e riscatto 1%', () => {
    expect(e.leasing.map((l) => l.durata)).toEqual([36, 48, 60, 72, 84]);
    const l60 = e.leasing.find((l) => l.durata === 60)!;
    const atteso = calcolaRataLeasingPartner(ALBA, 98000, 60, 10, 1, getCondizioneFornitori(ALBA, 60).id);
    expect(l60.rata).toBe(r2(atteso.rataMensile));
    expect(l60.anticipoPerc).toBe(10);
    expect(l60.numRate).toBe(59);
    expect(l60.speseIstruttoria).toBe(ALBA.speseIstruttoria);
  });

  it('in uscita non c\'e\' nessun coefficiente', () => {
    expect(JSON.stringify(e)).not.toMatch(/coeff|spread|fascia/i);
  });
});

describe('giallo: la valutazione entra nei numeri', () => {
  // Con la credit policy di oggi il giallo nasce dall'eta' dell'azienda o da un
  // utile in pareggio. Fornitura oltre il 20% del fatturato o patrimonio sotto
  // la fornitura fanno scattare il massimale, e il massimale e' rosso.
  // Due anni di attivita': anticipo 20%.
  const GIOVANE: DatiBilancio = { fatturato: 600_000, patrimonioNetto: 200_000, utile: 15_000, inizioAttivita: '2024-02-01' };
  const sogliaZero = { ...DEMO, sogliaLeasing: 0 };
  const e = calcolaProposte(40000, GIOVANE, sogliaZero, OGGI);

  it('semaforo giallo con anticipo del 20%', () => {
    expect(e.semaforo).toBe('giallo');
    expect(e.anticipoRichiesto).toBe(20);
    expect(e.bloccate).toBe(false);
  });

  it('il noleggio resta a zero anticipo e lo dice', () => {
    expect(e.noleggio.length).toBeGreaterThan(0);
    expect(e.avvisi.some((a) => /anticipo del 20%/.test(a) && /zero anticipo/.test(a))).toBe(true);
  });

  it('l\'anticipo richiesto diventa il minimo del leasing', () => {
    expect(e.leasing.length).toBeGreaterThan(0);
    expect(e.leasing.every((l) => l.anticipoPerc === 20)).toBe(true);
    const l60 = e.leasing.find((x) => x.durata === 60)!;
    const atteso = calcolaRataLeasingPartner(ALBA, 40000, 60, 20, 1, getCondizioneFornitori(ALBA, 60).id);
    expect(l60.rata).toBe(r2(atteso.rataMensile));
  });

  it('utile in pareggio: anticipo 10%, il minimo del leasing resta 10%', () => {
    const e2 = calcolaProposte(40000, { ...GIOVANE, inizioAttivita: '2015-01-01', utile: 0 }, sogliaZero, OGGI);
    expect(e2.semaforo).toBe('giallo');
    expect(e2.anticipoRichiesto).toBe(10);
    expect(e2.leasing.every((l) => l.anticipoPerc === 10)).toBe(true);
  });

  it('fornitura al 25% del fatturato: scatta il massimale ed e\' rosso, non giallo', () => {
    const e3 = calcolaProposte(25000, { fatturato: 100_000, patrimonioNetto: 500_000, utile: 5_000, inizioAttivita: '2015-01-01' }, sogliaZero, OGGI);
    expect(e3.semaforo).toBe('rosso');
  });
});

describe('markup: entra in canoni e rate quando la valutazione lo chiede', () => {
  it('il markup moltiplica il canone del noleggio', () => {
    const t = tabellaConMarkup(getTabella('esg'), 0.5);
    expect(r2((25000 * t.coefficiente(25000, 60)!) / 100)).toBe(r2((25000 * getEsgCoeff(25000, 60)! * 1.005) / 100));
  });

  it('il markup moltiplica la rata del leasing', () => {
    const con = leasingPartner(ALBA, 25000, 60, 10, 0.5)!;
    const base = calcolaRataLeasingPartner(ALBA, 25000, 60, 10, 1, getCondizioneFornitori(ALBA, 60).id);
    expect(con.rata).toBe(r2(base.rataMensile * 1.005));
  });
});

describe('rosso: niente proposte', () => {
  it('in perdita le proposte si fermano', () => {
    const e = calcolaProposte(98000, { ...SOLIDA, utile: -10_000 }, DEMO, OGGI);
    expect(e.semaforo).toBe('rosso');
    expect(e.bloccate).toBe(true);
    expect(e.noleggio).toEqual([]);
    expect(e.leasing).toEqual([]);
  });

  it('oltre il 30% del fatturato le proposte si fermano', () => {
    const e = calcolaProposte(98000, { ...SOLIDA, fatturato: 300_000 }, DEMO, OGGI);
    expect(e.bloccate).toBe(true);
  });
});

describe('soglia del leasing della carrozzeria', () => {
  it('sotto soglia il leasing non c\'e\' e si dice perche', () => {
    const e = calcolaProposte(52000, SOLIDA, DEMO, OGGI);
    expect(e.leasing).toEqual([]);
    expect(e.motivoNoLeasing).toMatch(/80\.000/);
    expect(e.noleggio.length).toBeGreaterThan(0);
  });

  it('a soglia zero il leasing parte dal minimo del partner', () => {
    const e = calcolaProposte(4000, SOLIDA, { ...DEMO, sogliaLeasing: 0 }, OGGI);
    expect(e.leasing).toEqual([]);
    expect(e.motivoNoLeasing).toMatch(/5\.000/);
  });
});

describe('strumenti del motore', () => {
  it('la tabella col markup non cambia le durate disponibili', () => {
    const t = getTabella('esg');
    const m = tabellaConMarkup(t, 0.5);
    expect(m.durateDisponibili(30000)).toEqual(t.durateDisponibili(30000));
    expect(m.coefficiente(30000, 60)).toBeCloseTo(t.coefficiente(30000, 60)! * 1.005, 10);
  });

  it('il totale del leasing somma anticipo, rate, riscatto, istruttoria e incassi', () => {
    const l = leasingPartner(ALBA, 100000, 60, 10, 0)!;
    expect(l.totale).toBe(r2(l.anticipo + l.rata * l.numRate + l.riscatto + l.speseIstruttoria + l.speseIncassoRata * l.numRate));
  });
});
