// La proposta di distinta (settore "distinta", Led Office): dalla ricerca salvata,
// dal catalogo e dalla distinta del commerciale a quello che vede a schermo.
//
// Niente database: la ricerca, il catalogo e la configurazione dei canali si
// scrivono qui, coi tipi dei moduli che li producono. Il punto che non si tratta e'
// la riservatezza: canale, maggiorazione e imponibile non arrivano mai al browser.

import { describe, expect, it } from 'vitest';
import type { RicercaSalvata } from './calcolo-proposta';
import { componiCalcolo, consegnaDa, distintaPerSchermo, type CalcoloDistinta } from './calcolo-distinta';
import type { VoceCatalogo } from './carrozzeria';
import type { CanaleConfig, Categoria } from './config-distinta';
import type { EventiRicerca } from './eventi-stato';
import { vistaCommerciale } from './instradamento';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { TESTI_PREFILTRO, type SegnaliPrefiltro } from './prefiltro';

// "Oggi" in ora locale, come nei test dell'instradamento
const OGGI = new Date(2026, 9, 20);

const SCHEDA: SchedaRidotta = {
  piva: '01234567890',
  ragioneSociale: 'ALFA UFFICI S.R.L.',
  formaGiuridica: 'SOCIETA\' A RESPONSABILITA\' LIMITATA',
  sede: 'VIA ROMA 1, ROMA (RM)',
  ateco: '62.01.00 Produzione di software',
  attivaDal: '10/03/2015',
  statoAttivita: 'Attiva',
  fatturato: 800_000,
  annoBilancio: 2025,
  trendFatturato: null,
  utile: 50_000,
  patrimonioNetto: 500_000,
  ebitda: null,
  dipendenti: 30,
  rating: null,
  lineaCreditoConsigliata: null,
  unitaLocali: ['VIA MILANO 5, MILANO (MI)', 'VIALE EUROPA 12, NAPOLI (NA)'],
};

const DATI: DatiCreditoMotore = {
  fatturato: 800_000,
  annoBilancio: 2025,
  patrimonioNetto: 500_000,
  utile: 50_000,
  inizioAttivita: '2015-03-10',
  rating: null,
  formaCodice: 'SR',
  attiva: true,
  cessata: false,
  capitaleSociale: 20_000,
  dipendenti: 30,
  bilanciConRicavi: [2025, 2024],
  atecoCodice: '62.01.00',
};

const EVENTI_ASSENTI: EventiRicerca = {
  stato: 'assenti', id: 'ev-1', avviata: null, chiusa: null, codice: '01234567890', daRegistro: true, mail: 'non-serve',
};

const ricerca = (cambi: Partial<RicercaSalvata> = {}, dati: Partial<DatiCreditoMotore> = {}): RicercaSalvata => ({
  id: 'r-1',
  piva: '01234567890',
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: { ...DATI, ...dati }, scheda: SCHEDA },
  eventi: EVENTI_ASSENTI,
  segnali: null,
  ...cambi,
});

const CATEGORIE: Categoria[] = [
  { nome: 'Monitor', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Postazioni', settoriTipici: [], postazione: true, ledwall: false },
  { nome: 'LEDwall', settoriTipici: [], postazione: false, ledwall: true },
  // Tipica solo del commercio: sul cliente del software chiede la motivazione per riga
  { nome: 'Videosorveglianza', settoriTipici: ['47'], postazione: false, ledwall: false },
];

const voce = (codice: string, nome: string, categoria: string, prezzo: number): VoceCatalogo => ({
  id: 1, codice, nome, descrizione: null, prezzo, attributi: { categoria, valido_fino: null }, ordine: 0, attivo: true,
});

const VOCI: VoceCatalogo[] = [
  voce('MON-86', 'Monitor interattivo 86 pollici', 'Monitor', 5_510),
  voce('PC-01', 'Postazione completa', 'Postazioni', 1_200),
  voce('CAM-01', 'Kit videosorveglianza', 'Videosorveglianza', 2_000),
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
const K = { categorie: CATEGORIE, canali: LO };

/** 25 monitor da 5.510: 137.750 di beni, consegna in sede */
const CORPO = {
  righe: [{ codice: 'MON-86', quantita: 25 }],
  consegna: { tipo: 'sede', indirizzo: SCHEDA.sede },
  motivazioni: {},
  ledwallConfermato: false,
};

const LEDWALL = { descrizione: 'LEDwall a progetto 4x2 metri', categoria: 'LEDwall', quantita: 1, prezzo: 40_000 };

function calcolo(
  corpo: Record<string, unknown> = CORPO,
  r: RicercaSalvata = ricerca(),
  k: { categorie: Categoria[] | null; canali: CanaleConfig[] | null } = K,
): CalcoloDistinta {
  const esito = componiCalcolo(r, k, VOCI, corpo, OGGI);
  if (!esito.ok) throw new Error(`distinta rifiutata: ${esito.error}`);
  return esito.calcolo;
}

const calcoloDiProva = calcolo();

/** Le stringhe che non devono mai arrivare al commerciale */
const VIETATE = ['pagarent', 'grenke', 'econocom', 'maggiorazione', 'imponibile', '"canale"', 'riservato', 'servizi di trasporto'];

const SEGNALATO_BLOCCO: SegnaliPrefiltro = {
  segnalato: { motivo: 'insoluto con un altro fornitore', effetto: 'blocco' },
  praticaRecente: null,
};

// IBAN di esempio con cifre di controllo corrette (lo stesso di dati-vendita.test.ts)
const VENDITA = {
  amministratore: { nome: 'Mario Rossi', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: 'Via Roma 1, Roma' },
  telefono: '+39 333 1234567',
  email: 'mario.rossi@example.it',
  riferimento: { nome: 'Anna Bianchi', telefono: '081 1234567' },
  iban: 'IT60 X054 2811 1010 0000 0123 456',
  sdi: 'ABC1234',
  pec: '',
};

describe('consegnaDa', () => {
  it("consegna: sede e unita' riconosciute, il resto e' altro", () => {
    expect(consegnaDa(SCHEDA, { tipo: 'sede', indirizzo: SCHEDA.sede })).toEqual({ tipo: 'sede', indirizzo: SCHEDA.sede });
    expect(consegnaDa(SCHEDA, { tipo: 'unita', indirizzo: 'VIA INVENTATA 1' }).tipo).toBe('altro');
  });

  it("un'unita' locale della scheda e' unita', con l'indirizzo scritto come nella scheda", () => {
    expect(consegnaDa(SCHEDA, { tipo: 'unita', indirizzo: '  viale europa 12,  napoli (na) ' }))
      .toEqual({ tipo: 'unita', indirizzo: 'VIALE EUROPA 12, NAPOLI (NA)' });
  });

  it("decide l'indirizzo, non il tipo dichiarato: la sede scritta a mano e' la sede", () => {
    expect(consegnaDa(SCHEDA, { tipo: 'altro', indirizzo: 'Via Roma 1, Roma (RM)' })).toEqual({ tipo: 'sede', indirizzo: SCHEDA.sede });
    expect(consegnaDa(SCHEDA, { tipo: 'sede', indirizzo: 'VIA MILANO 5, MILANO (MI)' }).tipo).toBe('unita');
  });

  it("un altro indirizzo resta com'e' scritto, senza spazi di troppo", () => {
    expect(consegnaDa(SCHEDA, { tipo: 'altro', indirizzo: '  Via del Porto 3,   Bari ' }))
      .toEqual({ tipo: 'altro', indirizzo: 'Via del Porto 3, Bari' });
  });

  it("ricerca salvata prima delle unita' locali, sede assente, corpo storto: altro senza esplodere", () => {
    const vecchia = { ...SCHEDA, unitaLocali: undefined } as unknown as SchedaRidotta;
    expect(consegnaDa(vecchia, { tipo: 'unita', indirizzo: 'VIA MILANO 5, MILANO (MI)' }).tipo).toBe('altro');
    expect(consegnaDa({ ...SCHEDA, sede: null }, { tipo: 'sede', indirizzo: '' })).toEqual({ tipo: 'altro', indirizzo: '' });
    expect(consegnaDa(SCHEDA, null)).toEqual({ tipo: 'altro', indirizzo: '' });
    expect(consegnaDa(SCHEDA, { tipo: 'sede', indirizzo: 42 })).toEqual({ tipo: 'altro', indirizzo: '' });
  });
});

describe('distintaPerSchermo', () => {
  it("distintaPerSchermo non espone canale, maggiorazione, imponibile ne' nomi", () => {
    const s = JSON.stringify(distintaPerSchermo(calcoloDiProva));
    for (const vietato of VIETATE) expect(s.toLowerCase()).not.toContain(vietato);
    expect(distintaPerSchermo(calcoloDiProva).totaleBeni).toBe(137_750);
    // Su Pagarent la maggiorazione e' 6.888 e l'imponibile 144.638: nessuno dei due numeri esce
    expect(calcoloDiProva.instradamento).toMatchObject({ canale: 'pagarent', maggiorazione: 6_888, imponibile: 144_638 });
    expect(s).not.toContain('6888');
    expect(s).not.toContain('144638');
  });

  it("bloccata con motivo ledwall quando manca la spunta", () => {
    const conLedwallSenzaSpunta = calcolo({ ...CORPO, righe: [...CORPO.righe, LEDWALL] });
    expect(distintaPerSchermo(conLedwallSenzaSpunta)).toMatchObject({ bloccata: true, motivoBlocco: 'ledwall', rate: [] });
    expect(conLedwallSenzaSpunta.instradamento).toBeNull();
  });

  it('con la spunta il LEDwall esce con la rata', () => {
    const c = calcolo({ ...CORPO, righe: [...CORPO.righe, LEDWALL], ledwallConfermato: true });
    const s = distintaPerSchermo(c);
    expect(s).toMatchObject({ bloccata: false, motivoBlocco: null, totaleBeni: 177_750 });
    expect(s.rate!.length).toBeGreaterThan(0);
  });

  it('proposta verde: righe col listino, rate per durata con 60 in evidenza, nota del listino', () => {
    const s = distintaPerSchermo(calcoloDiProva);
    expect(s.semaforo).toBe('verde');
    expect(s.bloccata).toBe(false);
    expect(s.motivoBlocco).toBeNull();
    expect(s.righe).toEqual([{
      codice: 'MON-86', descrizione: 'Monitor interattivo 86 pollici', categoria: 'Monitor', quantita: 25,
      prezzo: 5_510, listino: 5_510, fuoriListino: false, scaduta: false, totale: 137_750,
    }]);
    expect(s.rate).toEqual(vistaCommerciale(calcoloDiProva.instradamento!).rate);
    expect(s.rate!.map((r) => r.durata)).toEqual([24, 36, 48, 60]);
    expect(s.durataEvidenza).toBe(60);
    expect(s.nota).toContain('Istruttoria di 100 euro');
    expect(s.daConfermare).toBe(false);
    expect(s.richiedeProvvisorio).toBe(false);
    expect(s.consegna).toEqual({ tipo: 'sede', indirizzo: SCHEDA.sede });
    // Il blocco del prefiltro ha la stessa forma della verifica, con le righe fisse in coda
    expect(s.prefiltro.righe).toContain(TESTI_PREFILTRO.centraleRischi);
    expect(s.prefiltro.motivazioniMancanti).toEqual([]);
  });

  it("bloccato: solo il blocco del prefiltro, senza righe, rate, totale ne' eventi", () => {
    const c = calcolo(CORPO, ricerca({ segnali: SEGNALATO_BLOCCO }));
    const s = distintaPerSchermo(c);
    expect(Object.keys(s).sort()).toEqual(['bloccata', 'motivoBlocco', 'prefiltro', 'semaforo']);
    expect(s).toMatchObject({ semaforo: 'bloccato', bloccata: true, motivoBlocco: 'bloccato' });
    expect(s.prefiltro.eventi).toBeNull();
    expect(s.prefiltro.righe).toEqual([TESTI_PREFILTRO.bloccato]);
    const testo = JSON.stringify(s);
    expect(testo).not.toContain('Monitor interattivo');
    expect(testo).not.toContain('insoluto');
    expect(c.instradamento).toBeNull();
  });

  it('rosso: la distinta resta a schermo, la rata no', () => {
    const c = calcolo(CORPO, ricerca({ eventi: { ...EVENTI_ASSENTI, stato: 'presenti' } }));
    const s = distintaPerSchermo(c);
    expect(s).toMatchObject({ semaforo: 'rosso', bloccata: true, motivoBlocco: 'rosso', rate: [], totaleBeni: 137_750 });
    expect(s.righe).toHaveLength(1);
    expect(s.prefiltro.eventi).toBe('presenti');
    expect(c.instradamento).toBeNull();
  });

  it("una motivazione richiesta che manca blocca la rata; scritta, la rata esce", () => {
    const corpo = { ...CORPO, righe: [...CORPO.righe, { codice: 'CAM-01', quantita: 1 }] };
    const senza = distintaPerSchermo(calcolo(corpo));
    expect(senza).toMatchObject({ semaforo: 'giallo', bloccata: true, motivoBlocco: 'motivazioni', rate: [] });
    expect(senza.prefiltro.motivazioniMancanti).toEqual(['riga-1']);

    const con = distintaPerSchermo(calcolo({ ...corpo, motivazioni: { 'riga-1': 'Sorveglianza del magazzino ricambi' } }));
    expect(con).toMatchObject({ semaforo: 'giallo', bloccata: false, motivoBlocco: null });
    expect(con.rate!.length).toBe(4);
  });

  it('motivazione e LEDwall mancanti insieme: prima le motivazioni', () => {
    const corpo = { ...CORPO, righe: [...CORPO.righe, { codice: 'CAM-01', quantita: 1 }, LEDWALL] };
    expect(distintaPerSchermo(calcolo(corpo)).motivoBlocco).toBe('motivazioni');
  });

  it('consegna fuori da sede e unita\' locali: giallo, la rata esce', () => {
    const s = distintaPerSchermo(calcolo({ ...CORPO, consegna: { tipo: 'altro', indirizzo: 'Via del Porto 3, Bari' } }));
    expect(s).toMatchObject({ semaforo: 'giallo', bloccata: false, consegna: { tipo: 'altro', indirizzo: 'Via del Porto 3, Bari' } });
  });

  it('nessun canale configurato: nessun_canale, mai il listino della carrozzeria', () => {
    for (const canali of [null, []]) {
      const c = calcolo(CORPO, ricerca(), { categorie: CATEGORIE, canali });
      expect(c.instradamento).toBeNull();
      expect(distintaPerSchermo(c)).toMatchObject({ bloccata: true, motivoBlocco: 'nessun_canale', rate: [] });
    }
  });

  it('oltre 200.000 di imponibile senza Econocom: nessun canale regge', () => {
    // 46 monitor: 253.460 di beni, 266.133 con il 5%: oltre il tetto di Pagarent
    const s = distintaPerSchermo(calcolo({ ...CORPO, righe: [{ codice: 'MON-86', quantita: 46 }] }));
    expect(s).toMatchObject({ semaforo: 'verde', bloccata: true, motivoBlocco: 'nessun_canale', totaleBeni: 253_460, rate: [] });
  });

  it('cliente oltre 5 milioni con beni da 150.000: Econocom da 36 a 60 mesi da confermare, senza nomi', () => {
    // 28 monitor: 154.280 di beni. Il fatturato e' quello della ricerca salvata
    const c = calcolo({ ...CORPO, righe: [{ codice: 'MON-86', quantita: 28 }] }, ricerca({}, { fatturato: 6_000_000 }));
    expect(c.instradamento).toMatchObject({ canale: 'econocom', maggiorazione: 0, imponibile: 154_280 });
    const s = distintaPerSchermo(c);
    expect(s.rate!.map((r) => r.durata)).toEqual([36, 48, 60]);
    expect(s).toMatchObject({ daConfermare: true, durataEvidenza: 60, bloccata: false });
    const testo = JSON.stringify(s).toLowerCase();
    for (const vietato of VIETATE) expect(testo).not.toContain(vietato);
  });

  it('i dati per la proposta di vendita: senza, i quattro campi mancanti; completi, nessuno', () => {
    expect(calcoloDiProva.datiVendita).toBeNull();
    // Il Registro della ricerca di prova non ha ne' PEC ne' codice SDI: si chiedono anche quelli
    expect(distintaPerSchermo(calcoloDiProva).venditaMancanti).toEqual(['telefono', 'email', 'iban', 'sdi_o_pec']);

    const c = calcolo({ ...CORPO, vendita: VENDITA });
    expect(c.venditaMancanti).toEqual([]);
    expect(c.datiVendita?.iban).toBe('IT60X0542811101000000123456');
    const s = distintaPerSchermo(c);
    expect(s.venditaMancanti).toEqual([]);
    // I dati del cliente restano sul server: lo schermo non li rimanda indietro
    expect(JSON.stringify(s)).not.toContain('IT60X0542811101000000123456');
  });

  it('firmatario e PEC dal Registro della ricerca: il commerciale scrive solo cellulare, email e IBAN', () => {
    const firmatario = { nome: 'MARIO ROSSI', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z' };
    const r = ricerca({ dati_credito: { dati: DATI, scheda: { ...SCHEDA, pec: 'rossi@pec.example.it', sdi: null }, firmatario } });
    const solo = { telefono: VENDITA.telefono, email: VENDITA.email, iban: VENDITA.iban };
    const c = calcolo({ ...CORPO, vendita: solo }, r);
    expect(c.venditaMancanti).toEqual([]);
    expect(c.datiVendita?.amministratore).toEqual({ ...firmatario, residenza: '' });
    expect(c.datiVendita?.pec).toBe('rossi@pec.example.it');
    // Codice fiscale e data di nascita non escono verso lo schermo
    const s = JSON.stringify(distintaPerSchermo(c));
    expect(s).not.toContain('RSSMRA79C15H501Z');
    expect(s).not.toContain('15/03/1979');
  });
});

describe('componiCalcolo', () => {
  it("una distinta che non regge dice l'errore e la riga", () => {
    expect(componiCalcolo(ricerca(), K, VOCI, { ...CORPO, righe: [CORPO.righe[0], { codice: 'NON-ESISTE', quantita: 1 }] }, OGGI))
      .toEqual({ ok: false, error: 'voce_non_trovata', riga: 1 });
    expect(componiCalcolo(ricerca(), K, VOCI, { ...CORPO, righe: [] }, OGGI))
      .toEqual({ ok: false, error: 'distinta_vuota', riga: null });
  });

  it('senza categorie configurate nessuna riga passa', () => {
    expect(componiCalcolo(ricerca(), { categorie: null, canali: LO }, VOCI, CORPO, OGGI))
      .toEqual({ ok: false, error: 'categoria_non_valida', riga: 0 });
  });

  it('segnali e eventi sono quelli salvati sulla ricerca; senza, nessun segnale', () => {
    expect(calcoloDiProva.prefiltro.semaforo).toBe('verde');
    const recente = calcolo(CORPO, ricerca({
      segnali: { segnalato: null, praticaRecente: { data: '2026-09-01', canale: 'pagarent', fornitore: 'led-office', fonte: 'motore' } },
    }));
    expect(recente.prefiltro.semaforo).toBe('giallo');
    expect(recente.prefiltro.righe).toContain(TESTI_PREFILTRO.praticaRecente);
    // Della pratica recente il commerciale legge solo il testo generico
    expect(JSON.stringify(distintaPerSchermo(recente))).not.toContain('2026-09-01');
    // Ricerca senza eventi salvati: non avviata, la verifica la fa MCF
    expect(calcolo(CORPO, ricerca({ eventi: null })).prefiltro.eventi).toBe('non-avviata');
  });

  it('le motivazioni restano solo quelle che il prefiltro chiede', () => {
    const c = calcolo({
      ...CORPO,
      righe: [...CORPO.righe, { codice: 'CAM-01', quantita: 1 }],
      motivazioni: { 'riga-1': '  Sorveglianza del magazzino ricambi  ', 'riga-0': 'non richiesta qui', perdita: 'non serve', altro: 'x', 'riga-x': 'y' },
    });
    expect(c.motivazioni).toEqual({ 'riga-1': 'Sorveglianza del magazzino ricambi' });
  });

  it('la spunta del LEDwall vale solo se e\' true', () => {
    const corpo = { ...CORPO, righe: [...CORPO.righe, LEDWALL] };
    expect(calcolo({ ...corpo, ledwallConfermato: 'true' }).ledwallConfermato).toBe(false);
    expect(calcolo({ ...corpo, ledwallConfermato: true }).ledwallConfermato).toBe(true);
  });

  it('la distinta e il totale arrivano dal catalogo, non dal browser', () => {
    const c = calcolo({ ...CORPO, righe: [{ codice: 'MON-86', quantita: 25, descrizione: 'Altro', categoria: 'LEDwall' }] });
    expect(c.distinta.righe[0]).toMatchObject({ descrizione: 'Monitor interattivo 86 pollici', categoria: 'Monitor' });
    expect(c.distinta.conLedwall).toBe(false);
    expect(c.distinta.totale).toBe(137_750);
  });
});
