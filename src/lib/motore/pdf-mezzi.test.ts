// I PDF del settore mezzi (Bergamelli): preventivo di noleggio intestato al venditore
// e prospetto di leasing a marchio MCF.
//
// Il contenuto si prova sulle funzioni pure, senza aprire un PDF; del PDF disegnato si
// controlla soltanto che esca e che sia un PDF. I numeri vengono dal calcolo vero
// (componiMezzi) su una carrozzeria nata da una riga finta, come in calcolo-mezzi.test.ts.
// Il punto che conta: i due documenti vanno al cliente e non nominano mai un locatore,
// una societa' di leasing, un tasso o un canale.

import { describe, expect, it } from 'vitest';
import { componiMezzi, chiaveColonna, type CalcoloMezzi } from './calcolo-mezzi';
import type { RicercaSalvata } from './calcolo-proposta';
import { carrozzeriaDaRiga, type Carrozzeria, type RigaCarrozzeria } from './carrozzeria';
import { vistaCommerciale } from './instradamento';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { dataItaliana, euro, NOTA_DEMO_PDF, PIEDE_LEASING, PIEDE_NOLEGGIO, type Blocco, type Documento } from './pdf-generico';
import { contenutoLeasingMezzi, contenutoNoleggioMezzi, documentiMezzi } from './pdf-mezzi';

// "Oggi" in ora locale, come nei test dell'instradamento
const OGGI = new Date(2026, 9, 23);
const AGENTE = { nome: 'Mario Rossi', email: 'mario@example.invalid' };

// --- la carrozzeria: Bergamelli, come la scrive il seed ----------------------

const CANALI = [
  { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000, venditori: ['nolsystem'], escludiTargati: true, escludiUsati: true },
  { canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0, venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true, escludiUsati: true },
];

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
    { nome: 'Carrelli elevatori', targato: false },
    { nome: 'Ponteggi', targato: false },
  ],
  leasing: {
    anticipoPerc: 10,
    partner: [
      { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
      { partner: 'credem', spreadFinoA48: 2.9, spreadDa60: 2.9 },
      { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
      { partner: 'aleasing', spreadFinoA48: 4, spreadDa60: 4, soloUsato: true },
    ],
  },
  mostraNomiPartner: true,
};

const RIGA: RigaCarrozzeria = {
  slug: 'bergamelli', nome: 'Bergamelli', citta: 'Brescia', prefisso: 'BG', organization_id: 'org-bg',
  tabella_canoni: 'sputnik', brand_logo: null, brand_colore: '#1B3A57', brand_accento: '#E66A2C', attivo: true,
  settore: 'mezzi', etichetta_bene: 'Mezzo', partner_leasing: 'alba', soglia_leasing: '0', tetto_mese_euro: '30',
  demo: false, documenti_extra: ['Offerta del venditore intestata al cliente'], tabella_alternativa: null,
  regole_semaforo: 'locatore', leasing: true, prezzo_verifica: null, canali: CANALI, mezzi: MEZZI,
};

const bergamelli = (cambi: Partial<RigaCarrozzeria> = {}): Carrozzeria => carrozzeriaDaRiga({ ...RIGA, ...cambi });
const K = bergamelli();
const KDEMO = bergamelli({ demo: true });

// --- la ricerca salvata ------------------------------------------------------

const SCHEDA: SchedaRidotta = {
  piva: '01234567890',
  ragioneSociale: 'EDILE ALFA S.R.L.',
  formaGiuridica: "SOCIETA' A RESPONSABILITA' LIMITATA",
  sede: 'VIA ROMA 1, ROMA (RM)',
  ateco: '41.20.00 Costruzione di edifici',
  attivaDal: '10/03/2015',
  statoAttivita: 'Attiva',
  fatturato: 1_000_000,
  annoBilancio: 2025,
  trendFatturato: null,
  utile: 50_000,
  patrimonioNetto: 500_000,
  ebitda: null,
  dipendenti: 30,
  rating: null,
  lineaCreditoConsigliata: null,
  unitaLocali: [],
};

const DATI: DatiCreditoMotore = {
  fatturato: 1_000_000,
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
  atecoCodice: '41.20.00',
};

const ricerca = (fatturato = 1_000_000): RicercaSalvata => ({
  id: 'r-1',
  piva: '01234567890',
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: { ...DATI, fatturato }, scheda: { ...SCHEDA, fatturato } },
  eventi: null,
  segnali: null,
});

// --- i beni ------------------------------------------------------------------

const bene = (categoria: string, prezzo: number, extra: Record<string, unknown> = {}) => ({
  descrizione: `${categoria} di prova`, categoria, quantita: 1, prezzo, ...extra,
});

/** Una gru a torre da 50.000 euro: manc, non targata, Grenke */
const GRU = { beni: [bene('Gru a torre', 50_000)] };
/** Un carrello elevatore da 200.000 euro con un cliente da 6 milioni: nolsystem, Econocom */
const CARRELLO = { beni: [bene('Carrelli elevatori', 200_000)] };
/** Un'autogru targata: nessun noleggio, il leasing resta */
const AUTOGRU = { beni: [bene('Autogru', 80_000)] };

function calcolo(corpo: Record<string, unknown>, r: RicercaSalvata | null = ricerca(), k: Carrozzeria = K): CalcoloMezzi {
  const esito = componiMezzi(r, k, corpo, OGGI);
  if (!esito.ok) throw new Error(`mezzi rifiutati: ${esito.error}`);
  return esito.calcolo;
}

const CAL_GRU = calcolo(GRU);
const CAL_CARRELLO = calcolo(CARRELLO, ricerca(6_000_000));
const CAL_AUTOGRU = calcolo(AUTOGRU);

const tabelle = (d: Documento) => d.blocchi.filter((b): b is Extract<Blocco, { tipo: 'tabella' }> => b.tipo === 'tabella');
const testi = (d: Documento) => d.blocchi.filter((b): b is Extract<Blocco, { tipo: 'testo' }> => b.tipo === 'testo').map((b) => b.testo);

// Le parole che nei documenti al cliente non compaiono mai (decisione del controller)
const VIETATE = ['sella', 'credem', 'alba', 'grenke', 'econocom', 'sputnik', 'tasso', 'spread', 'provvig', 'canale'];

// --- preventivo di noleggio --------------------------------------------------

describe('preventivo di noleggio', () => {
  const d = contenutoNoleggioMezzi(CAL_GRU, K, 'BG-20261023-100000', AGENTE, OGGI)!;

  it('porta il nome del venditore, non quello della carrozzeria', () => {
    expect(d.marchio).toBe('fornitore');
    expect(d.titolo).toBe('Manc S.r.l.');
    expect(d.sottotitolo).toBe('Preventivo di noleggio operativo');
    expect(d.filename).toBe('preventivo-noleggio-BG-20261023-100000.pdf');
    expect(d.riferimento).toBe(`N. BG-20261023-100000 · ${dataItaliana(OGGI)}`);
    expect(d.notaDemo).toBeNull();
  });

  it('un carrello elevatore si intesta a Nol System', () => {
    const c = contenutoNoleggioMezzi(CAL_CARRELLO, K, 'BG-2', AGENTE, OGGI)!;
    expect(c.titolo).toBe('NOL SYSTEM ITALIA SRL');
  });

  it('il cliente: ragione sociale, partita IVA, sede', () => {
    const coppie = d.blocchi.find((b) => b.tipo === 'coppie');
    expect(coppie && coppie.tipo === 'coppie' ? coppie.righe : []).toEqual([
      ['Ragione sociale', 'EDILE ALFA S.R.L.'],
      ['Partita IVA', '01234567890'],
      ['Sede', 'VIA ROMA 1, ROMA (RM)'],
    ]);
  });

  it('la fornitura e\' una tabella dei beni, col totale', () => {
    const t = tabelle(d)[0];
    expect(t.intestazioni).toEqual(['Descrizione', 'Categoria', 'Quantità', 'Prezzo, euro', 'Totale, euro']);
    expect(t.righe).toEqual([['Gru a torre di prova', 'Gru a torre', '1', '50.000,00', '50.000,00']]);
    expect(JSON.stringify(d.blocchi)).toContain('Totale, IVA esclusa');
    expect(JSON.stringify(d.blocchi)).toContain('50.000,00 euro');
  });

  it('piu\' beni: una riga ciascuno, prezzo unitario e totale di riga', () => {
    const c = calcolo({
      beni: [bene('Gru a torre', 30_000, { quantita: 2, descrizione: 'Gru A' }), bene('Gru a torre', 5_000, { descrizione: 'Gru B' })],
    });
    const t = tabelle(contenutoNoleggioMezzi(c, K, 'BG-3', AGENTE, OGGI)!)[0];
    expect(t.righe).toEqual([
      ['Gru A', 'Gru a torre', '2', '30.000,00', '60.000,00'],
      ['Gru B', 'Gru a torre', '1', '5.000,00', '5.000,00'],
    ]);
  });

  it('una descrizione lunga va a capo su piu\' righe: la cella non scrive sopra la colonna accanto', () => {
    const lunga = 'Gru a torre Potain MCT 85 con braccio da 50 metri, anno 2021, matricola 123456, completa di zavorre e carrello';
    const c = calcolo({ beni: [bene('Gru a torre', 50_000, { descrizione: lunga })] });
    const t = tabelle(contenutoNoleggioMezzi(c, K, 'BG-4', AGENTE, OGGI)!)[0];
    expect(t.righe.length).toBeGreaterThan(1);
    // Il testo intero c'e', nell'ordine; i numeri stanno sulla prima riga
    expect(t.righe.map((r) => r[0]).join(' ')).toBe(lunga);
    expect(t.righe[0].slice(2)).toEqual(['1', '50.000,00', '50.000,00']);
    expect(t.righe.slice(1).every((r) => r.slice(2).every((x) => x === ''))).toBe(true);
    expect(Math.max(...t.righe.map((r) => r[0].length))).toBeLessThanOrEqual(40);
  });

  it('una parola piu\' lunga della cella si taglia, una categoria lunga va a capo', () => {
    const categoria = 'Attrezzature speciali per cantieri edili';
    const k = bergamelli({ mezzi: { ...MEZZI, categorie: [...MEZZI.categorie, { nome: categoria, targato: false }] } });
    const c = calcolo({ beni: [bene(categoria, 9_000, { descrizione: 'X'.repeat(50) })], venditore: 'manc' }, ricerca(), k);
    const t = tabelle(contenutoNoleggioMezzi(c, k, 'BG-4b', AGENTE, OGGI)!)[0];
    // La descrizione ha due righe, la categoria tre: le righe sono tre e l'ultima ha solo la categoria
    expect(t.righe.map((r) => r[0])).toEqual(['X'.repeat(36), 'X'.repeat(14), '']);
    expect(t.righe.map((r) => r[1]).filter(Boolean).join(' ')).toBe(categoria);
    expect(t.righe.map((r) => r.slice(2).join('|'))).toEqual(['1|9.000,00|9.000,00', '||', '||']);
    expect(Math.max(...t.righe.map((r) => r[1].length))).toBeLessThanOrEqual(18);
  });

  it('una categoria corta di uso comune sta su una riga sola', () => {
    const t = tabelle(contenutoNoleggioMezzi(CAL_CARRELLO, K, 'BG-4c', AGENTE, OGGI)!)[0];
    expect(t.righe).toEqual([['Carrelli elevatori di prova', 'Carrelli elevatori', '1', '200.000,00', '200.000,00']]);
  });

  it('il canone per durata e\' quello della vista commerciale', () => {
    const t = tabelle(d)[1];
    expect(t.intestazioni).toEqual(['Durata', 'Canone mensile, euro']);
    const attese = vistaCommerciale(CAL_GRU.noleggio!).rate.map((r) => [`${r.durata} mesi`, euro(r.canone)]);
    expect(attese.length).toBeGreaterThan(0);
    expect(t.righe).toEqual(attese);
  });

  it('dice le condizioni del listino, che gli importi sono IVA esclusa e chi e\' il referente', () => {
    const tutto = testi(d).join(' ');
    expect(tutto).toContain(CAL_GRU.noleggio!.nota!);
    expect(tutto).toContain('Importi IVA esclusa.');
    expect(tutto).not.toContain('da confermare');
    expect(testi(d)).toContain('Referente commerciale: Mario Rossi, mario@example.invalid');
  });

  it('senza nome dell\'agente resta la sola email', () => {
    const c = contenutoNoleggioMezzi(CAL_GRU, K, 'BG-5', { nome: '', email: 'mario@example.invalid' }, OGGI)!;
    expect(testi(c)).toContain('Referente commerciale: mario@example.invalid');
    // Ne' nome ne' email: nessuna riga vuota
    const nessuno = contenutoNoleggioMezzi(CAL_GRU, K, 'BG-5b', { nome: ' ', email: '' }, OGGI)!;
    expect(testi(nessuno).some((t) => t.startsWith('Referente commerciale'))).toBe(false);
  });

  it('rata da confermare (Econocom): lo dice una volta sola', () => {
    const c = contenutoNoleggioMezzi(CAL_CARRELLO, K, 'BG-6', AGENTE, OGGI)!;
    const tutto = testi(c).join(' ');
    expect(CAL_CARRELLO.noleggio?.daConfermare).toBe(true);
    expect(tutto).toContain('da confermare');
    expect(tutto.match(/da confermare/g)).toHaveLength(1);
  });

  it('i documenti per aprire la pratica seguono forma giuridica e importo', () => {
    const elenco = d.blocchi.find((b) => b.tipo === 'elenco');
    const voci = elenco && elenco.tipo === 'elenco' ? elenco.voci : [];
    expect(voci).toContain('Offerta del venditore intestata al cliente');
    expect(voci).toContain('Ultimi 2 bilanci depositati'); // sopra 10.000 euro, societa' di capitali
    expect(d.blocchi.some((b) => b.tipo === 'sezione' && b.titolo === 'Documenti per aprire la pratica')).toBe(true);
  });

  it('il piede: venditore con recapiti, poi le parole di Mediocredito Facile', () => {
    expect(d.piede).toBe(
      `Manc S.r.l. · P.IVA 03863700989 · Via Roma 1, 25100 Brescia (BS) · +39 030 000000 · info@manc.example. ${PIEDE_NOLEGGIO}`,
    );
    expect(d.piede).not.toContain('manc@pec.example');
  });

  it('il piede di un venditore senza recapiti non lascia separatori vuoti', () => {
    const c = contenutoNoleggioMezzi(CAL_CARRELLO, K, 'BG-7', AGENTE, OGGI)!;
    expect(c.piede).toBe(`NOL SYSTEM ITALIA SRL · P.IVA 05400750260. ${PIEDE_NOLEGGIO}`);
  });

  it('senza noleggio non c\'e\' il documento', () => {
    expect(CAL_AUTOGRU.noleggio).toBeNull();
    expect(contenutoNoleggioMezzi(CAL_AUTOGRU, K, 'BG-8', AGENTE, OGGI)).toBeNull();
    // Cliente che non regge Econocom: nessun canale
    const nessuno = calcolo(CARRELLO, ricerca(4_000_000));
    expect(contenutoNoleggioMezzi(nessuno, K, 'BG-9', AGENTE, OGGI)).toBeNull();
  });

  it('in simulazione il cliente non c\'e\': nessun documento', () => {
    const sim = calcolo(GRU, null);
    expect(sim.noleggio).not.toBeNull();
    expect(contenutoNoleggioMezzi(sim, K, 'BG-10', AGENTE, OGGI)).toBeNull();
  });
});

// --- prospetto di leasing ----------------------------------------------------

describe('mezzo usato: niente preventivo di noleggio, A-Leasing nel prospetto di leasing se scelto', () => {
  const usata = calcolo({ beni: [bene('Gru a torre', 50_000, { usato: true })] });

  it('senza noleggio non c\'e\' il preventivo di noleggio', () => {
    expect(usata.noleggio).toBeNull();
    expect(contenutoNoleggioMezzi(usata, K, 'BG-30', AGENTE, OGGI)).toBeNull();
  });

  it('la colonna D e\' A-Leasing: solo 48 e 60 mesi, e nel documento nessun nome di societa\' ne\' tasso', () => {
    expect(usata.leasing[3].partner).toBe('aleasing');
    const d = contenutoLeasingMezzi(usata, K, 'BG-30', 'D', OGGI)!;
    expect(tabelle(d)[0].righe.map((r) => r[0])).toEqual(['48 mesi', '60 mesi']);
    // Il bene dice che e' usato: il cliente non deve leggerlo come nuovo
    const bene = d.blocchi.filter((b): b is Extract<Blocco, { tipo: 'coppie' }> => b.tipo === 'coppie')[1].righe[0][1];
    expect(bene).toBe('Gru a torre di prova (Gru a torre, usato), 1 x 50.000,00 euro');
    const serializzato = JSON.stringify(d).toLowerCase();
    for (const parola of [...VIETATE, 'a-leasing', 'aleasing', 'raiffeisen']) expect(serializzato, parola).not.toContain(parola);
  });
});


describe('prospetto di leasing', () => {
  const d = contenutoLeasingMezzi(CAL_GRU, K, 'BG-20261023-100000', 'A', OGGI)!;

  it('esce a marchio MCF con OAM', () => {
    expect(d.marchio).toBe('mcf');
    expect(d.titolo).toBe('Mediocredito Facile');
    expect(d.sottotitolo).toBe('Prospetto di leasing finanziario');
    expect(d.filename).toBe('prospetto-leasing-BG-20261023-100000.pdf');
    expect(d.piede).toBe(PIEDE_LEASING);
    expect(d.piede).toMatch(/OAM M325/);
    expect(d.notaDemo).toBeNull();
  });

  it('cliente e bene: righe, fornitore = venditore, importo', () => {
    const coppie = d.blocchi.filter((b): b is Extract<Blocco, { tipo: 'coppie' }> => b.tipo === 'coppie');
    expect(coppie[0].righe.map((r) => r[0])).toEqual(['Ragione sociale', 'Partita IVA', 'Sede']);
    expect(coppie[1].righe).toEqual([
      ['Mezzo', 'Gru a torre di prova (Gru a torre), 1 x 50.000,00 euro'],
      ['Fornitore', 'Manc S.r.l.'],
      ['Importo, IVA esclusa', '50.000,00 euro'],
    ]);
  });

  it('piu\' beni: una riga per bene, numerate', () => {
    const c = calcolo({ beni: [bene('Gru a torre', 30_000, { quantita: 2 }), bene('Autogru', 20_000)] });
    const l = contenutoLeasingMezzi(c, K, 'BG-11', 'B', OGGI)!;
    const coppie = l.blocchi.filter((b): b is Extract<Blocco, { tipo: 'coppie' }> => b.tipo === 'coppie')[1];
    expect(coppie.righe.map((r) => r[0])).toEqual(['Mezzo 1', 'Mezzo 2', 'Fornitore', 'Importo, IVA esclusa']);
    expect(coppie.righe[0][1]).toBe('Gru a torre di prova (Gru a torre), 2 x 30.000,00 euro');
    expect(coppie.righe[3][1]).toBe('80.000,00 euro');
  });

  it('la tabella ha le righe del solo partner chiesto', () => {
    for (const chiave of ['A', 'B', 'C']) {
      const colonna = CAL_GRU.leasing[chiave.charCodeAt(0) - 65];
      const l = contenutoLeasingMezzi(CAL_GRU, K, 'BG-12', chiave, OGGI)!;
      const t = tabelle(l)[0];
      expect(t.intestazioni).toEqual(['Durata', 'Anticipo', 'Rate mensili', 'Riscatto', 'Spese', 'Totale']);
      expect(t.righe.map((r) => r[0])).toEqual(colonna.righe.map((r) => `${r.durata} mesi`));
      expect(t.righe.map((r) => r[5])).toEqual(colonna.righe.map((r) => euro(r.totale)));
    }
    // I tre partner hanno rate diverse: la colonna A non porta quelle della C
    const rateA = tabelle(contenutoLeasingMezzi(CAL_GRU, K, 'BG-12', 'A', OGGI)!)[0].righe.map((r) => r[2]);
    const rateC = tabelle(contenutoLeasingMezzi(CAL_GRU, K, 'BG-12', 'C', OGGI)!)[0].righe.map((r) => r[2]);
    expect(rateA).not.toEqual(rateC);
  });

  it('anticipo, rate, riscatto, spese accorpate e totale di ogni riga', () => {
    const colonna = CAL_GRU.leasing[0];
    const t = tabelle(d)[0];
    const r = colonna.righe[0];
    const spese = Math.round((r.speseIstruttoria + r.speseIncassoRata * r.numRate) * 100) / 100;
    expect(t.righe[0]).toEqual([
      `${r.durata} mesi`,
      `${euro(r.anticipo)} (${euro(r.anticipoPerc, 0)}%)`,
      `${r.numRate} x ${euro(r.rata)}`,
      `${euro(r.riscatto)} (${euro(r.riscattoPerc, 0)}%)`,
      euro(spese),
      euro(r.totale),
    ]);
    // Le spese sono una voce sola: ne' istruttoria ne' incasso separati
    expect(JSON.stringify(d)).not.toMatch(/istruttoria \(|euro a rata/i);
  });

  it('il testo fisso sul primo mese, sulle spese e sulla rata indicativa', () => {
    expect(testi(d)).toContain(
      "Il primo mese è l'anticipo. Le spese comprendono istruttoria e incasso delle rate. Importi IVA esclusa. " +
        'La rata è indicativa: quella definitiva sarà assegnata in base al rating di merito creditizio del cliente, ' +
        'una volta esaminata la documentazione.',
    );
  });

  it('una chiave che non c\'e\' non da\' il documento', () => {
    for (const chiave of ['D', 'Z', '', 'a', 'AA', 'sella', 'alba']) {
      expect(contenutoLeasingMezzi(CAL_GRU, K, 'BG-13', chiave, OGGI), chiave).toBeNull();
    }
  });

  it('un partner senza righe (importo sotto il suo minimo) non da\' il documento, gli altri si', () => {
    const piccola = calcolo({ beni: [bene('Gru a torre', 6_000)] });
    expect(piccola.leasing[0].righe).toHaveLength(0); // Sella parte da 9.000
    expect(chiaveColonna(0)).toBe('A');
    expect(contenutoLeasingMezzi(piccola, K, 'BG-14', 'A', OGGI)).toBeNull();
    expect(contenutoLeasingMezzi(piccola, K, 'BG-14', 'B', OGGI)).not.toBeNull();
  });

  it('in simulazione il cliente non c\'e\': nessun documento', () => {
    expect(contenutoLeasingMezzi(calcolo(GRU, null), K, 'BG-15', 'A', OGGI)).toBeNull();
  });
});

// --- riservatezza e dimostrativi ---------------------------------------------

describe('i documenti al cliente non nominano locatori, tassi o canali', () => {
  const casi: [string, CalcoloMezzi, Carrozzeria][] = [
    ['gru su Grenke', CAL_GRU, K],
    ['carrello su Econocom', CAL_CARRELLO, K],
    ['autogru senza noleggio', CAL_AUTOGRU, K],
    ['gru con la nota dimostrativa', calcolo(GRU, ricerca(), KDEMO), KDEMO],
  ];

  for (const [nome, c, k] of casi) {
    it(nome, () => {
      const documenti = [
        contenutoNoleggioMezzi(c, k, 'BG-20', AGENTE, OGGI),
        ...['A', 'B', 'C'].map((chiave) => contenutoLeasingMezzi(c, k, 'BG-20', chiave, OGGI)),
      ].filter((x): x is Documento => x !== null);
      expect(documenti.length).toBeGreaterThan(0);
      for (const doc of documenti) {
        const serializzato = JSON.stringify(doc).toLowerCase();
        for (const parola of VIETATE) expect(serializzato, `${doc.filename}: ${parola}`).not.toContain(parola);
      }
    });
  }
});

describe('fornitore dimostrativo', () => {
  it('la nota dimostrativa e\' su entrambi i documenti', () => {
    const c = calcolo(GRU, ricerca(), KDEMO);
    expect(contenutoNoleggioMezzi(c, KDEMO, 'BG-30', AGENTE, OGGI)!.notaDemo).toBe(NOTA_DEMO_PDF);
    expect(contenutoLeasingMezzi(c, KDEMO, 'BG-30', 'A', OGGI)!.notaDemo).toBe(NOTA_DEMO_PDF);
  });
});

// --- PDF disegnati -----------------------------------------------------------

describe('documentiMezzi', () => {
  const pdf = (b64: string) => Buffer.from(b64, 'base64').subarray(0, 5).toString();

  it('noleggio e leasing del partner scelto, e sono PDF', () => {
    const due = documentiMezzi(CAL_GRU, K, 'BG-40', 'C', AGENTE, OGGI);
    expect(due.map((f) => f.filename)).toEqual(['preventivo-noleggio-BG-40.pdf', 'prospetto-leasing-BG-40.pdf']);
    for (const f of due) expect(pdf(f.contenuto)).toBe('%PDF-');
  });

  it('senza partner scelto resta il solo noleggio', () => {
    const uno = documentiMezzi(CAL_GRU, K, 'BG-41', null, AGENTE, OGGI);
    expect(uno.map((f) => f.filename)).toEqual(['preventivo-noleggio-BG-41.pdf']);
  });

  it('senza noleggio e senza partner non c\'e\' niente', () => {
    expect(documentiMezzi(CAL_AUTOGRU, K, 'BG-42', null, AGENTE, OGGI)).toEqual([]);
  });

  it('senza noleggio, col partner scelto, esce il solo leasing', () => {
    const solo = documentiMezzi(CAL_AUTOGRU, K, 'BG-43', 'B', AGENTE, OGGI);
    expect(solo.map((f) => f.filename)).toEqual(['prospetto-leasing-BG-43.pdf']);
    expect(pdf(solo[0].contenuto)).toBe('%PDF-');
  });

  it('una chiave che non c\'e\' non produce il leasing e non rompe il noleggio', () => {
    const uno = documentiMezzi(CAL_GRU, K, 'BG-44', 'Z', AGENTE, OGGI);
    expect(uno.map((f) => f.filename)).toEqual(['preventivo-noleggio-BG-44.pdf']);
  });

  it('con tre beni lunghi il documento va a capo e resta un PDF', () => {
    const lunga = 'Piattaforma di lavoro aerea articolata su camion, altezza di lavoro 32 metri, portata 250 kg, con cestello';
    const c = calcolo({ beni: [1, 2, 3].map((n) => bene('Gru a torre', 10_000 * n, { descrizione: `${lunga} ${n}` })) });
    const docs = documentiMezzi(c, K, 'BG-45', 'A', AGENTE, OGGI);
    expect(docs).toHaveLength(2);
    for (const f of docs) expect(pdf(f.contenuto)).toBe('%PDF-');
  });
});
