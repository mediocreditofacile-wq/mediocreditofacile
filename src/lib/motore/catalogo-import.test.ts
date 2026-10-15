// Le righe del catalogo incollate da Excel: colonne del fotovoltaico come prima,
// e quelle nuove del settore macchine.

import { describe, expect, it } from 'vitest';
import { leggiVoce } from './catalogo-import';

describe('righe del catalogo', () => {
  it('macchina con famiglia e allestimento', () => {
    expect(leggiVoce({ codice: 'duplex 340 cavo', nome: 'Duplex 340 a cavo', prezzo: '1.931,00', famiglia: 'Duplex 340', allestimento: 'Cavo' }))
      .toEqual({ codice: 'DUPLEX-340-CAVO', nome: 'Duplex 340 a cavo', descrizione: null, prezzo: 1931, attributi: { famiglia: 'Duplex 340', allestimento: 'cavo' } });
  });
  it('accessorio con passo, massimo e nota', () => {
    expect(leggiVoce({ codice: 'UX-MICROFIBRA', nome: 'Spazzola microfibra bianca', prezzo: '119', famiglia: 'Ultrax 45', tipo: 'Accessorio', passo: '2', massimo: '4', nota: 'in coppia' })?.attributi)
      .toEqual({ famiglia: 'Ultrax 45', tipo: 'accessorio', passo: 2, massimo: 4, nota: 'in coppia' });
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
