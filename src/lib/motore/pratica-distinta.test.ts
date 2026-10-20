// La pratica Led Office (spec mcf_spec-ledoffice-motore_v1, paragrafi 5 e 9): le regole
// pure dell'invio. Quando la pratica parte, quando diventa una segnalazione, quali
// documenti mancano, quali formati passano, quale stato degli eventi conta all'invio e
// cosa dice la mail a MCF. Le API (smistamento, database, Blob, mail) stanno in
// api-pratica-distinta.test.ts.

import { describe, expect, it, vi } from 'vitest';

// pratica.ts importa auth.ts, che apre il pool del database al caricamento
vi.mock('../auth', () => ({ BASE_URL: 'https://www.example.it' }));
vi.mock('../db', () => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));

import { CHECKLIST_LO } from './catalogo-ledoffice';
import { vociChecklist } from './config-distinta';
import type { RigaDistinta } from './distinta';
import type { EsitoPrefiltro } from './prefiltro';
import {
  corpoMailPratica,
  decidiInvio,
  documentiMancanti,
  formatoAmmesso,
  propostaCompleta,
  propostaUsabile,
  statoEventiInvio,
  testoFormati,
  tipiAmmessi,
  vociPerInvio,
  type DocumentoVoce,
  type InputMailPratica,
} from './pratica-distinta';

const PROPOSTA_FIRMATA = 'Proposta di vendita firmata e timbrata dal cliente';
const IDENTITA = "Documento d'identità e tessera sanitaria del legale rappresentante, fronte e retro in un unico PDF";

const doc = (voce: string, nome = 'a.pdf'): DocumentoVoce =>
  ({ nome, pathname: `pratiche/led-office/bozze/x/${nome}`, size: 1, voce });

describe('decidiInvio', () => {
  it.each([
    ['bloccato', true, false, false, { tipo: 'rifiuto', error: 'cliente_bloccato' }],
    ['rosso', true, false, false, { tipo: 'segnalazione' }],
    ['rosso', false, true, false, { tipo: 'segnalazione' }],
    ['giallo', true, false, false, { tipo: 'pratica' }],
    ['verde', false, true, true, { tipo: 'segnalazione' }],
    ['verde', false, false, false, { tipo: 'rifiuto', error: 'proposta_mancante' }],
  ])('%s', (semaforo, propostaValida, segnalazioneChiesta, nessunCanale, atteso) =>
    expect(decidiInvio({ semaforo, propostaValida, segnalazioneChiesta, nessunCanale } as any)).toEqual(atteso));

  it('rosso senza segnalazione chiesta e senza proposta: e\' comunque una segnalazione', () =>
    expect(decidiInvio({ semaforo: 'rosso', propostaValida: false, segnalazioneChiesta: false, nessunCanale: false }))
      .toEqual({ tipo: 'segnalazione' }));

  it('bloccato vince anche sulla segnalazione chiesta', () =>
    expect(decidiInvio({ semaforo: 'bloccato', propostaValida: false, segnalazioneChiesta: true, nessunCanale: true }))
      .toEqual({ tipo: 'rifiuto', error: 'cliente_bloccato' }));

  it('verde con proposta valida e segnalazione chiesta: parte la pratica', () =>
    expect(decidiInvio({ semaforo: 'verde', propostaValida: true, segnalazioneChiesta: true, nessunCanale: false }))
      .toEqual({ tipo: 'pratica' }));

  it('giallo senza canale ma senza segnalazione chiesta: proposta mancante', () =>
    expect(decidiInvio({ semaforo: 'giallo', propostaValida: false, segnalazioneChiesta: false, nessunCanale: true }))
      .toEqual({ tipo: 'rifiuto', error: 'proposta_mancante' }));

  it('segnalazione chiesta ma un canale regge: proposta mancante, non si crede al browser', () =>
    expect(decidiInvio({ semaforo: 'giallo', propostaValida: false, segnalazioneChiesta: true, nessunCanale: false }))
      .toEqual({ tipo: 'rifiuto', error: 'proposta_mancante' }));

  it('proposta indicata che non regge: proposta non valida', () =>
    expect(decidiInvio({ semaforo: 'verde', propostaValida: false, segnalazioneChiesta: false, nessunCanale: false, propostaIndicata: true }))
      .toEqual({ tipo: 'rifiuto', error: 'proposta_non_valida' }));
});

describe('documentiMancanti', () => {
  it('obbligatori: proposta firmata e documento d\'identita\'', () => {
    const voci = vociChecklist(CHECKLIST_LO, 'capitali', 80_000);
    expect(documentiMancanti(voci, [], false).obbligatori).toEqual([
      'Proposta di vendita firmata e timbrata dal cliente',
      "Documento d'identità e tessera sanitaria del legale rappresentante, fronte e retro in un unico PDF",
    ]);
    expect(documentiMancanti(voci, [], true).obbligatori).toEqual([
      "Documento d'identità e tessera sanitaria del legale rappresentante, fronte e retro in un unico PDF",
    ]);
  });

  it('facoltativi: le voci della forma e dell\'importo che non sono arrivate', () => {
    const voci = vociChecklist(CHECKLIST_LO, 'capitali', 80_000);
    expect(documentiMancanti(voci, [doc(PROPOSTA_FIRMATA), doc(IDENTITA)], false)).toEqual({
      obbligatori: [],
      facoltativi: [
        'Visura camerale',
        'Ultimi due bilanci depositati con ricevuta di deposito',
        "Situazione contabile dell'anno (bilancio provvisorio)",
        'Centrale Rischi recente',
        'Foto della sede',
        'Foto del luogo di installazione',
      ],
    });
  });

  it('ditta individuale sotto i 50.000: dichiarazioni dei redditi, niente bilanci ne\' provvisorio', () => {
    const voci = vociChecklist(CHECKLIST_LO, 'individuale', 30_000);
    const { facoltativi } = documentiMancanti(voci, [doc(PROPOSTA_FIRMATA), doc(IDENTITA), doc('Foto della sede', 'sede.jpg')], false);
    expect(facoltativi).toContain('Ultime due dichiarazioni dei redditi');
    expect(facoltativi).not.toContain('Ultimi due bilanci depositati con ricevuta di deposito');
    expect(facoltativi).not.toContain("Situazione contabile dell'anno (bilancio provvisorio)");
    expect(facoltativi).not.toContain('Foto della sede');
  });

  it('nella segnalazione la proposta firmata non si chiede: ne\' obbligatoria ne\' facoltativa', () => {
    const voci = vociChecklist(CHECKLIST_LO, 'capitali', 80_000);
    const m = documentiMancanti(voci, [], true);
    expect([...m.obbligatori, ...m.facoltativi]).not.toContain(PROPOSTA_FIRMATA);
    expect(vociPerInvio(voci, true).map((v) => v.nome)).not.toContain(PROPOSTA_FIRMATA);
    expect(vociPerInvio(voci, false).map((v) => v.nome)).toContain(PROPOSTA_FIRMATA);
  });

  it('un documento conta per la voce scritta uguale, non per un nome simile', () => {
    const voci = vociChecklist(CHECKLIST_LO, 'capitali', 10_000);
    const m = documentiMancanti(voci, [doc('proposta di vendita firmata'), doc(IDENTITA)], false);
    expect(m.obbligatori).toEqual([PROPOSTA_FIRMATA]);
  });
});

describe('formati', () => {
  it('formati: pdf e jpg si', () => {
    expect(formatoAmmesso('a.pdf', 'application/pdf', ['pdf', 'jpg'])).toBe(true);
    expect(formatoAmmesso('a.JPG', 'image/jpeg', ['pdf', 'jpg'])).toBe(true);
  });
  it('formati: heic e docx no', () => {
    expect(formatoAmmesso('a.heic', 'image/heic', ['pdf', 'jpg'])).toBe(false);
    expect(formatoAmmesso('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['pdf', 'jpg'])).toBe(false);
  });
  it('decide il tipo, quando c\'e\': la foto convertita da Safari passa anche col nome vecchio', () => {
    expect(formatoAmmesso('IMG_0001.HEIC', 'image/jpeg', ['pdf', 'jpg'])).toBe(true);
    expect(formatoAmmesso('foto.jpeg', 'image/jpeg; charset=binary', ['pdf', 'jpg'])).toBe(true);
    expect(formatoAmmesso('documento', 'application/pdf', ['pdf', 'jpg'])).toBe(true);
    expect(formatoAmmesso('a.pdf', 'application/octet-stream', ['pdf', 'jpg'])).toBe(false);
  });
  it('senza tipo decide l\'estensione; senza tutti e due no', () => {
    expect(formatoAmmesso('scansione.PDF', '', ['pdf', 'jpg'])).toBe(true);
    expect(formatoAmmesso('foto.jpeg', '', ['pdf', 'jpg'])).toBe(true);
    expect(formatoAmmesso('foto.png', '', ['pdf', 'jpg'])).toBe(false);
    expect(formatoAmmesso('documento', '', ['pdf', 'jpg'])).toBe(false);
  });
  it('solo i formati della configurazione', () => {
    expect(formatoAmmesso('foto.jpg', 'image/jpeg', ['pdf'])).toBe(false);
    expect(formatoAmmesso('a.pdf', 'application/pdf', [])).toBe(false);
  });
  it('i tipi per lo store sono esattamente PDF e JPEG', () => {
    expect(tipiAmmessi(['pdf', 'jpg'])).toEqual(['application/pdf', 'image/jpeg']);
    expect(tipiAmmessi(['jpg'])).toEqual(['image/jpeg']);
  });
  it('il testo per il commerciale', () => {
    expect(testoFormati(['pdf', 'jpg'])).toBe('Solo PDF o JPG');
    expect(testoFormati(['pdf'])).toBe('Solo PDF');
  });
});

describe('statoEventiInvio', () => {
  const registroPronto = (presenti: boolean) =>
    ({ azione: 'registro', id: 'v', pronto: true, avviata: '2026-10-20T08:00:00Z', dati: { presenzaProtesti: presenti } }) as const;
  const inLavorazione = { azione: 'registro', id: 'v', pronto: false, avviata: '2026-10-20T08:00:00Z' } as const;
  const assente = { azione: 'chiama', motivo: 'assente' } as const;

  it('l\'esito salvato sulla ricerca vale se il registro non sa di piu\'', () => {
    expect(statoEventiInvio('assenti', assente)).toBe('assenti');
    expect(statoEventiInvio('in-verifica', inLavorazione)).toBe('in-verifica');
    expect(statoEventiInvio(null, assente)).toBe('non-avviata');
  });
  it('il registro chiuso dopo la ricerca aggiorna lo stato', () => {
    expect(statoEventiInvio('in-verifica', registroPronto(true))).toBe('presenti');
    expect(statoEventiInvio('non-pervenuti', registroPronto(false))).toBe('assenti');
  });
  it('eventi presenti da una parte qualsiasi: presenti', () => {
    expect(statoEventiInvio('presenti', registroPronto(false))).toBe('presenti');
  });
});

describe('propostaUsabile', () => {
  const righe = [{ codice: 'X', descrizione: 'A', categoria: 'C', quantita: 1, prezzo: 10, listino: 10, fuoriListino: false, scaduta: false, totale: 10 }];
  const buona = {
    id: 'LO-1', piva: '1', dati: { righe, consegna: { tipo: 'sede', indirizzo: 'VIA ROMA 1' } },
    canale: 'pagarent', riservato: { canale: 'pagarent', beni: 10, maggiorazione: 1, imponibile: 11, documenti: [] },
  };
  it('una proposta di distinta salvata regge', () => expect(propostaUsabile(buona as any)).toBe(true));
  it('senza canale, senza riservato o senza righe no', () => {
    expect(propostaUsabile(null)).toBe(false);
    expect(propostaUsabile({ ...buona, canale: null } as any)).toBe(false);
    expect(propostaUsabile({ ...buona, riservato: null } as any)).toBe(false);
    expect(propostaUsabile({ ...buona, dati: { ...buona.dati, righe: [] } } as any)).toBe(false);
    expect(propostaUsabile({ ...buona, dati: null } as any)).toBe(false);
  });
});

describe('propostaCompleta: quella da cui parte una pratica normale', () => {
  const righe = [{ codice: 'X', descrizione: 'A', categoria: 'C', quantita: 1, prezzo: 10, listino: 10, fuoriListino: false, scaduta: false, totale: 10 }];
  const locatore = { nome: 'proposta-locatore-LO-1.pdf', pathname: 'preventivi/led-office/LO-1/mcf/proposta-locatore-LO-1-0123456789abcdef.pdf' };
  const completa = {
    id: 'LO-1', piva: '1',
    dati: { righe, consegna: { tipo: 'sede', indirizzo: 'VIA ROMA 1' }, vendita: { iban: 'IT60X0542811101000000123456' } },
    canale: 'pagarent', riservato: { canale: 'pagarent', beni: 10, maggiorazione: 1, imponibile: 11, documenti: [locatore] },
  };
  it('coi dati di vendita e la proposta per il locatore salvata: si', () => expect(propostaCompleta(completa as any)).toBe(true));
  it('senza dati di vendita: no (solo canone)', () => {
    expect(propostaCompleta({ ...completa, dati: { ...completa.dati, vendita: null } } as any)).toBe(false);
    expect(propostaCompleta({ ...completa, dati: { righe, consegna: completa.dati.consegna } } as any)).toBe(false);
  });
  it('senza la proposta per il locatore nel riservato: no', () => {
    expect(propostaCompleta({ ...completa, riservato: { ...completa.riservato, documenti: [] } } as any)).toBe(false);
    expect(propostaCompleta({ ...completa, riservato: { ...completa.riservato, documenti: [{ nome: 'x.pdf', pathname: '' }] } } as any)).toBe(false);
    expect(propostaCompleta({ ...completa, riservato: { canale: 'pagarent', beni: 10, maggiorazione: 1, imponibile: 11 } } as any)).toBe(false);
  });
  it('una proposta che non regge non e\' completa', () => {
    expect(propostaCompleta(null)).toBe(false);
    expect(propostaCompleta({ ...completa, canale: null } as any)).toBe(false);
  });
});

describe('corpoMailPratica', () => {
  const riga = (o: Partial<RigaDistinta>): RigaDistinta => ({
    codice: 'LO-PER-TAB-S10-FE', descrizione: 'TABLET SAMSUNG GALAXY TAB S10 FE WIFI 128GB', categoria: 'Periferiche e tablet',
    quantita: 70, prezzo: 540, listino: 560, fuoriListino: false, scaduta: false, totale: 37_800, ...o,
  });
  const prefiltro = (semaforo: EsitoPrefiltro['semaforo']): EsitoPrefiltro => ({
    semaforo,
    etichetta: semaforo === 'rosso' ? 'Non presentabile dal portale' : 'In linea con il prefiltro',
    righe: ['Centrale Rischi: da verificare da Mediocredito Facile'],
    criteri: [
      { chiave: 'eventi', nome: 'Eventi negativi', valore: semaforo === 'rosso' ? 'presenti' : 'assenti', ok: semaforo !== 'rosso' },
      { chiave: 'riga-1', nome: 'LEDwall', valore: "non tipico per l'ATECO 62.01.00", ok: false },
    ],
    provvisorio: false,
    eventi: semaforo === 'rosso' ? 'presenti' : 'assenti',
    motivazioniRichieste: [{ chiave: 'riga-1', testo: "Riga 2, LEDwall: bene non tipico per l'ATECO 62.01.00, spiega a cosa serve al cliente." }],
    motivazioniMancanti: [],
    ledwallMancante: false,
    bloccaProposta: semaforo === 'rosso',
  });
  const base = (o: Partial<InputMailPratica> = {}): InputMailPratica => ({
    k: { nome: 'Led Office', demo: false },
    agente: { nome: 'Mario Agente', email: 'mario@example.it' },
    id: 'LO-P-20261020-101500',
    segnalazione: null,
    cliente: { ragioneSociale: 'Cliente di Prova S.r.l.', piva: '01234567890' },
    forma: 'capitali',
    referente: { nome: 'Anna Rossi', telefono: '333 1234567', email: 'anna@example.it' },
    iban: 'IT60X0542811101000000123456',
    durata: 60,
    note: '',
    propostaId: 'LO-20261020-100000',
    righe: [riga({}), riga({ codice: null, descrizione: 'LEDWALL P2.5 3X2 M', categoria: 'LEDwall', quantita: 1, prezzo: 18_000, listino: null, fuoriListino: true, totale: 18_000 })],
    totale: 55_800,
    riservato: { canale: 'pagarent', beni: 55_800, maggiorazione: 2_790, imponibile: 58_590, documenti: [] },
    canaleIndicativo: null,
    prefiltro: prefiltro('verde'),
    segnali: {
      segnalato: null,
      praticaRecente: { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' },
    },
    motivazioni: { 'riga-1': 'Il cliente gestisce una sala eventi nella sede.' },
    conLedwall: true,
    ledwallConfermato: true,
    consegna: { tipo: 'sede', indirizzo: 'VIA ROMA 1 - 00100 ROMA (RM)' },
    documenti: [doc(PROPOSTA_FIRMATA), doc(IDENTITA, 'ci.jpg')],
    mancanti: { obbligatori: [], facoltativi: ['Visura camerale', 'Foto della sede'] },
    negativita: { id: 'v', pronto: true, daRegistro: true },
    locatore: 'allegata',
    ...o,
  });

  it('pratica: canale, maggiorazione e imponibile per il locatore, distinta con listino e trattato', () => {
    const { subject, html } = corpoMailPratica(base());
    expect(subject).toBe('Pratica Led Office — Cliente di Prova S.r.l. — 55.800 euro');
    expect(html).not.toContain('SEGNALAZIONE');
    expect(html).toContain('Pagarent');
    expect(html).toContain('2.790 euro');
    expect(html).toContain('58.590,00 euro');
    expect(html).toContain('55.800,00 euro');
    // listino e trattato della riga di catalogo, la riga fuori listino marcata
    expect(html).toContain('560,00');
    expect(html).toContain('540,00');
    expect(html).toContain('fuori listino');
    expect(html).toContain('LO-20261020-100000');
  });

  it('motivazioni, criteri, pratica recente coi dettagli e conferma LEDwall', () => {
    const { html } = corpoMailPratica(base());
    expect(html).toContain('Il cliente gestisce una sala eventi nella sede.');
    expect(html).toContain('Riga 2, LEDwall: bene non tipico');
    expect(html).toContain("LEDwall: non tipico per l&#39;ATECO 62.01.00 (non ok)");
    expect(html).toContain('Eventi negativi: assenti (ok)');
    expect(html).toContain('28/07/2026');
    expect(html).toContain('storico importato');
    expect(html).toContain('installazione fissa confermata');
    expect(html).toContain('Valutazione indicativa, non è una delibera.');
  });

  it('ogni criterio col suo esito: ok, non ok, da verificare', () => {
    const p = prefiltro('verde');
    p.criteri.push({ chiave: 'capitale', nome: 'Capitale sociale', valore: 'non disponibile', ok: null });
    const { html } = corpoMailPratica(base({ prefiltro: p }));
    expect(html).toContain('Capitale sociale: non disponibile (da verificare)');
  });

  it('il rating, come nella mail di sempre', () => {
    expect(corpoMailPratica(base()).html).toContain('non assegnato');
    const { html } = corpoMailPratica(base({
      cliente: { ragioneSociale: 'Cliente di Prova S.r.l.', piva: '01234567890', rating: { classe: 'B2', posizione: 5, descrizione: 'Rischio medio' } },
    }));
    expect(html).toContain('B2 (Rischio medio)');
  });

  it('segnalazione con una proposta: nessun canale, la proposta era sul suo', () => {
    const { html } = corpoMailPratica(base({ segnalazione: 'rosso', prefiltro: prefiltro('rosso') }));
    expect(html).toContain('nessuno, segnalazione: la proposta era su Pagarent');
  });

  it('documenti caricati per voce e documenti che mancano', () => {
    const { html } = corpoMailPratica(base());
    expect(html).toContain('ci.jpg');
    expect(html).toContain('Visura camerale');
    expect(html).toContain('Foto della sede');
    expect(html).toContain('Documenti che mancano');
  });

  it('IBAN a gruppi di quattro, contatti del firmatario', () => {
    const { html } = corpoMailPratica(base());
    expect(html).toContain('IT60 X054 2811 1010 0000 0123 456');
    expect(html).toContain('333 1234567');
    expect(html).toContain('anna@example.it');
  });

  it('segnalazione sul rosso: in testa, e nell\'oggetto', () => {
    const { subject, html } = corpoMailPratica(base({ segnalazione: 'rosso', prefiltro: prefiltro('rosso') }));
    expect(subject).toMatch(/^Segnalazione Led Office/);
    expect(html).toContain('SEGNALAZIONE, prefiltro rosso');
    expect(html.indexOf('SEGNALAZIONE, prefiltro rosso')).toBeLessThan(html.indexOf('Cliente di Prova'));
  });

  it('segnalazione per nessun canale: lo dice, senza dire rosso', () => {
    const { html } = corpoMailPratica(base({ segnalazione: 'nessun_canale', propostaId: null, riservato: null }));
    expect(html).toContain('SEGNALAZIONE, nessun canale regge l&#39;importo');
    expect(html).not.toContain('prefiltro rosso');
    expect(html).toContain('nessuna proposta');
  });

  it('segnalazione senza proposta: canale indicativo, se uno reggerebbe', () => {
    const { html } = corpoMailPratica(base({
      segnalazione: 'rosso', prefiltro: prefiltro('rosso'), propostaId: null, riservato: null, locatore: 'assente',
      canaleIndicativo: { canale: 'pagarent', beni: 55_800, maggiorazione: 2_790, imponibile: 58_590 },
    }));
    expect(html).toContain('Pagarent');
    expect(html).toContain('indicativo');
    expect(html).toContain('Nessuna proposta per il locatore');
  });

  it('proposta per il locatore che non si legge: la mail lo dice', () => {
    const { html } = corpoMailPratica(base({ locatore: 'illeggibile' }));
    expect(html).toContain('non si è potuta leggere');
  });

  it('LEDwall senza spunta: lo dice', () => {
    const { html } = corpoMailPratica(base({ ledwallConfermato: false }));
    expect(html).toContain('spunta sull&#39;installazione mancante');
  });

  it('il testo del commerciale e i nomi passano dall\'escape', () => {
    const { html } = corpoMailPratica(base({ note: '<script>x</script>', cliente: { ragioneSociale: 'A & B <srl>', piva: '1' } }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;srl&gt;');
  });
});
