// I dati che la proposta di vendita stampa e che il commerciale scrive dal documento
// d'identita' del cliente. Il server li ricontrolla: quello che manca o non regge
// esce con una chiave stabile, che la pagina mette accanto al campo giusto.

import { describe, expect, it } from 'vitest';
import { leggiDatiVendita } from './dati-vendita';

const OGGI = new Date('2026-10-20T10:00:00Z');

// IBAN di esempio con cifre di controllo corrette
const IBAN = 'IT60X0542811101000000123456';

const COMPLETI = {
  amministratore: { nome: 'Mario Rossi', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: 'Via Roma 1, 81028 Santa Maria a Vico (CE)' },
  telefono: '+39 333 1234567',
  email: 'mario.rossi@example.it',
  riferimento: { nome: 'Anna Bianchi', telefono: '081 1234567' },
  iban: IBAN,
  sdi: 'ABC1234',
  pec: '',
};

/** I dati completi con qualche campo cambiato: "a.b" entra nell'oggetto annidato */
function con(cambi: Record<string, unknown>): Record<string, unknown> {
  const copia = JSON.parse(JSON.stringify(COMPLETI)) as Record<string, any>;
  for (const [chiave, valore] of Object.entries(cambi)) {
    const [a, b] = chiave.split('.');
    if (b) copia[a][b] = valore;
    else copia[a] = valore;
  }
  return copia;
}

const mancanti = (v: unknown) => {
  const r = leggiDatiVendita(v, OGGI);
  return r.ok ? [] : r.mancanti;
};

describe('leggiDatiVendita', () => {
  it('dati completi: ok, con la forma di DatiVendita', () => {
    expect(leggiDatiVendita(COMPLETI, OGGI)).toEqual({
      ok: true,
      dati: {
        amministratore: { nome: 'Mario Rossi', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: 'Via Roma 1, 81028 Santa Maria a Vico (CE)' },
        telefono: '+39 333 1234567',
        email: 'mario.rossi@example.it',
        riferimento: { nome: 'Anna Bianchi', telefono: '081 1234567' },
        iban: IBAN,
        sdi: 'ABC1234',
        pec: '',
      },
    });
  });

  it('senza oggi usa la data di oggi: i dati completi passano', () => {
    expect(leggiDatiVendita(COMPLETI).ok).toBe(true);
  });

  it('nome, residenza e riferimento si ripuliscono dagli spazi ai bordi', () => {
    const r = leggiDatiVendita(con({ 'amministratore.nome': '  Mario Rossi ', 'amministratore.residenza': ' Via Roma 1 ', 'riferimento.nome': ' Anna ' }), OGGI);
    expect(r.ok && [r.dati.amministratore.nome, r.dati.amministratore.residenza, r.dati.riferimento.nome]).toEqual(['Mario Rossi', 'Via Roma 1', 'Anna']);
  });

  describe('codice fiscale', () => {
    it('minuscolo e con spazi ai bordi: si normalizza in maiuscolo', () => {
      const r = leggiDatiVendita(con({ 'amministratore.codiceFiscale': ' rssmra79c15h501z ' }), OGGI);
      expect(r.ok && r.dati.amministratore.codiceFiscale).toBe('RSSMRA79C15H501Z');
    });

    it('di 15 caratteri: manca', () => {
      expect(mancanti(con({ 'amministratore.codiceFiscale': 'RSSMRA79C15H501' }))).toEqual(['amministratore.codiceFiscale']);
    });

    it('di 17 caratteri o con simboli: manca', () => {
      expect(mancanti(con({ 'amministratore.codiceFiscale': 'RSSMRA79C15H501ZZ' }))).toEqual(['amministratore.codiceFiscale']);
      expect(mancanti(con({ 'amministratore.codiceFiscale': 'RSSMRA79C15H501-' }))).toEqual(['amministratore.codiceFiscale']);
    });
  });

  describe('data di nascita', () => {
    it('31/02/1979 non esiste', () => {
      expect(mancanti(con({ 'amministratore.nascita': '31/02/1979' }))).toEqual(['amministratore.nascita']);
    });

    it('29 febbraio: bisestile si, secolare non bisestile no', () => {
      expect(leggiDatiVendita(con({ 'amministratore.nascita': '29/02/2000' }), OGGI).ok).toBe(true);
      expect(mancanti(con({ 'amministratore.nascita': '29/02/1900' }))).toEqual(['amministratore.nascita']);
    });

    it('giorno e mese senza zero iniziale si completano', () => {
      const r = leggiDatiVendita(con({ 'amministratore.nascita': '5/3/1979' }), OGGI);
      expect(r.ok && r.dati.amministratore.nascita).toBe('05/03/1979');
    });

    it('nel futuro, di oggi o con l\'anno a due cifre: non regge', () => {
      expect(mancanti(con({ 'amministratore.nascita': '21/10/2026' }))).toEqual(['amministratore.nascita']);
      expect(mancanti(con({ 'amministratore.nascita': '20/10/2026' }))).toEqual(['amministratore.nascita']);
      expect(mancanti(con({ 'amministratore.nascita': '15/03/79' }))).toEqual(['amministratore.nascita']);
      expect(mancanti(con({ 'amministratore.nascita': '15/03/0079' }))).toEqual(['amministratore.nascita']);
    });

    it('il giorno prima di oggi va bene, e oggi e\' il giorno italiano', () => {
      expect(leggiDatiVendita(con({ 'amministratore.nascita': '19/10/2026' }), OGGI).ok).toBe(true);
      // 23:30 UTC del 20 ottobre sono le 01:30 del 21 a Roma (l'ora legale finisce il 25)
      expect(leggiDatiVendita(con({ 'amministratore.nascita': '20/10/2026' }), new Date('2026-10-20T23:30:00Z')).ok).toBe(true);
    });

    it('scritta in altro modo: manca', () => {
      expect(mancanti(con({ 'amministratore.nascita': '1979-03-15' }))).toEqual(['amministratore.nascita']);
      expect(mancanti(con({ 'amministratore.nascita': '' }))).toEqual(['amministratore.nascita']);
    });
  });

  describe('SDI e PEC: almeno uno', () => {
    it('senza SDI e senza PEC: sdi_o_pec', () => {
      expect(mancanti(con({ sdi: '', pec: '' }))).toEqual(['sdi_o_pec']);
    });

    it('SDI di 7 caratteri senza PEC: ok, e va in maiuscolo', () => {
      const r = leggiDatiVendita(con({ sdi: 'abc1234', pec: '' }), OGGI);
      expect(r.ok && [r.dati.sdi, r.dati.pec]).toEqual(['ABC1234', '']);
    });

    it('solo la PEC: ok', () => {
      const r = leggiDatiVendita(con({ sdi: '', pec: ' azienda@pec.example.it ' }), OGGI);
      expect(r.ok && [r.dati.sdi, r.dati.pec]).toEqual(['', 'azienda@pec.example.it']);
    });

    it('SDI di 6 caratteri, senza PEC: non va', () => {
      expect(mancanti(con({ sdi: 'ABC123', pec: '' }))).toEqual(['sdi_o_pec']);
    });

    it('un valore scritto male non passa nemmeno se l\'altro e\' buono', () => {
      expect(mancanti(con({ sdi: 'ABC123', pec: 'azienda@pec.example.it' }))).toEqual(['sdi_o_pec']);
      expect(mancanti(con({ sdi: 'ABC1234', pec: 'senza-chiocciola' }))).toEqual(['sdi_o_pec']);
    });

    it('tutti e due buoni: ok', () => {
      expect(leggiDatiVendita(con({ sdi: 'ABC1234', pec: 'azienda@pec.example.it' }), OGGI).ok).toBe(true);
    });
  });

  describe('IBAN, telefono, email', () => {
    it('IBAN sbagliato: iban', () => {
      expect(mancanti(con({ iban: 'IT60X0542811101000000123457' }))).toEqual(['iban']);
      expect(mancanti(con({ iban: '' }))).toEqual(['iban']);
    });

    it('IBAN scritto a gruppi e in minuscolo: esce normalizzato', () => {
      const r = leggiDatiVendita(con({ iban: 'it60 x054 2811 1010 0000 0123 456' }), OGGI);
      expect(r.ok && r.dati.iban).toBe(IBAN);
    });

    it('cellulare e email del firmatario', () => {
      expect(mancanti(con({ telefono: '12' }))).toEqual(['telefono']);
      expect(mancanti(con({ telefono: '' }))).toEqual(['telefono']);
      expect(mancanti(con({ email: 'mario.rossi' }))).toEqual(['email']);
      expect(mancanti(con({ email: '' }))).toEqual(['email']);
    });
  });

  describe('persona di riferimento', () => {
    it('senza nome: riferimento.nome', () => {
      expect(mancanti(con({ 'riferimento.nome': '  ' }))).toEqual(['riferimento.nome']);
    });

    it('il telefono del riferimento e\' facoltativo, ma se c\'e\' deve essere un numero', () => {
      const senza = leggiDatiVendita(con({ 'riferimento.telefono': '' }), OGGI);
      expect(senza.ok && senza.dati.riferimento.telefono).toBe('');
      expect(mancanti(con({ 'riferimento.telefono': 'dopo le 17' }))).toEqual(['riferimento.telefono']);
    });
  });

  describe('piu\' campi insieme', () => {
    it('le chiavi escono tutte, nell\'ordine del modulo', () => {
      expect(
        mancanti(
          con({
            'amministratore.nome': '',
            'amministratore.nascita': '',
            'amministratore.codiceFiscale': '',
            'amministratore.residenza': '',
            telefono: '',
            email: '',
            'riferimento.nome': '',
            iban: '',
            sdi: '',
            pec: '',
          }),
        ),
      ).toEqual([
        'amministratore.nome',
        'amministratore.nascita',
        'amministratore.codiceFiscale',
        'amministratore.residenza',
        'telefono',
        'email',
        'riferimento.nome',
        'iban',
        'sdi_o_pec',
      ]);
    });

    it('non e\' un oggetto, o ne mancano pezzi interi: tutto manca', () => {
      const tutte = [
        'amministratore.nome',
        'amministratore.nascita',
        'amministratore.codiceFiscale',
        'amministratore.residenza',
        'telefono',
        'email',
        'riferimento.nome',
        'iban',
        'sdi_o_pec',
      ];
      for (const v of [null, undefined, 'dati', 42, [], {}]) expect(mancanti(v)).toEqual(tutte);
    });

    it('campi che non sono testo non passano', () => {
      expect(mancanti(con({ 'amministratore.nome': 5, telefono: { a: 1 }, 'riferimento.nome': ['Anna'] }))).toEqual(['amministratore.nome', 'telefono', 'riferimento.nome']);
    });
  });
});
