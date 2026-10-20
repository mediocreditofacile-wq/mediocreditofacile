// I controlli del Pannello MCF sul settore distinta: quello che l'admin manda si salva
// com'e' o non si salva. Un lettore di config-distinta che scarterebbe o cambierebbe
// qualcosa fa rifiutare il salvataggio con un messaggio che dice cosa: una voce di
// checklist scritta male non deve sparire in silenzio (smetterebbe di chiedere un
// documento). Spec mcf_spec-ledoffice-motore_v1, paragrafo 10.

import { describe, expect, it } from 'vitest';
import { CANALI_LO, CATEGORIE_LO, CHECKLIST_LO, SOCIETA_EMME2 } from './catalogo-ledoffice';
import {
  categorieOrfane,
  controllaCanali,
  controllaCategorie,
  controllaChecklist,
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
