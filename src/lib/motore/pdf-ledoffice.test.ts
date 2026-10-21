// I tre PDF Led Office: preventivo del canone, proposta di vendita e proposta per il
// locatore. Spec mcf_spec-ledoffice-motore_v1, paragrafo 8.
//
// Il contenuto si prova sulle funzioni pure; del PDF disegnato si controlla che esca e
// che sia un PDF. I numeri vengono dal calcolo vero (componiCalcolo) sulla
// configurazione dei canali di Led Office. Il cliente e' inventato: nel repo non entra
// nessun dato di clienti finali. Il punto che non si tratta e' la riservatezza:
// riga servizi, maggiorazione e imponibile stanno solo nella proposta per il locatore.

import { describe, expect, it } from 'vitest';
import { logoDaBlob } from '../brand-fornitore';
import type { RicercaSalvata } from './calcolo-proposta';
import { componiCalcolo, type CalcoloDistinta } from './calcolo-distinta';
import type { Carrozzeria, VoceCatalogo } from './carrozzeria';
import type { CanaleConfig, Categoria, SocietaFornitrice } from './config-distinta';
import type { EventiRicerca } from './eventi-stato';
import { vistaCommerciale } from './instradamento';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import type { Firmatario } from './registro-vendita';
import {
  contenutoPreventivoCanone,
  contenutoPropostaLocatore,
  contenutoPropostaVendita,
  DESCRIZIONE_SERVIZI,
  disegnaPreventivo,
  disegnaProposta,
  documentiLedOffice,
  NOTA_DA_CONFERMARE,
  NOTA_RATA,
} from './pdf-ledoffice';

// "Oggi" in ora locale, come nei test dell'instradamento
const OGGI = new Date(2026, 9, 20, 10, 15);

const SCHEDA: SchedaRidotta = {
  piva: '01234567890',
  ragioneSociale: 'Alfa Soccorsi Soc. Coop.',
  formaGiuridica: 'SOCIETA\' COOPERATIVA',
  sede: 'VIA ROMA 1 - 00100 ROMA (RM)',
  ateco: '86.90.42 Servizi di ambulanza',
  attivaDal: '10/03/2010',
  statoAttivita: 'Attiva',
  fatturato: 3_000_000,
  annoBilancio: 2025,
  trendFatturato: null,
  utile: 120_000,
  patrimonioNetto: 900_000,
  ebitda: null,
  dipendenti: 200,
  rating: null,
  lineaCreditoConsigliata: null,
  unitaLocali: [],
};

const DATI: DatiCreditoMotore = {
  fatturato: 3_000_000,
  annoBilancio: 2025,
  patrimonioNetto: 900_000,
  utile: 120_000,
  inizioAttivita: '2010-03-10',
  rating: null,
  formaCodice: 'SC',
  attiva: true,
  cessata: false,
  capitaleSociale: 50_000,
  dipendenti: 200,
  bilanciConRicavi: [2025, 2024],
  atecoCodice: '86.90.42',
};

const EVENTI_ASSENTI: EventiRicerca = {
  stato: 'assenti', id: 'ev-1', avviata: null, chiusa: null, codice: '01234567890', daRegistro: true, mail: 'non-serve',
};

/** Il legale rappresentante come lo salva la verifica (registro-vendita.ts) */
const FIRMATARIO: Firmatario = { nome: 'MARIO ROSSI', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z' };

const ricerca = (dati: Partial<DatiCreditoMotore> = {}, firmatario: Firmatario = FIRMATARIO): RicercaSalvata => ({
  id: 'r-1',
  piva: SCHEDA.piva,
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: { ...DATI, ...dati }, scheda: SCHEDA, firmatario },
  eventi: EVENTI_ASSENTI,
  segnali: null,
});

const CATEGORIE: Categoria[] = [
  { nome: 'Postazioni di lavoro', settoriTipici: [], postazione: true, ledwall: false },
  { nome: 'Periferiche e tablet', settoriTipici: [], postazione: false, ledwall: false },
];

const voce = (codice: string, nome: string, categoria: string, prezzo: number): VoceCatalogo => ({
  id: 1, codice, nome, descrizione: null, prezzo, attributi: { categoria, valido_fino: null }, ordine: 0, attivo: true,
});

const VOCI: VoceCatalogo[] = [
  voce('TAB-S10', 'Tablet Samsung Galaxy Tab S10 FE WiFi 128GB', 'Periferiche e tablet', 560),
  voce('AIO-MSI', 'PC all in one MSI Pro AM242 TP 1M SSD 512GB 8GB W11', 'Postazioni di lavoro', 1_800),
];

// La configurazione di Led Office (spec, paragrafo 4): Econocom, Grenke spento, Pagarent col 5%
const LO: CanaleConfig[] = [
  { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000 },
  {
    canale: 'grenke', attivo: false, tabella: 'pioneer', maggiorazionePerc: 0,
    soloCapitali: true, formeEscluse: ['RS'], anniMin: 2, settoriEsclusi: [], sogliaProvvisorio: 50_000,
  },
  { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 },
];

// IBAN di esempio con cifre di controllo corrette (lo stesso di dati-vendita.test.ts)
const VENDITA = {
  amministratore: { nome: 'Mario Rossi', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: 'Via Verdi 3, Roma' },
  telefono: '+39 333 1234567',
  email: 'mario.rossi@example.it',
  riferimento: { nome: 'Anna Bianchi', telefono: '081 1234567' },
  iban: 'IT60X0542811101000000123456',
  sdi: 'ABC1234',
  pec: 'alfa@pec.example.it',
};

/**
 * Il caso CIS nei numeri: 137.750 di beni su Pagarent, maggiorazione 6.888 e
 * imponibile 144.638. 70 tablet a 560 e 50 all-in-one a 1.971 (prezzo trattato sopra
 * il listino di 1.800: nella proposta vera la differenza stava nella riga servizi).
 */
const CORPO = {
  righe: [
    { codice: 'TAB-S10', quantita: 70 },
    { codice: 'AIO-MSI', quantita: 50, prezzo: 1_971 },
  ],
  consegna: { tipo: 'sede', indirizzo: SCHEDA.sede },
  motivazioni: {},
  ledwallConfermato: false,
  vendita: VENDITA,
};

function calcoloDa(corpo: Record<string, unknown>, dati: Partial<DatiCreditoMotore> = {}, firmatario = FIRMATARIO): CalcoloDistinta {
  const esito = componiCalcolo(ricerca(dati, firmatario), { categorie: CATEGORIE, canali: LO }, VOCI, corpo, OGGI);
  if (!esito.ok) throw new Error(`distinta rifiutata: ${esito.error}`);
  return esito.calcolo;
}

const calcolo = calcoloDa(CORPO);
/** Cliente oltre 5 milioni, beni oltre 150.000: Econocom, senza maggiorazione */
const calcoloEconocom = calcoloDa(
  { ...CORPO, righe: [{ codice: 'TAB-S10', quantita: 70 }, { codice: 'AIO-MSI', quantita: 60, prezzo: 1_971 }] },
  { fatturato: 6_000_000 },
);

const EMME2: SocietaFornitrice = {
  ragioneSociale: 'EMME 2 SERVIZI S.R.L.',
  piva: '07000311212',
  rea: 'CE-000000',
  indirizzo: 'Via Nazionale Appia 17 - 81028 Santa Maria a Vico (CE)',
  telefono: '0823 80 91 64',
  email: 'info@emme2servizi.it',
  pec: '',
  logo: 'brand/emme2.jpg',
};

const LO_K: Carrozzeria = {
  slug: 'led-office', nome: 'Led Office', citta: 'Santa Maria a Vico', prefisso: 'LO', organizationId: 'org',
  tabellaCanoni: 'pagarent', brand: { logo: 'brand/led-office.png', colore: '#1D1D1B', accento: '#D03948' },
  settore: 'distinta', etichettaBene: 'Bene', partnerLeasing: 'alba', sogliaLeasing: 0,
  tettoMeseEuro: 100, demo: false, documentiExtra: [], attivo: true,
  tabellaAlternativa: null, regoleSemaforo: 'prefiltro', leasing: false, prezzoVerifica: 5,
  canali: LO, societaFornitrice: EMME2, checklist: null, categorie: CATEGORIE,
};

const SENZA_LOGHI = { fornitrice: null, marchio: null };

/** PNG 1x1 valido, per provare il disegno di un logo vero */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const pdf = (b64: string) => Buffer.from(b64, 'base64');
/** Il PDF di jsPDF non e' compresso: in latin1 il testo stampato si legge cosi' com'e' */
const testoPdf = (b64: string) => pdf(b64).toString('latin1');
const centesimi = (n: number) => Math.round(n * 100);
/** I nomi dei locatori che il cliente non deve mai leggere */
const LOCATORI = /pagarent|grenke|econocom|rete ?rent/i;

describe('i numeri del caso di prova', () => {
  it('Pagarent su 137.750 di beni: maggiorazione 6.888, imponibile 144.638', () => {
    expect(calcolo.prefiltro.bloccaProposta).toBe(false);
    expect(calcolo.instradamento).toMatchObject({ canale: 'pagarent', beni: 137_750, maggiorazione: 6_888, imponibile: 144_638 });
    expect(calcoloEconocom.instradamento).toMatchObject({ canale: 'econocom', maggiorazione: 0 });
  });
});

describe('proposta di vendita', () => {
  it('proposta di vendita: soli beni, totale uguale ai beni, descrizioni in maiuscolo', () => {
    const p = contenutoPropostaVendita(calcolo, EMME2, 'LO-20261020-101500');
    expect(p.totale).toBe(137_750);
    expect(p.righe.map((r) => r.descrizione)).not.toContain(DESCRIZIONE_SERVIZI);
    expect(p.righe.every((r) => r.descrizione === r.descrizione.toUpperCase())).toBe(true);
  });

  it('le righe sono quelle della distinta, col prezzo trattato', () => {
    const p = contenutoPropostaVendita(calcolo, EMME2, 'x', OGGI);
    expect(p.righe).toEqual([
      { descrizione: 'TABLET SAMSUNG GALAXY TAB S10 FE WIFI 128GB', quantita: 70, prezzo: 560, totale: 39_200 },
      { descrizione: 'PC ALL IN ONE MSI PRO AM242 TP 1M SSD 512GB 8GB W11', quantita: 50, prezzo: 1_971, totale: 98_550 },
    ]);
  });

  it('cliente dalla ricerca, dati di vendita come nel modello, IBAN a gruppi di quattro', () => {
    const p = contenutoPropostaVendita(calcolo, EMME2, 'LO-20261020-101500', OGGI);
    expect(p.data).toBe('20/10/2026');
    expect(p.cliente).toEqual({ ragioneSociale: 'ALFA SOCCORSI SOC. COOP.', indirizzo: 'VIA ROMA 1 - 00100 ROMA (RM)', piva: '01234567890' });
    // Firmatario dal Registro; la residenza il Registro non la da' e resta vuota
    expect(p.vendita.amministratore).toEqual({
      nome: 'MARIO ROSSI', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: '',
    });
    // La persona di riferimento e' il firmatario, col cellulare scritto dal commerciale
    expect(p.vendita.riferimento).toEqual({ nome: 'MARIO ROSSI', telefono: '+39 333 1234567' });
    // Email e PEC restano come sono scritte: un indirizzo in maiuscolo non si legge bene
    expect(p.vendita.email).toBe('mario.rossi@example.it');
    expect(p.vendita.pec).toBe('alfa@pec.example.it');
    expect(p.vendita.iban).toBe('IT60 X054 2811 1010 0000 0123 456');
    expect(p.consegna).toBe('VIA ROMA 1 - 00100 ROMA (RM)');
    expect(p.fornitrice).toBe('EMME 2 SERVIZI S.R.L.');
    expect(p.intestazionePiva).toBe('P.I. 07000311212');
    expect(p.riferimento).toBe('Rif. LO-20261020-101500');
  });

  it("piede e intestazione dalla societa' fornitrice", () => {
    expect(contenutoPropostaVendita(calcolo, EMME2, 'x').piede)
      .toBe('Via Nazionale Appia 17 - 81028 Santa Maria a Vico (CE) - Tel 0823 80 91 64 - info@emme2servizi.it - P.I. 07000311212');
  });

  it('nel piede i campi vuoti non lasciano separatori in giro', () => {
    const s = { ...EMME2, telefono: '', email: '' };
    expect(contenutoPropostaVendita(calcolo, s, 'x').piede)
      .toBe('Via Nazionale Appia 17 - 81028 Santa Maria a Vico (CE) - P.I. 07000311212');
  });

  it('niente trattini lunghi nei testi', () => {
    expect(JSON.stringify(contenutoPropostaVendita(calcolo, EMME2, 'x'))).not.toMatch(/[–—]/);
  });

  it('un trattino lungo scritto dal commerciale diventa un trattino normale', () => {
    const c = calcoloDa({
      ...CORPO,
      righe: [...CORPO.righe, { descrizione: 'Supporto a parete — 86 pollici', categoria: 'Periferiche e tablet', quantita: 1, prezzo: 300 }],
    });
    const p = contenutoPropostaVendita(c, { ...EMME2, indirizzo: 'Via Nazionale Appia 17 – Santa Maria a Vico' }, 'x');
    expect(JSON.stringify(p)).not.toMatch(/[–—]/);
    expect(p.righe.at(-1)!.descrizione).toBe('SUPPORTO A PARETE - 86 POLLICI');
  });

  it('apostrofi curvi, euro e simboli diventano stampabili, le accentate restano', () => {
    const c = calcoloDa({
      ...CORPO,
      consegna: { tipo: 'altro', indirizzo: 'Via dell\u2019Industria 5, Bari' },
      righe: [
        ...CORPO.righe,
        { descrizione: 'Staffa \u201Cslim\u201D da 1.500 \u20AC e cavo 20\u20AC', categoria: 'Periferiche e tablet', quantita: 1, prezzo: 300 },
        { descrizione: 'TV\u2122 \u2265 55\u2033 e \u2264 86\u2033 \u{1F642}', categoria: 'Periferiche e tablet', quantita: 1, prezzo: 300 },
      ],
    }, {}, { ...FIRMATARIO, nome: 'Gianni D\u2019Angelo' });
    const p = contenutoPropostaVendita(c, EMME2, 'x');
    expect(p.consegna).toBe("VIA DELL'INDUSTRIA 5, BARI");
    expect(p.vendita.amministratore.nome).toBe("GIANNI D'ANGELO");
    expect(p.vendita.riferimento.nome).toBe("GIANNI D'ANGELO");
    expect(p.righe.at(-2)!.descrizione).toBe('STAFFA "SLIM" DA 1.500 EUR E CAVO 20 EUR');
    expect(p.righe.at(-1)!.descrizione).toBe('TVTM >= 55" E <= 86"');
    // Nessun carattere fuori dal Latin-1 resta nel contenuto
    expect(JSON.stringify(p)).not.toMatch(/[^\u0000-\u00FF]/u);
  });

  it("nel PDF l'apostrofo arriva come ', l'euro come EUR, le accentate maiuscole intere", () => {
    const c = calcoloDa({
      ...CORPO,
      consegna: { tipo: 'altro', indirizzo: 'Via dell\u2019Industria 5, Bari' },
      righe: [
        ...CORPO.righe,
        { descrizione: 'Caffè perché più così, città però: 1.500 \u20AC', categoria: 'Periferiche e tablet', quantita: 1, prezzo: 300 },
      ],
    }, {}, { ...FIRMATARIO, nome: 'Gianni D\u2019Angelo' });
    const t = testoPdf(documentiLedOffice(c, LO_K, 'x', SENZA_LOGHI).cliente[1].contenuto);
    expect(t).toContain("(VIA DELL'INDUSTRIA 5, BARI)");
    expect(t).toContain("(D'ANGELO)");
    for (const parola of ['CAFFÈ', 'PERCHÉ', 'PIÙ', 'COSÌ', 'CITTÀ', 'PERÒ', '1.500 EUR']) expect(t).toContain(parola);
    // Una stringa che jsPDF scrive a due byte comincia con un NUL: nessuna
    expect(t).not.toMatch(/\(\u0000/);
  });

  it('nessuna traccia di canale, maggiorazione o imponibile', () => {
    const s = JSON.stringify(contenutoPropostaVendita(calcolo, EMME2, 'x'));
    expect(s).not.toMatch(/pagarent|grenke|econocom|SERVIZI DI TRASPORTO|6\.?888|144\.?638/i);
  });

  it('senza dati di vendita non si compone', () => {
    const c = calcoloDa({ ...CORPO, vendita: undefined });
    expect(() => contenutoPropostaVendita(c, EMME2, 'x')).toThrow();
  });
});

describe('proposta per il locatore', () => {
  it("proposta per il locatore: riga servizi uguale alla maggiorazione, totale uguale all'imponibile", () => {
    const p = contenutoPropostaLocatore(calcolo, EMME2, 'LO-20261020-101500');
    expect(p.righe.at(-1)).toEqual({ descrizione: DESCRIZIONE_SERVIZI, quantita: 1, prezzo: 6_888, totale: 6_888 });
    expect(p.totale).toBe(144_638);
  });

  it('la somma delle righe torna col totale, al centesimo', () => {
    const p = contenutoPropostaLocatore(calcolo, EMME2, 'x');
    expect(centesimi(p.righe.reduce((s, r) => s + r.totale, 0))).toBe(centesimi(p.totale));
  });

  it('anche con i centesimi nei prezzi: 3 x 1.971,33 e 7 x 560,17', () => {
    const c = calcoloDa({
      ...CORPO,
      righe: [
        { codice: 'AIO-MSI', quantita: 3, prezzo: 1_971.33 },
        { codice: 'TAB-S10', quantita: 7, prezzo: 560.17 },
      ],
    });
    // 5.913,99 + 3.921,19 = 9.835,18 di beni; 5% = 491,759 -> 492; imponibile 10.327,18
    expect(c.instradamento).toMatchObject({ beni: 9_835.18, maggiorazione: 492, imponibile: 10_327.18 });
    const p = contenutoPropostaLocatore(c, EMME2, 'x');
    expect(p.totale).toBe(10_327.18);
    expect(centesimi(p.righe.reduce((s, r) => s + r.totale, 0))).toBe(1_032_718);
    expect(centesimi(contenutoPropostaVendita(c, EMME2, 'x').righe.reduce((s, r) => s + r.totale, 0))).toBe(983_518);
  });

  it('per il resto e\' la stessa proposta di vendita', () => {
    const v = contenutoPropostaVendita(calcolo, EMME2, 'x', OGGI);
    const l = contenutoPropostaLocatore(calcolo, EMME2, 'x', OGGI);
    expect({ ...l, righe: l.righe.slice(0, -1), totale: v.totale }).toEqual(v);
  });

  it('senza maggiorazione le due proposte coincidono', () => {
    expect(contenutoPropostaLocatore(calcoloEconocom, EMME2, 'x').righe).toEqual(contenutoPropostaVendita(calcoloEconocom, EMME2, 'x').righe);
    expect(contenutoPropostaLocatore(calcoloEconocom, EMME2, 'x').totale).toBe(contenutoPropostaVendita(calcoloEconocom, EMME2, 'x').totale);
  });

  it("senza instradamento non c'e' un imponibile e non si compone", () => {
    expect(() => contenutoPropostaLocatore({ ...calcolo, instradamento: null }, EMME2, 'x')).toThrow();
  });
});

describe('preventivo del canone', () => {
  it('preventivo del canone: rate e note, nessun nome, nessuna maggiorazione', () => {
    const p = contenutoPreventivoCanone(calcolo, 'x');
    expect(p.note).toContain(NOTA_RATA);
    expect(JSON.stringify(p)).not.toMatch(/pagarent|grenke|econocom|SERVIZI DI TRASPORTO|6\.?888|144\.?638/i);
  });

  it('rate della vista del commerciale, 60 mesi in evidenza, beni e totale della distinta', () => {
    const p = contenutoPreventivoCanone(calcolo, 'LO-20261020-101500', OGGI);
    expect(p.rate).toEqual(vistaCommerciale(calcolo.instradamento!).rate);
    expect(p.rate.map((r) => r.durata)).toEqual([24, 36, 48, 60]);
    expect(p.durataEvidenza).toBe(60);
    expect(p.totale).toBe(137_750);
    expect(p.righe).toEqual(contenutoPropostaVendita(calcolo, EMME2, 'x').righe);
    expect(p.cliente).toEqual({ ragioneSociale: 'ALFA SOCCORSI SOC. COOP.', piva: '01234567890' });
    expect(p.data).toBe('20/10/2026');
    expect(p.riferimento).toBe('Rif. LO-20261020-101500');
  });

  it('le condizioni del listino stanno fra le note, senza la nota da confermare su Pagarent', () => {
    const p = contenutoPreventivoCanone(calcolo, 'x');
    expect(p.note).toContain(calcolo.instradamento!.nota);
    expect(p.note).not.toContain(NOTA_DA_CONFERMARE);
  });

  it('econocom: nota da confermare', () => expect(contenutoPreventivoCanone(calcoloEconocom, 'x').note).toContain(NOTA_DA_CONFERMARE));

  it('nessuna motivazione e nessuna nota interna', () => {
    const c = { ...calcolo, motivazioni: { addetti: 'Turni di notte, due persone per postazione' } };
    expect(JSON.stringify(contenutoPreventivoCanone(c, 'x'))).not.toMatch(/Turni di notte/);
  });

  it("senza instradamento non c'e' rata e non si compone", () => {
    expect(() => contenutoPreventivoCanone({ ...calcolo, instradamento: null }, 'x')).toThrow();
  });
});

describe('documentiLedOffice', () => {
  it('i PDF disegnati sono PDF e si aprono', () => {
    const d = documentiLedOffice(calcolo, LO_K, 'x', { fornitrice: null, marchio: null });
    expect(d.cliente).toHaveLength(2);
    expect(Buffer.from(d.cliente[0].contenuto, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(d.locatore!.filename).toBe('proposta-locatore-x.pdf');
  });

  it('nomi dei file e ordine: preventivo del canone, poi proposta di vendita', () => {
    const d = documentiLedOffice(calcolo, LO_K, 'LO-1', SENZA_LOGHI, OGGI);
    expect(d.cliente.map((f) => f.filename)).toEqual(['preventivo-canone-LO-1.pdf', 'proposta-vendita-LO-1.pdf']);
    for (const f of [...d.cliente, d.locatore!]) expect(pdf(f.contenuto).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('nei PDF veri la riga servizi e il totale maggiorato stanno solo nella proposta per il locatore', () => {
    const d = documentiLedOffice(calcolo, LO_K, 'x', SENZA_LOGHI, OGGI);
    const vendita = testoPdf(d.cliente[1].contenuto);
    expect(vendita).toContain('137.750,00');
    for (const vietato of ['SERVIZI DI TRASPORTO', '144.638', '6.888']) expect(vendita).not.toContain(vietato);
    const preventivo = testoPdf(d.cliente[0].contenuto);
    for (const vietato of ['SERVIZI DI TRASPORTO', '144.638', '6.888']) expect(preventivo).not.toContain(vietato);
    const locatore = testoPdf(d.locatore!.contenuto);
    expect(locatore).toContain('SERVIZI DI TRASPORTO');
    expect(locatore).toContain('6.888,00');
    expect(locatore).toContain('144.638,00');
  });

  it('nessun nome di locatore nei PDF, su Pagarent e su Econocom', () => {
    for (const c of [calcolo, calcoloEconocom]) {
      const d = documentiLedOffice(c, LO_K, 'x', SENZA_LOGHI, OGGI);
      for (const f of [...d.cliente, d.locatore!]) expect(testoPdf(f.contenuto)).not.toMatch(LOCATORI);
    }
    const preventivoEconocom = testoPdf(documentiLedOffice(calcoloEconocom, LO_K, 'x', SENZA_LOGHI, OGGI).cliente[0].contenuto);
    expect(preventivoEconocom).toContain(NOTA_DA_CONFERMARE);
  });

  it('senza dati di vendita esce solo il preventivo del canone', () => {
    const d = documentiLedOffice(calcoloDa({ ...CORPO, vendita: undefined }), LO_K, 'x', SENZA_LOGHI);
    expect(d.cliente.map((f) => f.filename)).toEqual(['preventivo-canone-x.pdf']);
    expect(d.locatore).toBeNull();
  });

  it("senza indirizzo di consegna esce solo il preventivo del canone", () => {
    const d = documentiLedOffice(calcoloDa({ ...CORPO, consegna: { tipo: 'altro', indirizzo: '' } }), LO_K, 'x', SENZA_LOGHI);
    expect(d.cliente.map((f) => f.filename)).toEqual(['preventivo-canone-x.pdf']);
    expect(d.locatore).toBeNull();
  });

  it('senza instradamento non esce niente: il chiamante rifiuta prima', () => {
    expect(documentiLedOffice({ ...calcolo, instradamento: null }, LO_K, 'x', SENZA_LOGHI)).toEqual({ cliente: [], locatore: null });
  });

  it("senza societa' fornitrice la proposta esce col nome del fornitore", () => {
    const d = documentiLedOffice(calcolo, { ...LO_K, societaFornitrice: null }, 'x', SENZA_LOGHI);
    expect(d.cliente).toHaveLength(2);
    expect(d.locatore).not.toBeNull();
  });

  it('un logo vero si disegna, uno illeggibile lascia il posto al nome', () => {
    const conLogo = documentiLedOffice(calcolo, LO_K, 'x', { fornitrice: PNG_1X1, marchio: PNG_1X1 });
    const rotto = documentiLedOffice(calcolo, LO_K, 'x', { fornitrice: 'non-e-un-logo', marchio: 'AAAA' });
    for (const f of [...conLogo.cliente, ...rotto.cliente]) expect(pdf(f.contenuto).subarray(0, 5).toString()).toBe('%PDF-');
    // Il PDF col logo porta un'immagine, quello senza no
    expect(pdf(conLogo.cliente[1].contenuto).toString('latin1')).toMatch(/\/Subtype \/Image/);
    expect(pdf(rotto.cliente[1].contenuto).toString('latin1')).not.toMatch(/\/Subtype \/Image/);
  });

  it('una distinta lunga va su una seconda pagina senza perdere righe', () => {
    const righe = Array.from({ length: 40 }, (_, i) => ({
      descrizione: `Accessorio numero ${i + 1} con una descrizione abbastanza lunga da andare a capo nella cella della tabella`,
      categoria: 'Periferiche e tablet',
      quantita: 1,
      prezzo: 100,
    }));
    const c = calcoloDa({ ...CORPO, righe });
    const p = contenutoPropostaVendita(c, EMME2, 'x');
    expect(p.righe).toHaveLength(40);
    const b64 = disegnaProposta(p, SENZA_LOGHI);
    expect(pdf(b64).toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });

  it('disegnaPreventivo e disegnaProposta restituiscono un PDF in base64', () => {
    expect(pdf(disegnaPreventivo(contenutoPreventivoCanone(calcolo, 'x'), null, { colore: '#1D1D1B', accento: '#D03948' }))
      .subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf(disegnaProposta(contenutoPropostaLocatore(calcolo, EMME2, 'x'), SENZA_LOGHI)).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('logoDaBlob', () => {
  it('senza percorso non legge niente', async () => {
    expect(await logoDaBlob(null)).toBeNull();
  });
});
