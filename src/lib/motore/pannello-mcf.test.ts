// I controlli del Pannello MCF sul settore distinta: quello che l'admin manda si salva
// com'e' o non si salva. Un lettore di config-distinta che scarterebbe o cambierebbe
// qualcosa fa rifiutare il salvataggio con un messaggio che dice cosa: una voce di
// checklist scritta male non deve sparire in silenzio (smetterebbe di chiedere un
// documento). Spec mcf_spec-ledoffice-motore_v1, paragrafo 10.

import { describe, expect, it } from 'vitest';
import { CANALI_LO, CATEGORIE_LO, CHECKLIST_LO, SOCIETA_EMME2 } from './catalogo-ledoffice';
import { leggiConfigMezzi } from './config-mezzi';
import {
  categorieOrfane,
  controllaCanali,
  controllaCategorie,
  controllaChecklist,
  controllaMezzi,
  controllaPraticaEsterna,
  controllaSegnalazione,
  controllaSocieta,
  sceltaDaElenco,
} from './pannello-mcf';

const esiste = (id: string) => ['econocom-pa', 'pioneer', 'pagarent'].includes(id);
const copia = (v: unknown): any => JSON.parse(JSON.stringify(v));
const errore = (e: { ok: boolean; errore?: string }) => (e.ok ? '' : e.errore ?? '');

describe('settore e regole: un valore che non si riconosce non si salva al posto di quello che c\'e\'', () => {
  it('distinta e prefiltro sono fra le scelte', () => {
    expect(sceltaDaElenco('distinta', ['fotovoltaico', 'generico', 'macchine', 'distinta'])).toBe('distinta');
    expect(sceltaDaElenco('prefiltro', ['credit-policy', 'locatore', 'prefiltro'])).toBe('prefiltro');
  });
  it('sconosciuto o assente: null, cioe\' resta il valore di prima', () => {
    expect(sceltaDaElenco('xyz', ['generico'])).toBeNull();
    expect(sceltaDaElenco(undefined, ['generico'])).toBeNull();
    expect(sceltaDaElenco('', ['generico'])).toBeNull();
  });
});

describe('canali', () => {
  it('i canali di Led Office passano come sono', () => {
    const e = controllaCanali(copia(CANALI_LO), esiste);
    expect(e).toEqual({ ok: true, valore: CANALI_LO });
  });
  it('condizioni vuote mandate come null o liste vuote: equivalenti, si salvano', () => {
    const inviati = copia(CANALI_LO).map((c: any) => ({ ...c, fatturatoMin: c.fatturatoMin ?? null }));
    expect(controllaCanali(inviati, esiste).ok).toBe(true);
  });
  it('Grenke riacceso e Pagarent al 6%: si salvano', () => {
    const inviati = copia(CANALI_LO);
    inviati[1].attivo = true;
    inviati[2].maggiorazionePerc = 6;
    const e = controllaCanali(inviati, esiste);
    expect(e.ok && e.valore[1].attivo).toBe(true);
    expect(e.ok && e.valore[2].maggiorazionePerc).toBe(6);
  });
  it('un settore escluso che non si legge: rifiutato, col canale e il campo', () => {
    const inviati = copia(CANALI_LO);
    inviati[1].settoriEsclusi = ['6a'];
    const e = controllaCanali(inviati, esiste);
    expect(e.ok).toBe(false);
    expect(errore(e)).toMatch(/Grenke/);
    expect(errore(e)).toMatch(/settori esclusi/i);
  });
  it('un prefisso che il lettore cambierebbe (62.0 -> 620): rifiutato', () => {
    const inviati = copia(CANALI_LO);
    inviati[1].settoriEsclusi = ['62.0'];
    const e = controllaCanali(inviati, esiste);
    expect(e.ok).toBe(false);
    expect(errore(e)).toMatch(/Grenke/);
    expect(errore(e)).toMatch(/620/);
  });
  it('soglia illeggibile (testo): rifiutato, non salvato senza soglia', () => {
    const inviati = copia(CANALI_LO);
    inviati[0].fatturatoMin = '5 milioni';
    const e = controllaCanali(inviati, esiste);
    expect(e.ok).toBe(false);
    expect(errore(e)).toMatch(/Econocom/);
    expect(errore(e)).toMatch(/fatturato/i);
  });
  it('maggiorazione fuori misura: rifiutato', () => {
    const inviati = copia(CANALI_LO);
    inviati[2].maggiorazionePerc = 55;
    expect(errore(controllaCanali(inviati, esiste))).toMatch(/Pagarent[\s\S]*maggiorazione/i);
  });
  it('un campo che il lettore non conosce: rifiutato, sparirebbe', () => {
    const inviati = copia(CANALI_LO);
    inviati[2].sogliaMassima = 200000;
    expect(errore(controllaCanali(inviati, esiste))).toMatch(/sogliaMassima/);
  });
  it('listino inesistente, canale ripetuto, elenco vuoto o non elenco: rifiutati', () => {
    const a = copia(CANALI_LO);
    a[2].tabella = 'pagarent-2027';
    expect(errore(controllaCanali(a, esiste))).toMatch(/listino/i);
    expect(errore(controllaCanali([...copia(CANALI_LO), copia(CANALI_LO[2])], esiste))).toMatch(/due volte/);
    expect(controllaCanali([], esiste).ok).toBe(false);
    expect(controllaCanali({ canale: 'pagarent' }, esiste).ok).toBe(false);
  });
});

describe('societa\' fornitrice', () => {
  const societa = { ...SOCIETA_EMME2, logo: 'brand/emme2-servizi.jpg' };
  it('passa com\'e\'', () => {
    expect(controllaSocieta(copia(societa))).toEqual({ ok: true, valore: societa });
  });
  it('senza logo: logo null', () => {
    const e = controllaSocieta(copia(SOCIETA_EMME2));
    expect(e.ok && e.valore.logo).toBeNull();
  });
  it('ragione sociale vuota o partita IVA sbagliata: rifiutata, col campo', () => {
    expect(errore(controllaSocieta({ ...copia(societa), ragioneSociale: '' }))).toMatch(/ragione sociale/i);
    expect(errore(controllaSocieta({ ...copia(societa), piva: '07000311213' }))).toMatch(/partita IVA/i);
  });
  it('un recapito di un altro tipo o un campo in piu\': rifiutata', () => {
    expect(errore(controllaSocieta({ ...copia(societa), telefono: 823809164 }))).toMatch(/telefono/i);
    expect(errore(controllaSocieta({ ...copia(societa), sito: 'x' }))).toMatch(/sito/);
  });
});

describe('categorie', () => {
  it('le categorie di Led Office passano come sono', () => {
    expect(controllaCategorie(copia(CATEGORIE_LO))).toEqual({ ok: true, valore: CATEGORIE_LO });
  });
  it('un flag non booleano: rifiutato, con la categoria', () => {
    const c = copia(CATEGORIE_LO);
    c[5].ledwall = 'si';
    const e = controllaCategorie(c);
    expect(e.ok).toBe(false);
    expect(errore(e)).toMatch(/LEDwall/);
  });
  it('un settore tipico che il lettore cambierebbe, nome ripetuto, elenco vuoto: rifiutati', () => {
    const c = copia(CATEGORIE_LO);
    c[1].settoriTipici = ['62.01'];
    expect(errore(controllaCategorie(c))).toMatch(/Workstation grafiche[\s\S]*6201/);
    expect(errore(controllaCategorie([...copia(CATEGORIE_LO), copia(CATEGORIE_LO[0])]))).toMatch(/due volte/);
    expect(controllaCategorie([]).ok).toBe(false);
  });
  it('categorie orfane: quelle usate da voci accese che non ci sono piu\'', () => {
    const voci = [
      { codice: 'A', attivo: true, attributi: { categoria: 'Server e stampa' } },
      { codice: 'B', attivo: true, attributi: { categoria: 'Periferiche e tablet' } },
      { codice: 'C', attivo: false, attributi: { categoria: 'Vecchia' } },
      { codice: 'D', attivo: true, attributi: {} },
    ];
    expect(categorieOrfane(CATEGORIE_LO, voci)).toEqual([]);
    const senza = CATEGORIE_LO.filter((c) => c.nome !== 'Server e stampa');
    expect(categorieOrfane(senza, voci)).toEqual(['Server e stampa']);
  });
});

describe('checklist', () => {
  it('la checklist di Led Office passa com\'e\'', () => {
    expect(controllaChecklist(copia(CHECKLIST_LO))).toEqual({ ok: true, valore: CHECKLIST_LO });
  });
  it('una voce con obbligatoria scritta male: rifiutata col suo nome, non sparisce', () => {
    const c = copia(CHECKLIST_LO);
    c.voci[2].obbligatoria = 'no';
    const e = controllaChecklist(c);
    expect(e.ok).toBe(false);
    expect(errore(e)).toMatch(/Visura camerale/);
  });
  it('forme sconosciute, importo illeggibile, voce senza nome: rifiutate', () => {
    const a = copia(CHECKLIST_LO);
    a.voci[3].forme = ['srl'];
    expect(errore(controllaChecklist(a))).toMatch(/Ultimi due bilanci[\s\S]*forme/i);
    const b = copia(CHECKLIST_LO);
    b.voci[5].sopraImporto = '50.000';
    expect(errore(controllaChecklist(b))).toMatch(/Situazione contabile[\s\S]*importo/i);
    const c = copia(CHECKLIST_LO);
    c.voci.push({ nome: '', obbligatoria: false });
    expect(errore(controllaChecklist(c))).toMatch(/voce n\. 10/);
  });
  it('formato sconosciuto o ripetuto, nessuna voce, nessun formato: rifiutati', () => {
    expect(errore(controllaChecklist({ ...copia(CHECKLIST_LO), formati: ['pdf', 'heic'] }))).toMatch(/heic/);
    expect(errore(controllaChecklist({ ...copia(CHECKLIST_LO), formati: ['pdf', 'pdf'] }))).toMatch(/pdf/);
    expect(controllaChecklist({ voci: [], formati: ['pdf'] }).ok).toBe(false);
    expect(controllaChecklist({ voci: copia(CHECKLIST_LO.voci), formati: [] }).ok).toBe(false);
  });
});

describe('cliente segnalato', () => {
  // Partita IVA inventata, con la cifra di controllo giusta
  const PIVA = '12345678903';
  it('si legge con la partita IVA pulita', () => {
    expect(controllaSegnalazione({ piva: 'IT 123 456 789 03', ragioneSociale: ' Prova SRL ', motivo: 'insoluto', effetto: 'blocco', nota: '' }))
      .toEqual({ ok: true, valore: { piva: PIVA, ragioneSociale: 'Prova SRL', motivo: 'insoluto', effetto: 'blocco', nota: null } });
  });
  it('partita IVA, motivo o effetto non ammessi: rifiutata', () => {
    expect(errore(controllaSegnalazione({ piva: '12345678901', motivo: 'insoluto', effetto: 'blocco' }))).toMatch(/partita IVA/i);
    expect(errore(controllaSegnalazione({ piva: PIVA, motivo: 'ritardo', effetto: 'blocco' }))).toMatch(/motivo/i);
    expect(errore(controllaSegnalazione({ piva: PIVA, motivo: 'altro', effetto: 'giallo' }))).toMatch(/effetto/i);
  });
});

describe('pratica esterna', () => {
  const PIVA = '12345678903';
  const oggi = new Date('2026-10-20T10:00:00Z');
  it('si legge, data italiana o ISO, importo all\'italiana', () => {
    expect(controllaPraticaEsterna({ piva: PIVA, ragioneSociale: 'Prova SRL', canale: 'pagarent', data: '15/09/2026', esito: 'approvata', importo: '12.500,50' }, oggi))
      .toEqual({ ok: true, valore: { piva: PIVA, ragioneSociale: 'Prova SRL', canale: 'pagarent', data: '2026-09-15', esito: 'approvata', importo: 12500.5 } });
  });
  it('canale, importo ed esito facoltativi', () => {
    const e = controllaPraticaEsterna({ piva: PIVA, data: '2026-09-15', canale: '', importo: '' }, oggi);
    expect(e).toEqual({ ok: true, valore: { piva: PIVA, ragioneSociale: null, canale: null, data: '2026-09-15', esito: null, importo: null } });
  });
  it('data impossibile o futura, canale sconosciuto, importo non positivo: rifiutata', () => {
    expect(errore(controllaPraticaEsterna({ piva: PIVA, data: '31/02/2026' }, oggi))).toMatch(/data/i);
    expect(errore(controllaPraticaEsterna({ piva: PIVA, data: '2026-10-21' }, oggi))).toMatch(/futura/i);
    expect(errore(controllaPraticaEsterna({ piva: PIVA, data: '2026-09-15', canale: 'altro' }, oggi))).toMatch(/canale/i);
    expect(errore(controllaPraticaEsterna({ piva: PIVA, data: '2026-09-15', importo: '-5' }, oggi))).toMatch(/importo/i);
    expect(errore(controllaPraticaEsterna({ piva: '1', data: '2026-09-15' }, oggi))).toMatch(/partita IVA/i);
  });
});

describe('canali sui mezzi: le condizioni sul bene', () => {
  const esisteMezzi = (id: string) => ['econocom-pa', 'sputnik'].includes(id);
  const CANALI_MEZZI = [
    { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000, venditori: ['nolsystem'] },
    { canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0, venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true },
  ];

  it('venditori, categorie escluse e mezzi targati passano come sono', () => {
    const e = controllaCanali(copia(CANALI_MEZZI), esisteMezzi);
    expect(e).toEqual({ ok: true, valore: CANALI_MEZZI });
  });
  it('venditori vuoto e esclusione spenta sono condizioni valide, non si perdono', () => {
    const inviati = copia(CANALI_MEZZI);
    inviati[0].venditori = [];
    inviati[1].categorieEscluse = [];
    inviati[1].escludiTargati = false;
    const e = controllaCanali(inviati, esisteMezzi);
    expect(e.ok && e.valore[0].venditori).toEqual([]);
    expect(e.ok && e.valore[1].escludiTargati).toBe(false);
  });
  it('una condizione sul bene illeggibile: rifiutata, col canale e il nome della condizione', () => {
    const a = copia(CANALI_MEZZI);
    a[1].venditori = 'manc';
    expect(errore(controllaCanali(a, esisteMezzi))).toMatch(/Grenke, venditori «manc»: non si legge/);
    const b = copia(CANALI_MEZZI);
    b[1].categorieEscluse = ['Ponteggi', 3];
    expect(errore(controllaCanali(b, esisteMezzi))).toMatch(/Grenke, categorie escluse/);
    const c = copia(CANALI_MEZZI);
    c[1].escludiTargati = 'si';
    expect(errore(controllaCanali(c, esisteMezzi))).toMatch(/Grenke, esclude i mezzi targati «si»: non si legge/);
  });
});

describe('configurazione dei mezzi', () => {
  // Bergamelli come la scrive il seed: Manc firma le gru e le autogru, Nol System tutto il resto
  const MEZZI = {
    venditori: [
      {
        codice: 'manc', ragioneSociale: 'Manc S.r.l.', piva: '03863700989', indirizzo: 'Via Roma 1, 25100 Brescia (BS)',
        telefono: '+39 030 000000', email: 'info@manc.example', pec: 'manc@pec.example', categorie: ['Gru a torre', 'Autogru'],
      },
      {
        codice: 'nolsystem', ragioneSociale: 'NOL SYSTEM ITALIA SRL', piva: '05400750260', indirizzo: '', telefono: '',
        email: '', pec: '', categorie: [] as string[],
      },
    ],
    categorie: [
      { nome: 'Gru a torre', targato: false },
      { nome: 'Autogru', targato: true },
      { nome: 'Movimento terra', targato: null },
      { nome: 'Ponteggi', targato: false },
    ],
    leasing: {
      anticipoPerc: 10,
      partner: [
        { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
        { partner: 'credem', spreadFinoA48: 2.9, spreadDa60: 2.9 },
        { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
      ],
    },
    mostraNomiPartner: true,
  };
  /** La configurazione di Bergamelli ritoccata da `modifica`, per provare un difetto alla volta */
  const con = (modifica: (c: any) => void) => {
    const c = copia(MEZZI);
    modifica(c);
    return c;
  };
  const SUFFISSO = /Nessuna modifica salvata\.$/;
  /** Rifiutata, col messaggio che finisce come gli altri controlli */
  const rifiutata = (v: unknown) => {
    const m = errore(controllaMezzi(v));
    expect(m).toMatch(SUFFISSO);
    return m;
  };

  describe('accettata', () => {
    it('la configurazione di Bergamelli passa com\'e\'', () => {
      expect(controllaMezzi(copia(MEZZI))).toEqual({ ok: true, valore: MEZZI });
    });
    it('anticipo a 0 e a 30, nomi spenti, nessun partner del leasing', () => {
      expect(controllaMezzi(con((c) => (c.leasing.anticipoPerc = 0))).ok).toBe(true);
      expect(controllaMezzi(con((c) => (c.leasing.anticipoPerc = 30))).ok).toBe(true);
      const e = controllaMezzi(con((c) => { c.mostraNomiPartner = false; c.leasing.partner = []; }));
      expect(e.ok && e.valore.mostraNomiPartner).toBe(false);
      expect(e.ok && e.valore.leasing.partner).toEqual([]);
    });
    it('una domanda sul targato lasciata fuori vale null, come il lettore', () => {
      const e = controllaMezzi(con((c) => delete c.categorie[2].targato));
      expect(e.ok && e.valore.categorie[2]).toEqual({ nome: 'Movimento terra', targato: null });
    });
  });

  describe('un campo che il lettore non conosce non si perde: rifiutato, col nome', () => {
    it('in cima alla configurazione', () => {
      expect(rifiutata(con((c) => (c.note = 'x')))).toMatch(/campo «note» non previsto: non si salverebbe/);
    });
    it('dentro un venditore, con il suo codice', () => {
      expect(rifiutata(con((c) => (c.venditori[0].sito = 'x')))).toMatch(/Venditore manc, campo «sito» non previsto: non si salverebbe/);
    });
    it('dentro una categoria', () => {
      expect(rifiutata(con((c) => (c.categorie[1].colore = 'x')))).toMatch(/Categoria Autogru, campo «colore» non previsto/);
    });
    it('nel leasing e dentro un partner', () => {
      expect(rifiutata(con((c) => (c.leasing.riscattoPerc = 1)))).toMatch(/Leasing, campo «riscattoPerc» non previsto/);
      expect(rifiutata(con((c) => (c.leasing.partner[2].spreadDa72 = 2.5)))).toMatch(/Alba, campo «spreadDa72» non previsto/);
    });
    it('un campo null o assente non conta: e\' lo stesso', () => {
      expect(controllaMezzi(con((c) => (c.note = null))).ok).toBe(true);
    });
  });

  describe('venditori', () => {
    it('partita IVA sbagliata: dice quale venditore e quale partita IVA', () => {
      const m = rifiutata(con((c) => (c.venditori[0].piva = '03863700988')));
      expect(m).toMatch(/Venditore manc/);
      expect(m).toMatch(/partita IVA «03863700988»/);
      expect(m).toMatch(/cifra di controllo/);
    });
    it('partita IVA sbagliata sul venditore di default', () => {
      expect(rifiutata(con((c) => (c.venditori[1].piva = '12345678901')))).toMatch(/Venditore nolsystem, partita IVA/);
    });
    it('un venditore senza codice si riconosce dalla posizione', () => {
      const m = rifiutata(con((c) => { delete c.venditori[1].codice; c.venditori[1].piva = '1'; }));
      expect(m).toMatch(/Venditore n\. 2, codice: manca/);
    });
    it('codice fuori misura o scritto con le maiuscole', () => {
      expect(rifiutata(con((c) => (c.venditori[0].codice = 'Manc')))).toMatch(/Venditore Manc, codice «Manc»[\s\S]*minuscole/);
      expect(rifiutata(con((c) => (c.venditori[0].codice = 'm')))).toMatch(/codice «m»/);
      expect(rifiutata(con((c) => (c.venditori[0].codice = 'a'.repeat(31))))).toMatch(/codice «a{31}»/);
      expect(controllaMezzi(con((c) => (c.venditori[0].codice = 'a'.repeat(30)))).ok).toBe(true);
      expect(controllaMezzi(con((c) => (c.venditori[0].codice = 'manc-2'))).ok).toBe(true);
    });
    it('codice ripetuto', () => {
      expect(rifiutata(con((c) => (c.venditori[1].codice = 'manc')))).toMatch(/venditore manc compare due volte/);
    });
    it('ragione sociale vuota, recapito che non e\' un testo, categorie che non sono un elenco', () => {
      expect(rifiutata(con((c) => (c.venditori[0].ragioneSociale = '  ')))).toMatch(/Venditore manc, ragione sociale: manca/);
      expect(rifiutata(con((c) => (c.venditori[0].telefono = 3030000)))).toMatch(/Venditore manc, telefono «3030000»: non è un testo/);
      expect(rifiutata(con((c) => delete c.venditori[0].pec))).toMatch(/Venditore manc, PEC: manca/);
      expect(rifiutata(con((c) => (c.venditori[0].categorie = 'Autogru')))).toMatch(/Venditore manc, categorie «Autogru»/);
    });
    it('un testo con gli spazi intorno si salverebbe diverso: rifiutato', () => {
      expect(rifiutata(con((c) => (c.venditori[0].ragioneSociale = ' Manc S.r.l. ')))).toMatch(/Venditore manc, ragione sociale: si salverebbe «Manc S\.r\.l\.»/);
    });
    it('nessun venditore, o un elemento che non e\' un oggetto', () => {
      expect(rifiutata(con((c) => (c.venditori = [])))).toMatch(/almeno un venditore/);
      expect(rifiutata(con((c) => (c.venditori = 'manc')))).toMatch(/venditori devono essere un elenco/);
      expect(rifiutata(con((c) => c.venditori.push(null)))).toMatch(/Venditore n\. 3: non si legge/);
    });
  });

  describe('venditori e categorie insieme', () => {
    it('nessun venditore di default: lo dice', () => {
      const m = rifiutata(con((c) => (c.venditori[1].categorie = ['Movimento terra', 'Ponteggi'])));
      expect(m).toMatch(/Manca il venditore di tutto il resto/);
    });
    it('piu\' di un venditore di default: li nomina', () => {
      const m = rifiutata(con((c) => c.venditori.push({ ...c.venditori[1], codice: 'altro', piva: '09876543217' })));
      expect(m).toMatch(/più di uno \(nolsystem, altro\)/);
    });
    it('una categoria elencata da due venditori: nomina la categoria e i due', () => {
      const m = rifiutata(con((c) => c.venditori.push({ ...c.venditori[1], codice: 'extra', piva: '09876543217', categorie: ['Autogru'] })));
      expect(m).toMatch(/«Autogru» è assegnata a due venditori \(manc e extra\)/);
    });
    it('la categoria di un venditore che non e\' fra le categorie: nomina venditore e categoria', () => {
      const m = rifiutata(con((c) => c.venditori[0].categorie.push('Betoniere')));
      expect(m).toMatch(/Venditore manc, categoria «Betoniere»: non è fra le categorie/);
    });
  });

  describe('categorie', () => {
    it('una domanda sul targato che non e\' true, false o null: rifiutata, con la categoria', () => {
      const m = rifiutata(con((c) => (c.categorie[1].targato = 'si')));
      expect(m).toMatch(/Categoria Autogru, targato «si»: serve true, false oppure null/);
    });
    it('nome mancante, categoria ripetuta, nessuna categoria, non un elenco', () => {
      expect(rifiutata(con((c) => (c.categorie[3].nome = '')))).toMatch(/Categoria n\. 4, nome: manca/);
      expect(rifiutata(con((c) => c.categorie.push({ nome: 'Autogru', targato: true })))).toMatch(/categoria Autogru compare due volte/);
      expect(rifiutata(con((c) => { c.categorie = []; c.venditori[0].categorie = []; }))).toMatch(/almeno una categoria/);
      expect(rifiutata(con((c) => (c.categorie = {})))).toMatch(/categorie devono essere un elenco/);
    });
  });

  describe('leasing', () => {
    it('spread Alba a 4,90: nomina il partner e lo spread, e dice quali ci sono', () => {
      const m = rifiutata(con((c) => (c.leasing.partner[2].spreadFinoA48 = 4.9)));
      expect(m).toMatch(/Leasing, Alba, spread fino a 48 mesi «4,90»/);
      expect(m).toMatch(/listino/);
      expect(m).toMatch(/3,10/);
    });
    it('uno spread che esiste solo sull\'altro lato del cambio di listino di Alba', () => {
      // 2,50 c\'e\' solo da 60 mesi, 3,10 solo fino a 48
      expect(rifiutata(con((c) => (c.leasing.partner[2].spreadFinoA48 = 2.5)))).toMatch(/Alba, spread fino a 48 mesi «2,50»/);
      expect(rifiutata(con((c) => (c.leasing.partner[2].spreadDa60 = 3.1)))).toMatch(/Alba, spread da 60 mesi «3,10»/);
    });
    it('spread di un altro partner e spread non numerico', () => {
      expect(rifiutata(con((c) => (c.leasing.partner[0].spreadDa60 = 9)))).toMatch(/Sella, spread da 60 mesi «9,00»/);
      expect(rifiutata(con((c) => (c.leasing.partner[1].spreadFinoA48 = '2.90')))).toMatch(/Credem, spread fino a 48 mesi «2\.90»: serve un numero/);
      expect(rifiutata(con((c) => delete c.leasing.partner[1].spreadDa60))).toMatch(/Credem, spread da 60 mesi: manca/);
    });
    it('anticipo fuori da 0-30: rifiutato col valore', () => {
      for (const anticipo of [31, -1, 45, '10', null]) {
        expect(rifiutata(con((c) => (c.leasing.anticipoPerc = anticipo))), String(anticipo)).toMatch(/Leasing, anticipo[\s\S]*fra 0 e 30/);
      }
      expect(rifiutata(con((c) => (c.leasing.anticipoPerc = 31)))).toMatch(/«31»/);
    });
    it('partner sconosciuto o ripetuto', () => {
      expect(rifiutata(con((c) => (c.leasing.partner[1].partner = 'ifis')))).toMatch(/Leasing, partner n\. 2 «ifis»: sono ammessi Sella, Credem, Alba/);
      expect(rifiutata(con((c) => c.leasing.partner.push({ partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 })))).toMatch(/Leasing, Sella compare due volte/);
    });
    it('leasing o partner che non hanno la forma giusta', () => {
      expect(rifiutata(con((c) => (c.leasing = []) ))).toMatch(/Leasing: dati non leggibili/);
      expect(rifiutata(con((c) => (c.leasing.partner = 'sella')))).toMatch(/Leasing, partner: serve un elenco/);
      expect(rifiutata(con((c) => c.leasing.partner.push(null)))).toMatch(/Leasing, partner n\. 4: non si legge/);
    });
  });

  describe('il controllo e il lettore dicono lo stesso', () => {
    // Il controllo ripete a mano alcune regole del lettore (il formato del codice, i partner
    // ammessi, i limiti dell'anticipo): se una cambia solo da una parte, qui si vede
    it('codice del venditore', () => {
      for (const codice of ['manc', 'Manc', 'm', 'ab', 'a'.repeat(30), 'a'.repeat(31), 'no_sys', 'a-b-1', ' extra', 'manc ', '']) {
        const c = con((x) => (x.venditori[0].codice = codice));
        expect(controllaMezzi(c).ok, `«${codice}»`).toBe(leggiConfigMezzi(c) !== null);
      }
    });
    it('anticipo', () => {
      for (const anticipo of [0, 10, 30, 30.5, 31, -1, '10', null]) {
        const c = con((x) => (x.leasing.anticipoPerc = anticipo));
        expect(controllaMezzi(c).ok, String(anticipo)).toBe(leggiConfigMezzi(c) !== null);
      }
    });
    it('partner: gli ammessi passano da tutti e due, uno sconosciuto il lettore lo scarta e il controllo lo rifiuta', () => {
      const SPREAD: Record<string, [number, number]> = { sella: [2.25, 2.25], credem: [2.9, 2.9], alba: [3.1, 2.5] };
      for (const [partner, [spreadFinoA48, spreadDa60]] of Object.entries(SPREAD)) {
        const c = con((x) => (x.leasing.partner = [{ partner, spreadFinoA48, spreadDa60 }]));
        expect(controllaMezzi(c).ok, partner).toBe(true);
        expect(leggiConfigMezzi(c)?.leasing.partner, partner).toHaveLength(1);
      }
      const ifis = con((x) => (x.leasing.partner = [{ partner: 'ifis', spreadFinoA48: 2.25, spreadDa60: 2.25 }]));
      expect(controllaMezzi(ifis).ok).toBe(false);
      expect(leggiConfigMezzi(ifis)?.leasing.partner).toEqual([]);
    });
  });

  describe('forma generale', () => {
    it('i nomi dei partner a schermo vogliono un si o un no', () => {
      expect(rifiutata(con((c) => (c.mostraNomiPartner = 'si')))).toMatch(/nomi dei partner a schermo «si»: serve true o false/i);
      expect(rifiutata(con((c) => delete c.mostraNomiPartner))).toMatch(/nomi dei partner a schermo/i);
    });
    it('non un oggetto: rifiutato', () => {
      for (const v of [null, undefined, [], 'manc', 7]) expect(controllaMezzi(v).ok, String(v)).toBe(false);
      expect(rifiutata(null)).toMatch(/Configurazione dei mezzi/);
    });
  });
});
