// I pezzi puri del Pannello MCF per il settore mezzi: la configurazione nel campo di
// testo, il JSON letto prima di chiamare il server, le condizioni sul bene dei canali
// che il pannello mostra ma non cambia, e il canale rimesso insieme al salvataggio.
// La pagina vera (DOM) non ha test: qui sta quello che si puo' sbagliare in silenzio.

import { describe, expect, it } from 'vitest';
import { canaleConservato, condizioniSulBene, configDaTesto, configInTesto, notaConfigurazione } from './admin-mezzi';

const MEZZI = {
  venditori: [{ codice: 'manc', ragioneSociale: 'Manc S.r.l.', piva: '03863700989', categorie: ['Autogru'] }],
  categorie: [{ nome: 'Autogru', targato: true }],
  leasing: { anticipoPerc: 10, partner: [{ partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 }] },
  mostraNomiPartner: true,
};

describe('configInTesto', () => {
  it('la configurazione salvata, a capo con due spazi, e si rilegge identica', () => {
    const t = configInTesto(MEZZI);
    expect(t.startsWith('{\n  "venditori": [\n    {\n      "codice": "manc"')).toBe(true);
    expect(JSON.parse(t)).toEqual(MEZZI);
  });
  it('niente configurazione salvata: campo vuoto, non "null"', () => {
    expect(configInTesto(null)).toBe('');
    expect(configInTesto(undefined)).toBe('');
  });
});

describe('configDaTesto', () => {
  it('un JSON valido torna come oggetto, senza toccarlo', () => {
    expect(configDaTesto(configInTesto(MEZZI))).toEqual({ ok: true, valore: MEZZI });
  });
  it('un JSON che non si legge: errore a parole, con la posizione, che dice che non e\' stato salvato', () => {
    const r = configDaTesto('{ "venditori": [ , ] }');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errore).toMatch(/^Il testo non è un JSON valido \(.+\)\. Nessuna modifica salvata\.$/);
  });
  it('una virgola di troppo o le virgolette dritte mancanti: non e\' JSON', () => {
    expect(configDaTesto('{"a": 1,}').ok).toBe(false);
    expect(configDaTesto("{'a': 1}").ok).toBe(false);
    expect(configDaTesto('{"a": “x”}').ok).toBe(false);
  });
  it('vuoto o solo spazi: lo dice, senza chiamare il server', () => {
    for (const t of ['', '   \n  ']) {
      const r = configDaTesto(t);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.errore).toBe('La configurazione è vuota. Nessuna modifica salvata.');
    }
  });
  it('un JSON che non e\' un oggetto passa: lo giudica il server, col suo messaggio', () => {
    expect(configDaTesto('[]')).toEqual({ ok: true, valore: [] });
    expect(configDaTesto('null')).toEqual({ ok: true, valore: null });
  });
});

describe('condizioniSulBene', () => {
  it('le tre condizioni, con i nomi del pannello', () => {
    expect(condizioniSulBene({ venditori: ['manc'], categorieEscluse: ['Ponteggi', 'Attrezzature'], escludiTargati: true })).toEqual([
      'venditori: manc',
      'categorie escluse: Ponteggi, Attrezzature',
      'esclude i mezzi targati: sì',
    ]);
  });
  it('un canale senza condizioni sul bene (Led Office) non ha righe', () => {
    expect(condizioniSulBene({})).toEqual([]);
  });
  it('venditori vuoto vale "nessuno": il canale non quota niente', () => {
    expect(condizioniSulBene({ venditori: [] })).toEqual(['venditori: nessuno']);
  });
  it('categorie escluse vuote ed esclusione dei targati spenta non cambiano niente: non si mostrano', () => {
    expect(condizioniSulBene({ categorieEscluse: [], escludiTargati: false })).toEqual([]);
  });
  it('l\'esclusione degli usati si mostra solo accesa', () => {
    expect(condizioniSulBene({ escludiTargati: true, escludiUsati: true })).toEqual(['esclude i mezzi targati: sì', 'esclude i mezzi usati: sì']);
    expect(condizioniSulBene({ escludiUsati: false })).toEqual([]);
  });
});

describe('canaleConservato', () => {
  // Cio' che il pannello legge dai campi: le condizioni sul bene non ci sono
  const PANNELLO = ['attivo', 'maggiorazionePerc', 'fatturatoMin', 'importoMin', 'soloCapitali'];
  const SALVATO = {
    canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0,
    venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true,
  };

  it('le condizioni sul bene restano com\'erano, anche se il pannello non le conosce', () => {
    const c = canaleConservato(SALVATO, PANNELLO, { canale: 'grenke', tabella: 'sputnik', attivo: false, maggiorazionePerc: 2 });
    expect(c).toEqual({ ...SALVATO, attivo: false, maggiorazionePerc: 2 });
  });
  it('una condizione che il pannello conosce e che l\'admin ha svuotato sparisce, non ritorna dal salvato', () => {
    const salvato = { ...SALVATO, fatturatoMin: 5_000_000, soloCapitali: true };
    const c = canaleConservato(salvato, PANNELLO, { canale: 'grenke', tabella: 'sputnik', attivo: true, maggiorazionePerc: 0 });
    expect(c).not.toHaveProperty('fatturatoMin');
    expect(c).not.toHaveProperty('soloCapitali');
    expect(c.venditori).toEqual(['manc']);
  });
  it('una condizione scritta o cambiata dall\'admin vince su quella salvata', () => {
    const c = canaleConservato({ ...SALVATO, importoMin: 100 }, PANNELLO, { canale: 'grenke', tabella: 'sputnik', attivo: true, maggiorazionePerc: 0, importoMin: 150_000 });
    expect(c.importoMin).toBe(150_000);
  });
  it('un canale di Led Office, senza condizioni sul bene, esce come prima', () => {
    const lo = { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5, anniMin: 2 };
    const dalPannello = { canale: 'pagarent', tabella: 'pagarent', attivo: true, maggiorazionePerc: 5 };
    expect(canaleConservato(lo, [...PANNELLO, 'anniMin'], dalPannello)).toEqual(dalPannello);
  });
  it('non modifica il canale salvato', () => {
    const copia = structuredClone(SALVATO);
    canaleConservato(SALVATO, PANNELLO, { canale: 'grenke', tabella: 'sputnik', attivo: true, maggiorazionePerc: 0 });
    expect(SALVATO).toEqual(copia);
  });
});

describe('notaConfigurazione', () => {
  it('sui mezzi dice quali campi della configurazione il calcolo non usa, e che cosa fa il leasing acceso', () => {
    const nota = notaConfigurazione('mezzi')!;
    for (const campo of ['listino del noleggio', 'listino affiancato', 'partner del leasing', 'leasing da']) {
      expect(nota.toLowerCase(), campo).toContain(campo);
    }
    // Il leasing acceso non spegne i partner dei mezzi: cambia solo il testo dell'invito
    expect(nota).toContain('Proponi anche il leasing');
    expect(nota).toContain('mail di invito');
    expect(nota).toContain('Venditori, categorie e leasing');
  });

  it('sugli altri settori nessuna nota: i campi contano come sempre', () => {
    for (const settore of ['distinta', 'macchine', 'generico', 'fotovoltaico', '']) {
      expect(notaConfigurazione(settore), settore).toBeNull();
    }
  });
});
