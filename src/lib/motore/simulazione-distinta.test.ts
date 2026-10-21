// La simulazione prima della verifica (21/10/2026): dall'importo ai canoni, senza
// cliente. Con la configurazione di Led Office quota sempre il canale di chiusura col
// suo 5% dentro la rata, e verso il commerciale non esce nessun nome di locatore.

import { describe, expect, it } from 'vitest';
import { CANALI_LO } from './catalogo-ledoffice';
import { instrada } from './instradamento';
import { contenutoPreventivoSimulazione, NOTA_SIMULAZIONE } from './pdf-ledoffice';
import { leggiSimulazione, simula, simulazionePerSchermo } from './simulazione-distinta';

const K = { canali: CANALI_LO };
const OGGI = new Date('2026-10-21T10:00:00Z');
const VIETATE = ['pagarent', 'grenke', 'econocom', 'maggiorazione', 'imponibile', 'canale'];

describe('leggiSimulazione', () => {
  it('importo numerico ai centesimi, intestatario e descrizione ripuliti', () => {
    expect(leggiSimulazione({ importo: 35000.004, intestatario: '  AB  Fashion ', descrizione: ' LEDwall 3x2 ' })).toEqual({
      ok: true, dati: { importo: 35000, intestatario: 'AB Fashion', descrizione: 'LEDwall 3x2' },
    });
  });

  it('importo mancante, a zero, negativo, in testo o esagerato: importo_non_valido', () => {
    for (const importo of [undefined, 0, -10, '35000', Number.NaN, 1_000_001]) {
      expect(leggiSimulazione({ importo })).toEqual({ ok: false, error: 'importo_non_valido' });
    }
  });
});

describe('simula', () => {
  it('senza cliente quota il canale di chiusura, con la maggiorazione nella rata', () => {
    const i = simula(K, 35_000, OGGI)!;
    expect(i.canale).toBe('pagarent');
    expect(i.imponibile).toBe(36_750);
    expect(i.rate.map((r) => r.durata)).toEqual([24, 36, 48, 60]);
  });

  it('le rate sono quelle della distinta per un cliente che non regge altri canali', () => {
    const conCliente = instrada(CANALI_LO, { formaCodice: 'SR', inizioAttivita: '2010-01-01', fatturato: 2_000_000, atecoCodice: '47.71' }, 35_000, OGGI)!;
    expect(simula(K, 35_000, OGGI)!.rate).toEqual(conCliente.rate);
  });

  it('anche da 150.000 euro non sceglie mai il canale riservato ai clienti grandi', () => {
    expect(simula(K, 160_000, OGGI)!.canale).toBe('pagarent');
  });

  it('oltre la tabella non c\'e\' canone', () => {
    // 195.000 piu' il 5% supera i 200.000 della tabella
    expect(simula(K, 195_000, OGGI)).toBeNull();
    expect(simula({ canali: [] }, 35_000, OGGI)).toBeNull();
  });
});

describe('simulazionePerSchermo', () => {
  it('al commerciale solo rate, nota e avvisi, 60 mesi in evidenza', () => {
    const s = simulazionePerSchermo(simula(K, 35_000, OGGI)!, false);
    expect(s.durataEvidenza).toBe(60);
    expect(Object.keys(s).sort()).toEqual(['daConfermare', 'durataEvidenza', 'nota', 'rate', 'richiedeProvvisorio']);
    const testo = JSON.stringify(s).toLowerCase();
    for (const v of VIETATE) expect(testo).not.toContain(v);
    expect(testo).not.toContain('36750');
  });

  it('a MCF anche canale, maggiorazione e imponibile', () => {
    expect(simulazionePerSchermo(simula(K, 35_000, OGGI)!, true).riservato)
      .toBe('Solo MCF: Pagarent, maggiorazione 1.750 euro, imponibile 36.750 euro.');
  });
});

describe('preventivo della simulazione', () => {
  const i = simula(K, 35_000, OGGI)!;

  it('una riga con importo e descrizione, nessuna partita IVA, la nota della simulazione', () => {
    const p = contenutoPreventivoSimulazione({ importo: 35_000, intestatario: 'AB Fashion', descrizione: 'LEDwall 3x2' }, i, 'LO-SIM-1', OGGI);
    expect(p.cliente).toEqual({ ragioneSociale: 'AB FASHION', piva: '' });
    expect(p.simulazione).toBe(true);
    expect(p.righe).toEqual([{ descrizione: 'LEDWALL 3X2', quantita: 1, prezzo: 35_000, totale: 35_000 }]);
    expect(p.totale).toBe(35_000);
    expect(p.note).toContain(NOTA_SIMULAZIONE);
    const testo = JSON.stringify(p).toLowerCase();
    for (const v of VIETATE) expect(testo).not.toContain(v);
  });

  it('senza descrizione la riga dice fornitura di beni strumentali, senza intestatario il nome resta vuoto', () => {
    const p = contenutoPreventivoSimulazione({ importo: 35_000, intestatario: '', descrizione: '' }, i, 'x', OGGI);
    expect(p.righe[0].descrizione).toBe('FORNITURA DI BENI STRUMENTALI');
    expect(p.cliente.ragioneSociale).toBe('');
  });
});
