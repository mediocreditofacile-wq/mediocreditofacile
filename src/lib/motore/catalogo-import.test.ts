// Le righe del catalogo incollate da Excel: colonne del fotovoltaico come prima,
// e quelle nuove del settore macchine.

import { describe, expect, it } from 'vitest';
import { leggiIncollato, leggiVoce } from './catalogo-import';

describe('righe del catalogo', () => {
  it('macchina con famiglia e allestimento', () => {
    expect(leggiVoce({ codice: 'duplex 340 cavo', nome: 'Duplex 340 a cavo', prezzo: '1.931,00', famiglia: 'Duplex 340', allestimento: 'Cavo' }))
      .toEqual({ codice: 'DUPLEX-340-CAVO', nome: 'Duplex 340 a cavo', descrizione: null, prezzo: 1931, attributi: { famiglia: 'Duplex 340', allestimento: 'cavo' } });
  });
  it('accessorio con passo, massimo e nota', () => {
    expect(leggiVoce({ codice: 'UX-MICROFIBRA', nome: 'Spazzola microfibra bianca', prezzo: '119', famiglia: 'Ultrax 45', tipo: 'Accessorio', passo: '2', massimo: '4', nota: 'in coppia' })?.attributi)
      .toEqual({ famiglia: 'Ultrax 45', tipo: 'accessorio', passo: 2, massimo: 4, nota: 'in coppia' });
  });
  it('accessorio legato a un allestimento: la batteria di scorta solo sulla versione a batteria', () => {
    expect(leggiVoce({ codice: 'D340-BATTERIA-LITE', nome: 'Batteria di scorta LITE Li-ion 48V', prezzo: '390,00', famiglia: 'Duplex 340', allestimento: 'Batteria', tipo: 'accessorio', passo: '1', massimo: '2' })?.attributi)
      .toEqual({ famiglia: 'Duplex 340', tipo: 'accessorio', allestimento: 'batteria', passo: 1, massimo: 2 });
  });
  it('accessorio con un allestimento che non esiste: scartato, altrimenti finirebbe su tutte le macchine', () => {
    expect(leggiVoce({ codice: 'X', nome: 'Batteria', prezzo: '50', famiglia: 'F', tipo: 'accessorio', allestimento: 'batterie' })).toBeNull();
  });
  it('dalle righe incollate: la colonna alimentazione vale come allestimento', () => {
    const r = leggiIncollato('codice\tnome\tprezzo\tfamiglia\talimentazione\ttipo\tmassimo\nD420-BATTERIA-PRO\tBatteria di scorta PRO Li-ion 48V\t595,00\tDuplex 420\tbatteria\taccessorio\t2');
    expect(leggiVoce(r[0])?.attributi).toEqual({ famiglia: 'Duplex 420', tipo: 'accessorio', allestimento: 'batteria', passo: 1, massimo: 2 });
  });
  it('accessorio senza famiglia: scartato', () => {
    expect(leggiVoce({ codice: 'X', nome: 'Spazzola', prezzo: '50', tipo: 'accessorio' })).toBeNull();
  });
  it('massimo sotto il passo: si alza al passo', () => {
    expect(leggiVoce({ codice: 'X', nome: 'Spazzola', prezzo: '50', famiglia: 'F', tipo: 'accessorio', passo: '2', massimo: '1' })?.attributi.massimo).toBe(2);
  });
  it('le colonne del fotovoltaico funzionano come prima', () => {
    expect(leggiVoce({ codice: 'PV-20', nome: 'Impianto 20 kWp', prezzo: '24000', kwp: '20', kwh_accumulo: '10', installazione: 'Tetto' })?.attributi)
      .toEqual({ kwp: 20, kwh_accumulo: 10, installazione: 'tetto' });
  });
  it('senza codice, nome o prezzo: scartata', () => {
    expect(leggiVoce({ nome: 'X', prezzo: '10' })).toBeNull();
    expect(leggiVoce({ codice: 'X', prezzo: '10' })).toBeNull();
    expect(leggiVoce({ codice: 'X', nome: 'X', prezzo: '0' })).toBeNull();
  });
});

describe('righe incollate da Excel, colonna note', () => {
  const voce = (testo: string) => leggiVoce(leggiIncollato(testo)[0]);
  it('sugli accessori la colonna note diventa la nota', () => {
    const v = voce('codice\tnome\tprezzo\tfamiglia\ttipo\tpasso\tmassimo\tnote\nUX-MICROFIBRA\tSpazzola microfibra\t119\tUltrax 45\taccessorio\t2\t4\tin coppia');
    expect(v?.attributi.nota).toBe('in coppia');
    expect(v?.descrizione).toBeNull();
  });
  it('su una voce senza descrizione la colonna note resta la descrizione, come prima', () => {
    expect(voce('codice;nome;prezzo;note\nPV-20;Impianto 20 kWp;24000;Moduli monocristallini')?.descrizione).toBe('Moduli monocristallini');
  });
  it('con descrizione e note sulla stessa macchina vince la descrizione', () => {
    const v = voce('codice;nome;prezzo;famiglia;descrizione;note\nULTRAX-45;Ultrax 45;4290;Ultrax 45;Lavasciuga compatta;da magazzino');
    expect(v?.descrizione).toBe('Lavasciuga compatta');
    expect(v?.attributi.nota).toBeUndefined();
  });
});
