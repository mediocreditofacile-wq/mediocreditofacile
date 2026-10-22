// La carrozzeria dalla riga del database: i default delle tre impostazioni
// nuove lasciano gli altri fornitori esattamente com'erano.

import { describe, expect, it } from 'vitest';
import { carrozzeriaDaRiga, carrozzeriaPerBrowser, prodottoAmmesso, proposteOfferte, type RigaCarrozzeria } from './carrozzeria';

const RIGA: RigaCarrozzeria = {
  slug: 'x', nome: 'X', citta: null, prefisso: 'XX', organization_id: 'org', tabella_canoni: 'sputnik',
  brand_logo: null, brand_colore: null, brand_accento: null, attivo: true, settore: 'generico',
  etichetta_bene: 'Bene', partner_leasing: 'alba', soglia_leasing: '0', tetto_mese_euro: '30', demo: false,
  documenti_extra: [], tabella_alternativa: null, regole_semaforo: 'credit-policy', leasing: true,
  prezzo_verifica: null,
};

describe('carrozzeria dalla riga', () => {
  it('i default lasciano tutto com era', () => {
    const c = carrozzeriaDaRiga(RIGA);
    expect(c.settore).toBe('generico');
    expect(c.tabellaAlternativa).toBeNull();
    expect(c.regoleSemaforo).toBe('credit-policy');
    expect(c.leasing).toBe(true);
  });

  it('legge il settore macchine e le tre impostazioni', () => {
    const c = carrozzeriaDaRiga({
      ...RIGA, settore: 'macchine', tabella_alternativa: 'grace-duplex', regole_semaforo: 'locatore', leasing: false,
    });
    expect(c.settore).toBe('macchine');
    expect(c.tabellaAlternativa).toBe('grace-duplex');
    expect(c.regoleSemaforo).toBe('locatore');
    expect(c.leasing).toBe(false);
  });

  it('un valore sconosciuto torna al default sicuro', () => {
    const c = carrozzeriaDaRiga({ ...RIGA, settore: 'boh', regole_semaforo: 'boh', tabella_alternativa: '' });
    expect(c.settore).toBe('generico');
    expect(c.regoleSemaforo).toBe('credit-policy');
    expect(c.tabellaAlternativa).toBeNull();
  });
});

describe('settore distinta e regole prefiltro', () => {
  it('una riga senza i quattro campi nuovi li da a null e lascia le regole com erano', () => {
    const c = carrozzeriaDaRiga(RIGA);
    expect(c.canali).toBeNull();
    expect(c.societaFornitrice).toBeNull();
    expect(c.checklist).toBeNull();
    expect(c.categorie).toBeNull();
    expect(c.regoleSemaforo).toBe('credit-policy');
  });

  it('riporta settore distinta e regole prefiltro', () => {
    const c = carrozzeriaDaRiga({ ...RIGA, settore: 'distinta', regole_semaforo: 'prefiltro' });
    expect(c.settore).toBe('distinta');
    expect(c.regoleSemaforo).toBe('prefiltro');
  });

  it('le regole del locatore restano quelle di Duplex', () => {
    expect(carrozzeriaDaRiga({ ...RIGA, regole_semaforo: 'locatore' }).regoleSemaforo).toBe('locatore');
  });

  it('legge canali, societa, checklist e categorie dal JSON della riga', () => {
    const c = carrozzeriaDaRiga({
      ...RIGA,
      canali: [{ canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 }],
      societa_fornitrice: {
        ragioneSociale: 'EMME 2 SERVIZI S.R.L.', piva: '01234567890', rea: 'RM-1', indirizzo: 'Via Roma 1',
        telefono: '06 1', email: 'a@b.it', pec: 'a@pec.it', logo: null,
      },
      checklist: { formati: ['pdf'], voci: [{ nome: 'Visura', obbligatoria: true }] },
      categorie: [{ nome: 'Postazioni', settoriTipici: ['62.0'], postazione: true, ledwall: false }],
    });
    expect(c.canali).toEqual([{ canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 }]);
    expect(c.societaFornitrice?.ragioneSociale).toBe('EMME 2 SERVIZI S.R.L.');
    expect(c.checklist?.voci[0].nome).toBe('Visura');
    expect(c.categorie?.[0].settoriTipici).toEqual(['620']);
  });

  it('un JSON che non si legge torna a null: si ricade sul comportamento di sempre', () => {
    const c = carrozzeriaDaRiga({ ...RIGA, canali: 'boh', societa_fornitrice: [], checklist: { voci: [] }, categorie: {} });
    expect(c.canali).toBeNull();
    expect(c.societaFornitrice).toBeNull();
    expect(c.checklist).toBeNull();
    expect(c.categorie).toBeNull();
  });
});

describe('prezzo per richiesta di verifica', () => {
  it('senza prezzo non si fattura niente', () => {
    expect(carrozzeriaDaRiga(RIGA).prezzoVerifica).toBeNull();
  });
  it('legge il prezzo impostato', () => {
    expect(carrozzeriaDaRiga({ ...RIGA, prezzo_verifica: '5.00' }).prezzoVerifica).toBe(5);
  });
});

describe('prodotto della pratica', () => {
  it('col leasing spento si carica solo noleggio', () => {
    expect(prodottoAmmesso(carrozzeriaDaRiga({ ...RIGA, leasing: false }), 'leasing')).toBe('noleggio');
  });
  it('col leasing acceso si rispetta la scelta', () => {
    expect(prodottoAmmesso(carrozzeriaDaRiga(RIGA), 'leasing')).toBe('leasing');
    expect(prodottoAmmesso(carrozzeriaDaRiga(RIGA), 'altro')).toBe('noleggio');
  });
});

describe('testo della pagina di accesso', () => {
  it('col leasing spento non lo promette', () => {
    expect(proposteOfferte(carrozzeriaDaRiga({ ...RIGA, leasing: false }))).toBe('proposte di noleggio operativo');
  });
  it('col leasing acceso nomina tutti e due', () => {
    expect(proposteOfferte(carrozzeriaDaRiga(RIGA))).toBe('proposte di noleggio operativo e di leasing');
  });
});

describe('la carrozzeria per il browser', () => {
  // La riga di Led Office come la scrive il seed: canali con la maggiorazione,
  // societa' fornitrice, checklist e categorie coi settori tipici
  const LED_OFFICE = carrozzeriaDaRiga({
    ...RIGA,
    settore: 'distinta',
    regole_semaforo: 'prefiltro',
    canali: [
      { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000 },
      { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 },
    ],
    societa_fornitrice: {
      ragioneSociale: 'EMME 2 SERVIZI S.R.L.', piva: '01234567890', rea: 'RM-1', indirizzo: 'Via Roma 1',
      telefono: '06 1', email: 'a@b.it', pec: 'a@pec.it', logo: 'brand/emme2.png',
    },
    checklist: {
      formati: ['pdf', 'jpg'],
      voci: [
        { nome: 'Visura camerale', obbligatoria: false },
        { nome: 'Situazione contabile dell\'anno', obbligatoria: false, sopraImporto: 50_000 },
        { nome: 'Ultimi due bilanci', obbligatoria: false, forme: ['capitali'] },
      ],
    },
    categorie: [
      { nome: 'Postazioni', settoriTipici: ['62.0'], postazione: true, ledwall: false },
      { nome: 'LEDwall', settoriTipici: [], postazione: false, ledwall: true },
    ],
  });

  it('non porta canali, maggiorazioni, listini ne\' la societa\' fornitrice', () => {
    const testo = JSON.stringify(carrozzeriaPerBrowser(LED_OFFICE));
    for (const vietato of ['canali', 'maggiorazione', 'pagarent', 'econocom', 'societa', 'EMME 2', 'brand/emme2', 'settoriTipici', 'tabella']) {
      expect(testo).not.toContain(vietato);
    }
  });

  it('porta categorie (nome e flag) e checklist', () => {
    const b = carrozzeriaPerBrowser(LED_OFFICE);
    expect(b.categorie).toEqual([
      { nome: 'Postazioni', postazione: true, ledwall: false },
      { nome: 'LEDwall', postazione: false, ledwall: true },
    ]);
    expect(b.checklist).toEqual({
      formati: ['pdf', 'jpg'],
      voci: [
        { nome: 'Visura camerale', obbligatoria: false },
        { nome: 'Situazione contabile dell\'anno', obbligatoria: false, sopraImporto: 50_000 },
        { nome: 'Ultimi due bilanci', obbligatoria: false, forme: ['capitali'] },
      ],
    });
    expect(b.settore).toBe('distinta');
  });

  it('gli altri fornitori ricevono quello di sempre, con categorie e checklist a null', () => {
    const c = carrozzeriaDaRiga({ ...RIGA, brand_colore: '#123456', brand_accento: '#abcdef', documenti_extra: ['Offerta'] });
    expect(carrozzeriaPerBrowser(c)).toEqual({
      slug: 'x', nome: 'X', citta: null, settore: 'generico', etichettaBene: 'Bene', sogliaLeasing: 0, leasing: true,
      demo: false, colore: '#123456', accento: '#abcdef', documentiExtra: ['Offerta'], categorie: null, checklist: null,
      mezzi: null,
    });
  });
});

// La configurazione mezzi come la scrive il seed: P.IVA dei venditori, recapiti e
// spread dei partner stanno in app.carrozzeria.mezzi e non devono mai uscire
const MEZZI_JSON = {
  venditori: [
    {
      codice: 'manc', ragioneSociale: 'Manc S.r.l.', piva: '05400750260', indirizzo: 'Via Roma 1, Treviso',
      telefono: '0422 000000', email: 'info@manc.example', pec: 'manc@pec.example', categorie: ['Autogru'],
    },
    {
      codice: 'nolsystem', ragioneSociale: 'Nol System S.r.l.', piva: '01234567897', indirizzo: '', telefono: '',
      email: '', pec: '', categorie: [],
    },
  ],
  categorie: [
    { nome: 'Autogru', targato: true },
    { nome: 'Carrelli elevatori', targato: null },
  ],
  leasing: {
    anticipoPerc: 10,
    partner: [
      { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
      { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
    ],
  },
  mostraNomiPartner: true,
};

describe('settore mezzi', () => {
  it('una riga senza la colonna mezzi la da a null: le carrozzerie esistenti non cambiano', () => {
    expect(carrozzeriaDaRiga(RIGA).mezzi).toBeNull();
    expect(carrozzeriaDaRiga({ ...RIGA, mezzi: null }).mezzi).toBeNull();
  });

  it('riporta settore mezzi e legge la configurazione dal JSON della riga', () => {
    const c = carrozzeriaDaRiga({ ...RIGA, settore: 'mezzi', mezzi: MEZZI_JSON });
    expect(c.settore).toBe('mezzi');
    expect(c.mezzi).toEqual(MEZZI_JSON);
  });

  it('un JSON mezzi che non si legge torna a null', () => {
    expect(carrozzeriaDaRiga({ ...RIGA, settore: 'mezzi', mezzi: 'boh' }).mezzi).toBeNull();
    expect(carrozzeriaDaRiga({ ...RIGA, settore: 'mezzi', mezzi: { ...MEZZI_JSON, venditori: [] } }).mezzi).toBeNull();
  });

  it('la forma per il browser porta venditori (codice, ragione sociale, categorie), categorie, anticipo e nomi', () => {
    const b = carrozzeriaPerBrowser(carrozzeriaDaRiga({ ...RIGA, settore: 'mezzi', mezzi: MEZZI_JSON }));
    expect(b.settore).toBe('mezzi');
    expect(b.mezzi).toEqual({
      venditori: [
        { codice: 'manc', ragioneSociale: 'Manc S.r.l.', categorie: ['Autogru'] },
        { codice: 'nolsystem', ragioneSociale: 'Nol System S.r.l.', categorie: [] },
      ],
      categorie: [
        { nome: 'Autogru', targato: true },
        { nome: 'Carrelli elevatori', targato: null },
      ],
      anticipoPerc: 10,
      mostraNomiPartner: true,
    });
  });

  it('la forma per il browser non porta partite IVA, recapiti, spread ne\' partner', () => {
    const testo = JSON.stringify(carrozzeriaPerBrowser(carrozzeriaDaRiga({ ...RIGA, settore: 'mezzi', mezzi: MEZZI_JSON })));
    // 'leasing' non si cerca: il flag booleano della carrozzeria esce da sempre
    for (const vietato of [
      'piva', 'spread', '05400750260', '01234567897', 'info@manc', 'pec', 'telefono', 'indirizzo', 'Via Roma',
      'sella', 'alba',
    ]) {
      expect(testo).not.toContain(vietato);
    }
  });
});
