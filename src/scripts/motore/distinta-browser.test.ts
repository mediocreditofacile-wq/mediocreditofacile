// Le regole pure della distinta nel browser (settore "distinta", oggi Led Office):
// ricerca nel catalogo, indirizzi di consegna, motivazioni che seguono le righe,
// righe da mandare al server, voci della checklist. Il controllo vero lo rifa' il server.

import { describe, expect, it } from 'vitest';
import { CATEGORIE_LO, CHECKLIST_LO, vociLedOffice } from '../../lib/motore/catalogo-ledoffice';
import { vociChecklist } from '../../lib/motore/config-distinta';
import {
  classeDaForma,
  filtraCatalogo,
  leggiNumero,
  mancantiProposte,
  motivazioniDopoTolta,
  opzioniConsegna,
  prezzoDaRiconfermare,
  righePerServer,
  vociDaChiedere,
} from './distinta-browser';

const CATALOGO = vociLedOffice();
const codici = (voci: any[]) => voci.map((v) => v.codice);

describe('filtraCatalogo', () => {
  it('senza categoria e senza testo restituisce tutto, nell ordine del catalogo', () => {
    expect(codici(filtraCatalogo(CATALOGO, null, ''))).toEqual(codici(CATALOGO));
    expect(codici(filtraCatalogo(CATALOGO, '', '   '))).toEqual(codici(CATALOGO));
  });

  it('per categoria', () => {
    const tablet = filtraCatalogo(CATALOGO, 'Periferiche e tablet', '');
    expect(tablet.length).toBe(6);
    expect(tablet.every((v) => v.attributi.categoria === 'Periferiche e tablet')).toBe(true);
    expect(filtraCatalogo(CATALOGO, 'LEDwall', '')).toEqual([]);
  });

  it('per testo, senza badare a maiuscole e accenti', () => {
    expect(codici(filtraCatalogo(CATALOGO, null, 'tablet'))).toEqual(['LO-PER-TAB-S10-FE', 'LO-PER-TAB-GSM-11']);
    expect(codici(filtraCatalogo(CATALOGO, null, 'AM242'))).toEqual(['LO-POST-AM242']);
    const conAccenti = [
      { codice: 'X1', nome: 'UNITA DI CONTROLLO', prezzo: 10, attributi: { categoria: 'Server e stampa' } },
      { codice: 'X2', nome: 'Proiettore', descrizione: 'Qualità 4K', prezzo: 10, attributi: { categoria: 'Server e stampa' } },
    ];
    expect(codici(filtraCatalogo(conAccenti, null, 'unità'))).toEqual(['X1']);
    expect(codici(filtraCatalogo(conAccenti, null, 'QUALITA'))).toEqual(['X2']);
  });

  it('ogni parola deve esserci, in qualunque ordine', () => {
    expect(codici(filtraCatalogo(CATALOGO, null, 'all in one i5'))).toEqual(['LO-POST-AM242', 'LO-POST-AIO-I5-256']);
    expect(codici(filtraCatalogo(CATALOGO, null, '256 msi all'))).toEqual(['LO-POST-AIO-I5-256']);
    expect(filtraCatalogo(CATALOGO, null, 'tablet dell')).toEqual([]);
  });

  it('categoria e testo insieme', () => {
    expect(codici(filtraCatalogo(CATALOGO, 'Postazioni di lavoro', 'apple'))).toEqual(['LO-POST-MACBOOK-AIR-15', 'LO-POST-IMAC-24']);
    expect(codici(filtraCatalogo(CATALOGO, 'Workstation grafiche', 'apple'))).toEqual(['LO-WS-MACBOOK-PRO-14']);
  });

  it('il testo non cerca nel nome della categoria', () => {
    // "Periferiche e tablet" non deve tirare dentro monitor e cuffie
    expect(filtraCatalogo(CATALOGO, null, 'tablet').every((v) => /TABLET/.test(v.nome))).toBe(true);
  });
});

describe('leggiNumero', () => {
  it('i numeri restano numeri', () => {
    expect(leggiNumero(1500)).toBe(1500);
    expect(leggiNumero(951.23)).toBe(951.23);
    expect(leggiNumero(NaN)).toBeNaN();
  });

  it('all italiana: il punto separa le migliaia, la virgola i decimali', () => {
    expect(leggiNumero('1500')).toBe(1500);
    expect(leggiNumero('1.500')).toBe(1500);
    expect(leggiNumero('1.234.567')).toBe(1234567);
    expect(leggiNumero('1.500,50')).toBe(1500.5);
    expect(leggiNumero('1500,5')).toBe(1500.5);
    expect(leggiNumero(' € 1.900 ')).toBe(1900);
  });

  it('un punto che non separa migliaia e il separatore dei decimali', () => {
    expect(leggiNumero('1500.50')).toBe(1500.5);
    expect(leggiNumero('12.5')).toBe(12.5);
    expect(leggiNumero('0.99')).toBe(0.99);
  });

  it('quello che non si legge e NaN, mai zero', () => {
    for (const v of ['', '   ', 'abc', '1,2,3', '1.50.0', '12,', null, undefined]) expect(leggiNumero(v)).toBeNaN();
  });
});

describe('opzioniConsegna', () => {
  it('sede legale e due unita locali danno tre voci, la sede per prima', () => {
    const o = opzioniConsegna({ sede: 'VIA ROMA 1, 00100 ROMA (RM)', unitaLocali: ['VIA MILANO 2, 20100 MILANO (MI)', 'VIA NAPOLI 3, 80100 NAPOLI (NA)'] });
    expect(o).toEqual([
      { tipo: 'sede', indirizzo: 'VIA ROMA 1, 00100 ROMA (RM)', etichetta: 'Sede legale: VIA ROMA 1, 00100 ROMA (RM)' },
      { tipo: 'unita', indirizzo: 'VIA MILANO 2, 20100 MILANO (MI)', etichetta: 'Unità locale: VIA MILANO 2, 20100 MILANO (MI)' },
      { tipo: 'unita', indirizzo: 'VIA NAPOLI 3, 80100 NAPOLI (NA)', etichetta: 'Unità locale: VIA NAPOLI 3, 80100 NAPOLI (NA)' },
    ]);
  });

  it('senza sede restano le sole unita locali', () => {
    const o = opzioniConsegna({ sede: null, unitaLocali: ['VIA MILANO 2', 'VIA NAPOLI 3'] });
    expect(o.map((x) => x.tipo)).toEqual(['unita', 'unita']);
    expect(o.map((x) => x.indirizzo)).toEqual(['VIA MILANO 2', 'VIA NAPOLI 3']);
  });

  it('ricerca vecchia senza unita locali: la sola sede', () => {
    const o = opzioniConsegna({ sede: 'VIA ROMA 1' } as any);
    expect(o).toEqual([{ tipo: 'sede', indirizzo: 'VIA ROMA 1', etichetta: 'Sede legale: VIA ROMA 1' }]);
    expect(opzioniConsegna({ sede: null, unitaLocali: [] })).toEqual([]);
  });

  it('indirizzi vuoti o ripetuti si scartano', () => {
    const o = opzioniConsegna({ sede: 'Via Roma 1', unitaLocali: ['', 'VIA  ROMA 1', 'via milano 2', 'VIA MILANO 2'] });
    expect(o.map((x) => x.indirizzo)).toEqual(['Via Roma 1', 'via milano 2']);
  });
});

describe('motivazioniDopoTolta', () => {
  it('togliendo una riga la sua motivazione sparisce e quelle dopo scalano di uno', () => {
    const m = { perdita: 'p', addetti: 'a', 'riga-0': 'zero', 'riga-1': 'uno', 'riga-2': 'due', 'riga-10': 'dieci' };
    expect(motivazioniDopoTolta(m, 1)).toEqual({ perdita: 'p', addetti: 'a', 'riga-0': 'zero', 'riga-1': 'due', 'riga-9': 'dieci' });
  });

  it('togliendo la prima o l ultima riga', () => {
    expect(motivazioniDopoTolta({ 'riga-0': 'zero', 'riga-1': 'uno' }, 0)).toEqual({ 'riga-0': 'uno' });
    expect(motivazioniDopoTolta({ 'riga-0': 'zero', 'riga-1': 'uno' }, 1)).toEqual({ 'riga-0': 'zero' });
  });

  it('non tocca l oggetto di partenza', () => {
    const m = { 'riga-0': 'zero', 'riga-1': 'uno' };
    motivazioniDopoTolta(m, 0);
    expect(m).toEqual({ 'riga-0': 'zero', 'riga-1': 'uno' });
  });
});

describe('prezzoDaRiconfermare', () => {
  it('come il server: assente no, il giorno stesso no, il giorno dopo si, data storta si', () => {
    expect(prezzoDaRiconfermare(undefined, '2026-10-20')).toBe(false);
    expect(prezzoDaRiconfermare('', '2026-10-20')).toBe(false);
    expect(prezzoDaRiconfermare('2026-10-20', '2026-10-20')).toBe(false);
    expect(prezzoDaRiconfermare('2026-10-19', '2026-10-20')).toBe(true);
    expect(prezzoDaRiconfermare('31/12/2026', '2026-10-20')).toBe(true);
  });
});

describe('righePerServer', () => {
  it('le righe di listino mandano codice, quantita e prezzo come numeri', () => {
    const r = righePerServer([
      { codice: 'LO-PER-TAB-S10-FE', descrizione: 'TABLET', categoria: 'Periferiche e tablet', quantita: 70, prezzo: 560 },
      { codice: 'LO-POST-AM242', descrizione: 'PC', categoria: 'Postazioni di lavoro', quantita: 50, prezzo: 1799.5 },
    ]);
    expect(r).toEqual({
      ok: true,
      righe: [
        { codice: 'LO-PER-TAB-S10-FE', quantita: 70, prezzo: 560 },
        { codice: 'LO-POST-AM242', quantita: 50, prezzo: 1799.5 },
      ],
    });
    if (r.ok) for (const x of r.righe) {
      expect(typeof x.quantita).toBe('number');
      expect(typeof x.prezzo).toBe('number');
    }
  });

  it('la riga fuori listino non ha la chiave codice, mai una stringa vuota', () => {
    const r = righePerServer([{ codice: null, descrizione: ' LEDWALL 3X2 ', categoria: 'LEDwall', quantita: 1, prezzo: 18000 }]);
    expect(r).toEqual({ ok: true, righe: [{ descrizione: 'LEDWALL 3X2', categoria: 'LEDwall', quantita: 1, prezzo: 18000 }] });
    if (r.ok) expect('codice' in r.righe[0]).toBe(false);
  });

  it('si ferma alla prima riga che non regge e dice quale', () => {
    const buona = { codice: 'LO-POST-AM242', descrizione: 'PC', categoria: 'Postazioni di lavoro', quantita: 1, prezzo: 1900 };
    expect(righePerServer([])).toEqual({ ok: false, riga: null, errore: 'distinta_vuota' });
    expect(righePerServer([buona, { ...buona, quantita: 1.5 }])).toEqual({ ok: false, riga: 1, errore: 'quantita_non_valida' });
    expect(righePerServer([buona, { ...buona, quantita: 0 }])).toEqual({ ok: false, riga: 1, errore: 'quantita_non_valida' });
    expect(righePerServer([{ ...buona, quantita: NaN }])).toEqual({ ok: false, riga: 0, errore: 'quantita_non_valida' });
    expect(righePerServer([{ ...buona, prezzo: 0 }])).toEqual({ ok: false, riga: 0, errore: 'prezzo_non_valido' });
    expect(righePerServer([{ ...buona, prezzo: NaN }])).toEqual({ ok: false, riga: 0, errore: 'prezzo_non_valido' });
    expect(righePerServer([{ ...buona, codice: null, descrizione: '  ' }])).toEqual({ ok: false, riga: 0, errore: 'descrizione_mancante' });
    expect(righePerServer([{ ...buona, codice: null, categoria: '' }])).toEqual({ ok: false, riga: 0, errore: 'categoria_non_valida' });
  });
});

describe('classeDaForma', () => {
  it('dalla forma giuridica scritta nella scheda', () => {
    expect(classeDaForma("SOCIETA' A RESPONSABILITA' LIMITATA")).toBe('capitali');
    expect(classeDaForma("SOCIETA' A RESPONSABILITA' LIMITATA SEMPLIFICATA")).toBe('capitali');
    expect(classeDaForma("SOCIETA' PER AZIONI")).toBe('capitali');
    expect(classeDaForma('SOCIETA COOPERATIVA')).toBe('capitali');
    expect(classeDaForma("SOCIETA' IN NOME COLLETTIVO")).toBe('persone');
    expect(classeDaForma("SOCIETA' IN ACCOMANDITA SEMPLICE")).toBe('persone');
    expect(classeDaForma("SOCIETA' SEMPLICE")).toBe('persone');
    expect(classeDaForma('IMPRESA INDIVIDUALE')).toBe('individuale');
  });

  it('nel dubbio non classificata, cosi la checklist chiede di piu', () => {
    expect(classeDaForma(null)).toBe('non-classificata');
    expect(classeDaForma('')).toBe('non-classificata');
    expect(classeDaForma('ENTE NON COMMERCIALE')).toBe('non-classificata');
  });
});

describe('vociDaChiedere', () => {
  it('la stessa regola di vociChecklist del server', () => {
    for (const classe of ['capitali', 'persone', 'individuale', 'non-classificata'] as const) {
      for (const beni of [10_000, 50_000, 50_000.01, 134_200, NaN]) {
        expect(vociDaChiedere(CHECKLIST_LO.voci, classe, beni).map((v) => v.nome))
          .toEqual(vociChecklist(CHECKLIST_LO, classe, beni).map((v) => v.nome));
      }
    }
  });

  it('una SRL da 134.200 euro: bilanci e situazione contabile, niente dichiarazioni', () => {
    const nomi = vociDaChiedere(CHECKLIST_LO.voci, 'capitali', 134_200).map((v) => v.nome);
    expect(nomi).toContain('Ultimi due bilanci depositati con ricevuta di deposito');
    expect(nomi).toContain("Situazione contabile dell'anno (bilancio provvisorio)");
    expect(nomi).not.toContain('Ultime due dichiarazioni dei redditi');
  });
});

describe('mancantiProposte', () => {
  it('indirizzo di consegna e dati di vendita, con le parole del modulo', () => {
    expect(mancantiProposte(['amministratore.nascita', 'iban', 'sdi_o_pec'], '')).toEqual([
      'indirizzo di consegna',
      "data di nascita dell'amministratore",
      'IBAN',
      'codice SDI o PEC',
    ]);
  });

  it('niente da chiedere quando tutto c e', () => {
    expect(mancantiProposte([], 'VIA ROMA 1')).toEqual([]);
    expect(mancantiProposte([], '   ')).toEqual(['indirizzo di consegna']);
  });

  it('tutte le dieci chiavi di leggiDatiVendita hanno un nome', () => {
    const chiavi = [
      'amministratore.nome', 'amministratore.nascita', 'amministratore.codiceFiscale', 'amministratore.residenza',
      'telefono', 'email', 'riferimento.nome', 'riferimento.telefono', 'iban', 'sdi_o_pec',
    ];
    const nomi = mancantiProposte(chiavi, 'VIA ROMA 1');
    expect(nomi).toHaveLength(10);
    expect(nomi.every((n) => !n.includes('.') && !n.includes('_'))).toBe(true);
  });
});

describe('categorie della carrozzeria', () => {
  it('le righe fuori listino usano le categorie di Led Office', () => {
    // Guardia: i test sopra usano i nomi veri delle categorie
    expect(CATEGORIE_LO.map((c) => c.nome)).toContain('LEDwall');
    expect(CATEGORIE_LO.map((c) => c.nome)).toContain('Periferiche e tablet');
  });
});
