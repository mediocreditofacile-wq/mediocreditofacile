// Le righe del catalogo incollate da Excel: colonne del fotovoltaico come prima,
// e quelle nuove del settore macchine.

import { describe, expect, it } from 'vitest';
import { AMBIGUO_KWP, leggiIncollato, leggiVoce, leggiVoceConMotivo, numero, numeroDecimale } from './catalogo-import';

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

describe('righe del catalogo, categoria e validità (settore distinta)', () => {
  it('categoria e valido_fino in formato italiano: validità scritta AAAA-MM-GG', () => {
    expect(leggiVoce({ codice: 'LO-SRV-1', nome: 'Server tower', prezzo: '1.900', categoria: 'Server e stampa', valido_fino: '31/12/2026' }))
      .toEqual({ codice: 'LO-SRV-1', nome: 'Server tower', descrizione: null, prezzo: 1900, attributi: { categoria: 'Server e stampa', valido_fino: '2026-12-31' } });
  });
  it('valido_fino già in formato AAAA-MM-GG resta com\'è', () => {
    expect(leggiVoce({ codice: 'X', nome: 'X', prezzo: '10', valido_fino: '2027-03-01' })?.attributi).toEqual({ valido_fino: '2027-03-01' });
  });
  it('giorno e mese a una cifra, come li copia Excel: 1/3/2027', () => {
    expect(leggiVoce({ codice: 'X', nome: 'X', prezzo: '10', valido_fino: '1/3/2027' })?.attributi.valido_fino).toBe('2027-03-01');
  });
  it('data impossibile: il campo non c\'è, la voce resta valida', () => {
    for (const d of ['31/02/2026', '2026-13-01', '00/01/2026', 'fine anno', '12/2026']) {
      const v = leggiVoce({ codice: 'X', nome: 'X', prezzo: '10', categoria: 'Server e stampa', valido_fino: d });
      expect(v, d).not.toBeNull();
      expect(v?.attributi, d).toEqual({ categoria: 'Server e stampa' });
    }
  });
  it('validità vuota o categoria vuota: nessun attributo', () => {
    expect(leggiVoce({ codice: 'X', nome: 'X', prezzo: '10', categoria: '  ', valido_fino: '' })?.attributi).toEqual({});
  });
  it('dall\'incollato: sinonimi famiglia_prodotto, validità con l\'accento e scadenza', () => {
    const a = leggiIncollato('codice\tnome\tprezzo\tfamiglia_prodotto\tValidità\nLO-DS-1\tMonitor 55"\t890\tDigital signage e display\t30/06/2027');
    expect(leggiVoce(a[0])?.attributi).toEqual({ categoria: 'Digital signage e display', valido_fino: '2027-06-30' });
    const b = leggiIncollato('codice;nome;prezzo;categoria;scadenza\nLO-PER-1;Tablet;450;Periferiche e tablet;2027-01-31');
    expect(leggiVoce(b[0])?.attributi).toEqual({ categoria: 'Periferiche e tablet', valido_fino: '2027-01-31' });
    const c = leggiIncollato('codice;nome;prezzo;categoria;validita\nLO-PER-2;Mouse;20;Periferiche e tablet;31/12/2026');
    expect(leggiVoce(c[0])?.attributi.valido_fino).toBe('2026-12-31');
    const d = leggiIncollato('codice;nome;prezzo;categoria;valido_fino\nLO-PER-3;Tastiera;30;Periferiche e tablet;31/12/2026');
    expect(leggiVoce(d[0])?.attributi.valido_fino).toBe('2026-12-31');
  });
  it('le righe del fotovoltaico e delle macchine non prendono attributi nuovi', () => {
    expect(leggiVoce({ codice: 'PV-20', nome: 'Impianto 20 kWp', prezzo: '24000', kwp: '20' })?.attributi).toEqual({ kwp: 20 });
  });
});

describe('numeri all\'italiana', () => {
  it('il punto delle migliaia senza decimali, come lo copia Excel: 1.900 e\' 1900, non 1,90', () => {
    expect(numero('1.900')).toBe(1900);
    expect(numero('12.500')).toBe(12500);
    expect(numero('1.234.567')).toBe(1234567);
    expect(numero('€ 1.900')).toBe(1900);
  });
  it('con la virgola o con decimali che non sono migliaia: come prima', () => {
    expect(numero('1.931,00')).toBe(1931);
    expect(numero('390,00')).toBe(390);
    expect(numero('1.5')).toBe(1.5);
    expect(numero('19.80')).toBe(19.8);
    expect(numero('1931')).toBe(1931);
    expect(numero(12.5)).toBe(12.5);
  });
});

describe('kWp e kWh: il punto seguito da tre cifre non si indovina (Ruling 18)', () => {
  const base = { codice: 'PV-6', nome: 'Impianto 6 kWp', prezzo: '9.800' };
  it('kWp "6.375": riga scartata col motivo, mai letta come 6375 o 6,375', () => {
    expect(leggiVoceConMotivo({ ...base, kwp: '6.375' })).toEqual({ ok: false, motivo: AMBIGUO_KWP });
    expect(AMBIGUO_KWP).toBe('kWp/kWh ambiguo: scrivi 6,375 o 6375');
    expect(leggiVoce({ ...base, kwp: '6.375' })).toBeNull();
  });
  it('kWh "10.240" e la colonna accumulo dall\'incollato: scartata allo stesso modo', () => {
    expect(leggiVoceConMotivo({ ...base, kwh_accumulo: '10.240' })).toEqual({ ok: false, motivo: AMBIGUO_KWP });
    const r = leggiIncollato('codice;nome;prezzo;kwp;accumulo\nPV-6;Impianto;9800;6,4;10.240');
    expect(leggiVoceConMotivo(r[0])).toEqual({ ok: false, motivo: AMBIGUO_KWP });
  });
  it('"6,375" e\' 6,375; "6.4" e\' 6,4; "6375" e\' 6375; i numeri veri restano', () => {
    expect(leggiVoce({ ...base, kwp: '6,375' })?.attributi.kwp).toBe(6.375);
    expect(leggiVoce({ ...base, kwp: '6.4' })?.attributi.kwp).toBe(6.4);
    expect(leggiVoce({ ...base, kwp: '6375' })?.attributi.kwp).toBe(6375);
    expect(leggiVoce({ ...base, kwp: 6.375, kwh_accumulo: 10.24 })?.attributi).toEqual({ kwp: 6.375, kwh_accumulo: 10.24 });
  });
  it('il prezzo resta all\'italiana: "1.931" e\' 1931, anche con kWp scritto bene', () => {
    expect(leggiVoce({ ...base, prezzo: '1.931', kwp: '6,375' })?.prezzo).toBe(1931);
  });
  it('passo e massimo degli accessori: "1.000" scartato, mai 1 o 1000 a caso', () => {
    const acc = { codice: 'X', nome: 'Spazzola', prezzo: '50', famiglia: 'F', tipo: 'accessorio' };
    const e = leggiVoceConMotivo({ ...acc, massimo: '1.000' });
    expect(e.ok).toBe(false);
    expect(e.ok ? '' : e.motivo).toMatch(/massimo ambiguo/);
    expect(leggiVoce({ ...acc, passo: '2', massimo: '4' })?.attributi).toMatchObject({ passo: 2, massimo: 4 });
  });
  it('numeroDecimale: ambiguo = NaN, il resto come prima', () => {
    expect(numeroDecimale('6.375')).toBeNaN();
    expect(numeroDecimale('1.234,5')).toBe(1234.5);
    expect(numeroDecimale('6,375')).toBe(6.375);
    expect(numeroDecimale('19.80')).toBe(19.8);
    expect(numeroDecimale(6.375)).toBe(6.375);
    expect(numeroDecimale('')).toBeNaN();
  });
  it('le righe valide escono con ok e la voce', () => {
    expect(leggiVoceConMotivo({ ...base, kwp: '6,4' })).toMatchObject({ ok: true, voce: { codice: 'PV-6', prezzo: 9800, attributi: { kwp: 6.4 } } });
  });
});
