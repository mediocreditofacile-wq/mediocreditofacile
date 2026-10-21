// I dati che la proposta di vendita stampa. Dal 21/10/2026 il commerciale scrive solo
// cellulare ed email del firmatario e l'IBAN; firmatario, PEC e codice SDI li sa il
// Registro, e SDI o PEC si chiedono solo quando il Registro non ne ha. Il server li
// ricontrolla: quello che manca o non regge esce con una chiave stabile.

import { describe, expect, it } from 'vitest';
import { leggiDatiVendita, type RegistroVendita } from './dati-vendita';

// IBAN di esempio con cifre di controllo corrette
const IBAN = 'IT60X0542811101000000123456';

const SCRITTI = {
  telefono: '+39 333 1234567',
  email: 'mario.rossi@example.it',
  iban: IBAN,
  sdi: '',
  pec: '',
};

const FIRMATARIO = { nome: 'MARIO ROSSI', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z' };

const CON_PEC: RegistroVendita = { firmatario: FIRMATARIO, fatturazione: { pec: 'rossi@pec.example.it', sdi: null } };
const SENZA_RECAPITI: RegistroVendita = { firmatario: FIRMATARIO, fatturazione: { pec: null, sdi: null } };

const mancanti = (v: unknown, r: RegistroVendita = CON_PEC) => {
  const e = leggiDatiVendita(v, r);
  return e.ok ? [] : e.mancanti;
};

describe('leggiDatiVendita', () => {
  it('cellulare, email e IBAN bastano quando il Registro ha la PEC', () => {
    expect(leggiDatiVendita(SCRITTI, CON_PEC)).toEqual({
      ok: true,
      dati: {
        amministratore: { nome: 'MARIO ROSSI', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: '' },
        telefono: '+39 333 1234567',
        email: 'mario.rossi@example.it',
        riferimento: { nome: 'MARIO ROSSI', telefono: '+39 333 1234567' },
        iban: IBAN,
        sdi: '',
        pec: 'rossi@pec.example.it',
      },
    });
  });

  it('i recapiti del Registro valgono anche se il browser ne manda altri', () => {
    const r = leggiDatiVendita({ ...SCRITTI, sdi: 'ZZZ9999', pec: 'altra@pec.example.it' }, {
      firmatario: FIRMATARIO, fatturazione: { pec: 'rossi@pec.example.it', sdi: 'ABC1234' },
    });
    expect(r.ok && [r.dati.sdi, r.dati.pec]).toEqual(['ABC1234', 'rossi@pec.example.it']);
  });

  it('i dati del vecchio modulo si ignorano: amministratore e riferimento vengono dal Registro', () => {
    const vecchi = { ...SCRITTI, amministratore: { nome: 'Altro Nome', residenza: 'Via Roma 1' }, riferimento: { nome: 'Anna' } };
    const r = leggiDatiVendita(vecchi, CON_PEC);
    expect(r.ok && r.dati.amministratore).toEqual({ ...FIRMATARIO, residenza: '' });
    expect(r.ok && r.dati.riferimento.nome).toBe('MARIO ROSSI');
  });

  it('senza firmatario nel Registro la proposta esce con i suoi campi vuoti', () => {
    const r = leggiDatiVendita(SCRITTI, { firmatario: null, fatturazione: { pec: 'rossi@pec.example.it', sdi: null } });
    expect(r.ok && r.dati.amministratore).toEqual({ nome: '', nascita: '', codiceFiscale: '', residenza: '' });
  });

  it('cellulare, email e IBAN mancanti: tre chiavi nell\'ordine del modulo', () => {
    expect(mancanti({})).toEqual(['telefono', 'email', 'iban']);
    expect(mancanti(null)).toEqual(['telefono', 'email', 'iban']);
  });

  it('un cellulare che non e\' un numero non passa', () => {
    expect(mancanti({ ...SCRITTI, telefono: 'chiamare in ufficio' })).toEqual(['telefono']);
  });

  it('un IBAN sbagliato non passa, uno scritto con spazi e minuscole si normalizza', () => {
    expect(mancanti({ ...SCRITTI, iban: 'IT00X0542811101000000123456' })).toEqual(['iban']);
    const r = leggiDatiVendita({ ...SCRITTI, iban: 'it60 x054 2811 1010 0000 0123 456' }, CON_PEC);
    expect(r.ok && r.dati.iban).toBe(IBAN);
  });

  describe('codice SDI o PEC, solo se il Registro non ne ha', () => {
    it('nessuno dei due: sdi_o_pec', () => {
      expect(mancanti(SCRITTI, SENZA_RECAPITI)).toEqual(['sdi_o_pec']);
    });

    it('basta il codice SDI, in maiuscolo', () => {
      const r = leggiDatiVendita({ ...SCRITTI, sdi: 'abc1234' }, SENZA_RECAPITI);
      expect(r.ok && [r.dati.sdi, r.dati.pec]).toEqual(['ABC1234', '']);
    });

    it('basta la PEC', () => {
      const r = leggiDatiVendita({ ...SCRITTI, pec: ' azienda@pec.example.it ' }, SENZA_RECAPITI);
      expect(r.ok && r.dati.pec).toBe('azienda@pec.example.it');
    });

    it('un valore storto non passa neanche quando l\'altro e\' buono', () => {
      expect(mancanti({ ...SCRITTI, sdi: 'AB12', pec: 'azienda@pec.example.it' }, SENZA_RECAPITI)).toEqual(['sdi_o_pec']);
      expect(mancanti({ ...SCRITTI, sdi: 'ABC1234', pec: 'non-una-pec' }, SENZA_RECAPITI)).toEqual(['sdi_o_pec']);
    });

    it('con il solo codice SDI nel Registro non si chiede niente', () => {
      expect(mancanti(SCRITTI, { firmatario: FIRMATARIO, fatturazione: { pec: null, sdi: 'ABC1234' } })).toEqual([]);
    });
  });
});
