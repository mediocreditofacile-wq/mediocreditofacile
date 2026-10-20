// Regole pure dei budget Openapi: chi paga, cosa si dice quando un tetto
// scatta, quando si riapre, cosa mostra la pagina della valutazione.

import { describe, expect, it } from 'vitest';
import {
  meseLeggibile, riaperturaBudget, nomeBudget, messaggioTetto, sorgenteRicercaEstera, riepilogoSpesa,
} from './tetto-openapi';
import type { Consumo } from './openapi';

describe('mese e riapertura', () => {
  it('legge il mese in italiano', () => {
    expect(meseLeggibile('2026-10')).toBe('ottobre 2026');
    expect(meseLeggibile('2027-01')).toBe('gennaio 2027');
  });

  it('il budget si riapre il primo del mese dopo, anche a cavallo d\'anno', () => {
    expect(riaperturaBudget('2026-10')).toBe('1° novembre 2026');
    expect(riaperturaBudget('2026-12')).toBe('1° gennaio 2027');
  });
});

describe('messaggio quando un tetto scatta', () => {
  it('dice quale budget, quanto speso e quando si riapre', () => {
    expect(messaggioTetto({ sorgente: 'marotta', mese: '2026-10', tipo: 'euro', speso: 31.2, tetto: 30 }))
      .toBe('Budget Openapi del tool Marotta esaurito: a ottobre spesi 31,20 € su 30,00 €. Si riapre il 1° novembre 2026.');
  });

  it('sulle ricerche contate a pezzi parla di ricerche', () => {
    expect(messaggioTetto({ sorgente: 'marotta', mese: '2026-12', tipo: 'ricerche', speso: 400, tetto: 400 }))
      .toBe('Ricerche Openapi del tool Marotta esaurite: a dicembre ne sono state fatte 400 su 400. Si riaprono il 1° gennaio 2027.');
  });

  it('nomina il budget di ogni sorgente', () => {
    expect(nomeBudget('marotta')).toBe('del tool Marotta');
    expect(nomeBudget('valutazione')).toBe('del tool di valutazione');
    expect(nomeBudget('carrozzeria/duplex')).toBe('del portale duplex');
    expect(nomeBudget('fiera')).toBe('della pagina /fiera');
  });
});

describe('chi paga una ricerca estera', () => {
  const CHIAVE = 'chiave-di-prova';

  it('con la chiave della valutazione paga il tool interno', () => {
    expect(sorgenteRicercaEstera(`Bearer ${CHIAVE}`, CHIAVE)).toBe('valutazione');
  });

  it('senza credenziali, o con una chiave sbagliata, paga Marotta', () => {
    expect(sorgenteRicercaEstera(null, CHIAVE)).toBe('marotta');
    expect(sorgenteRicercaEstera('Bearer altra', CHIAVE)).toBe('marotta');
    expect(sorgenteRicercaEstera(CHIAVE, CHIAVE)).toBe('marotta');
  });

  it('se la chiave non e\' configurata nessuno scavalca il tetto', () => {
    expect(sorgenteRicercaEstera('Bearer undefined', undefined)).toBe('marotta');
    expect(sorgenteRicercaEstera('Bearer ', '')).toBe('marotta');
  });
});

describe('riepilogo per la pagina', () => {
  const parz = (totale: number, chiamate = 1) => ({ totale, chiamate, perServizio: {} });

  it('separa tool interno, Marotta, portali, fiera e non attribuiti', () => {
    const c = {
      mese: '2026-10', totale: 96.79, chiamate: 145, perServizio: {},
      registrato: 95.17, addebitato: 96.79, inAttesa: 0,
      perSorgente: {
        sito: parz(93.61, 133), fiera: parz(0, 0), marotta: parz(0.22, 2), valutazione: parz(1.3, 4),
        'carrozzeria/duplex': parz(1.56, 6), 'carrozzeria/fas-italia': parz(0.3),
      },
    } as unknown as Consumo;

    expect(riepilogoSpesa(c)).toEqual({
      mese: '2026-10',
      meseLeggibile: 'ottobre 2026',
      valutazione: { totale: 1.3, chiamate: 4 },
      marotta: 0.22,
      fiera: 0,
      portali: 1.86,
      nonAttribuiti: 93.61,
      conto: 96.79,
    });
  });

  it('regge una spesa senza le sorgenti nuove', () => {
    const c = { mese: '2026-09', totale: 12, perSorgente: { sito: parz(12), fiera: parz(0) } } as unknown as Consumo;
    const r = riepilogoSpesa(c);
    expect(r.valutazione.totale).toBe(0);
    expect(r.marotta).toBe(0);
    expect(r.nonAttribuiti).toBe(12);
  });
});
