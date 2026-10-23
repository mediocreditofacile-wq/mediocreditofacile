// Il preventivo del settore mezzi (Bergamelli): la riga in app.proposta, i PDF nella sua
// cartella, la mail a MCF e la risposta di /api/motore/preventivo.
//
// Database, Blob e mail sono finti: qui si prova cosa si scrive e dove, non le
// connessioni. I numeri vengono dal calcolo vero (componiMezzi) su una carrozzeria nata
// da una riga finta, come in calcolo-mezzi.test.ts; i PDF sono quelli veri di
// pdf-mezzi. I punti che contano: la mail a MCF nomina canale, partner, spread e
// provvigione; la riga salvata e la risposta all'agente no.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const pv = vi.hoisted(() => ({ salvaPdf: vi.fn() }));
const posta = vi.hoisted(() => ({ inviaMail: vi.fn() }));
const lettura = vi.hoisted(() => ({
  sessioneMotore: vi.fn(),
  calcolaMezzi: vi.fn(),
  calcolaProposta: vi.fn(),
  calcolaDistinta: vi.fn(),
  generaPreventivoMotore: vi.fn(),
  generaPreventivoDistinta: vi.fn(),
}));
vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));
vi.mock('../preventivi-pv', () => ({ salvaPdf: pv.salvaPdf }));
vi.mock('../mail-portale', async (originale) => ({
  ...(await originale<typeof import('../mail-portale')>()),
  inviaMail: posta.inviaMail,
}));
// La sessione e' finta (l'autorizzazione ha i suoi test); generaId e json restano veri
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: lettura.sessioneMotore,
}));
// Del calcolo si sostituisce solo la lettura dal database: il resto e' quello vero
vi.mock('./calcolo-mezzi', async (originale) => ({
  ...(await originale<typeof import('./calcolo-mezzi')>()),
  calcolaMezzi: lettura.calcolaMezzi,
}));
vi.mock('./calcolo-proposta', async (originale) => ({
  ...(await originale<typeof import('./calcolo-proposta')>()),
  calcolaProposta: lettura.calcolaProposta,
}));
vi.mock('./registro-ricerca', () => ({ completaRicerca: vi.fn() }));
vi.mock('./calcolo-distinta', () => ({ calcolaDistinta: lettura.calcolaDistinta }));
vi.mock('./preventivo', () => ({ generaPreventivoMotore: lettura.generaPreventivoMotore }));
vi.mock('./preventivo-distinta', () => ({ generaPreventivoDistinta: lettura.generaPreventivoDistinta }));

import { EURIBOR_3M } from '../../data/leasing';
import { POST as preventivo } from '../../pages/api/motore/preventivo';
import { chiaveColonna, componiMezzi, mezziPerSchermo, type CalcoloMezzi } from './calcolo-mezzi';
import type { RicercaSalvata } from './calcolo-proposta';
import { carrozzeriaDaRiga, type Carrozzeria, type RigaCarrozzeria } from './carrozzeria';
import type { EventiRicerca } from './eventi-stato';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import {
  chiavePerPdf,
  condizioniUsate,
  corpoMailMezzi,
  datiPropostaMezzi,
  descrizioneMezzi,
  generaPreventivoMezzi,
  numeriPropostaMezzi,
} from './preventivo-mezzi';

// "Oggi" in ora locale, come nei test dell'instradamento
const OGGI = new Date(2026, 9, 23);

// --- la carrozzeria: Bergamelli, come la scrive il seed ----------------------

const CANALI = [
  { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000, venditori: ['nolsystem'] },
  { canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0, venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true },
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
    { nome: 'Attrezzature', targato: false },
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

const RIGA: RigaCarrozzeria = {
  slug: 'bergamelli', nome: 'Bergamelli', citta: 'Brescia', prefisso: 'BG', organization_id: 'org-bg',
  tabella_canoni: 'sputnik', brand_logo: null, brand_colore: null, brand_accento: null, attivo: true,
  settore: 'mezzi', etichetta_bene: 'Mezzo', partner_leasing: 'alba', soglia_leasing: '0', tetto_mese_euro: '30',
  demo: false, documenti_extra: [], tabella_alternativa: null, regole_semaforo: 'locatore', leasing: true,
  prezzo_verifica: null, canali: CANALI, mezzi: MEZZI,
};

const bergamelli = (cambi: Partial<RigaCarrozzeria> = {}): Carrozzeria => carrozzeriaDaRiga({ ...RIGA, ...cambi });
const K = bergamelli();
const KSENZANOMI = bergamelli({ mezzi: { ...MEZZI, mostraNomiPartner: false } });

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

const EVENTI = (stato: EventiRicerca['stato']): EventiRicerca => ({
  stato, id: 'ev-1', avviata: null, chiusa: null, codice: '01234567890', daRegistro: true, mail: 'non-serve',
});

const ricerca = (fatturato = 1_000_000, stato: EventiRicerca['stato'] = 'assenti'): RicercaSalvata => ({
  id: 'r-1',
  piva: '01234567890',
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: { ...DATI, fatturato }, scheda: { ...SCHEDA, fatturato } },
  eventi: EVENTI(stato),
  segnali: null,
});

// --- i beni ------------------------------------------------------------------

const bene = (categoria: string, prezzo: number, extra: Record<string, unknown> = {}) => ({
  descrizione: `${categoria} di prova`, categoria, quantita: 1, prezzo, ...extra,
});

const GRU = { beni: [bene('Gru a torre', 50_000)] };
const CARRELLO = { beni: [bene('Carrelli elevatori', 200_000)] };
const AUTOGRU = { beni: [bene('Autogru', 80_000)] };

function calcolo(
  corpo: Record<string, unknown>,
  r: RicercaSalvata | null = ricerca(),
  k: Carrozzeria = K,
): CalcoloMezzi {
  const esito = componiMezzi(r, k, corpo, OGGI);
  if (!esito.ok) throw new Error(`mezzi rifiutati: ${esito.error}`);
  return esito.calcolo;
}

/** La rata di una colonna a una durata, letta dal calcolo */
const rataA = (c: CalcoloMezzi, chiave: string, durata: number) => {
  const colonna = c.leasing[chiave.charCodeAt(0) - 65];
  return colonna.righe.find((r) => r.durata === durata)!.rata;
};

// --- chiavePerPdf ------------------------------------------------------------

describe('chiavePerPdf: la colonna del leasing che finisce nel PDF', () => {
  const c = calcolo(GRU);

  it('la chiave chiesta, se quella colonna ha righe', () => {
    for (const chiave of ['A', 'B', 'C']) expect(chiavePerPdf(c, chiave)).toBe(chiave);
  });

  it('la colonna senza righe chiesta si ignora: si sceglie fra quelle che hanno righe', () => {
    // 8.000 euro: Sella (minimo 9.000) non quota, restano Credem e Alba
    const sotto = calcolo({ beni: [bene('Attrezzature', 8_000)] });
    expect(sotto.leasing[0].righe).toEqual([]);
    const scelta = chiavePerPdf(sotto, 'A');
    expect(scelta).not.toBe('A');
    expect(['B', 'C']).toContain(scelta);
    // E' la piu' economica delle due a 60 mesi
    const piuBassa = rataA(sotto, 'B', 60) <= rataA(sotto, 'C', 60) ? 'B' : 'C';
    expect(scelta).toBe(piuBassa);
  });

  it('una chiave che non esiste o non e\' testo si ignora, come l\'assenza', () => {
    const predefinita = chiavePerPdf(c, undefined);
    for (const richiesta of ['D', 'a', '', 'AA', 'sella', 'alba', ' A', 5, null, true, {}, ['A']]) {
      expect(chiavePerPdf(c, richiesta), String(richiesta)).toBe(predefinita);
    }
  });

  it('senza chiave: la rata piu\' bassa a 60 mesi', () => {
    const attesa = ['A', 'B', 'C'].reduce((meglio, k) => (rataA(c, k, 60) < rataA(c, meglio, 60) ? k : meglio));
    expect(chiavePerPdf(c, undefined)).toBe(attesa);
  });

  // I numeri della spec valgono solo con l'Euribor di quel giorno, come in leasing-confronto.test.ts
  it.runIf(EURIBOR_3M === 2.66)('50.000 euro: Alba, 857,72 a 60 mesi contro 862,07 di Sella e 880,63 di Credem', () => {
    expect([rataA(c, 'A', 60), rataA(c, 'B', 60), rataA(c, 'C', 60)]).toEqual([862.07, 880.63, 857.72]);
    // La configurazione ha Alba al terzo posto: e' la colonna C
    expect(K.mezzi?.leasing.partner[2].partner).toBe('alba');
    expect(chiavePerPdf(c, undefined)).toBe('C');
  });

  it('se tutte quotano 60 mesi conta il 60, anche se a 84 vincerebbe un\'altra colonna', () => {
    const lungo = structuredClone(c);
    // A 84 mesi la colonna A diventa la piu' economica per davvero (rata 1): a 60 resta quella di prima
    lungo.leasing[0].righe = lungo.leasing[0].righe.map((r) => (r.durata === 84 ? { ...r, rata: 1 } : r));
    expect(chiavePerPdf(lungo, undefined)).toBe(chiavePerPdf(c, undefined));
    expect(chiavePerPdf(lungo, undefined)).not.toBe('A');
  });

  it('se una colonna non quota 60 mesi si confronta alla durata piu\' lunga che hanno tutte', () => {
    const monco = structuredClone(c);
    // La colonna A arriva solo a 48 mesi, e a 48 e' la piu' economica per davvero (rata 1)
    monco.leasing[0].righe = monco.leasing[0].righe
      .filter((r) => r.durata <= 48)
      .map((r) => (r.durata === 48 ? { ...r, rata: 1 } : r));
    expect(monco.leasing[1].righe.some((r) => r.durata === 60)).toBe(true);
    expect(chiavePerPdf(monco, undefined)).toBe('A');
    // Chiedere a 60 mesi darebbe un'altra colonna: la durata comune non e' 60
    expect(chiavePerPdf(c, undefined)).not.toBe('A');
  });

  it('a parita\' di rata resta la prima colonna nell\'ordine della configurazione', () => {
    const pari = structuredClone(c);
    pari.leasing[1].righe = structuredClone(pari.leasing[0].righe);
    pari.leasing[2].righe = structuredClone(pari.leasing[0].righe);
    expect(chiavePerPdf(pari, undefined)).toBe('A');

    // Pareggio fra B e C, piu' basso di A: vince B
    const secondo = structuredClone(c);
    secondo.leasing[0].righe = secondo.leasing[0].righe.map((r) => ({ ...r, rata: r.rata + 1000 }));
    secondo.leasing[2].righe = structuredClone(secondo.leasing[1].righe);
    expect(chiavePerPdf(secondo, undefined)).toBe('B');
  });

  it('nessuna durata in comune: la prima colonna che ha righe', () => {
    const senza = structuredClone(c);
    senza.leasing[0].righe = senza.leasing[0].righe.filter((r) => r.durata === 36);
    senza.leasing[1].righe = senza.leasing[1].righe.filter((r) => r.durata === 84);
    senza.leasing[2].righe = [];
    expect(chiavePerPdf(senza, undefined)).toBe('A');
    senza.leasing[0].righe = [];
    expect(chiavePerPdf(senza, undefined)).toBe('B');
  });

  it('nessun leasing: null, anche se l\'agente ne chiede uno', () => {
    // 1.000 euro: sotto il minimo di tutti e tre i partner
    const niente = calcolo({ beni: [bene('Attrezzature', 1_000)] });
    expect(niente.leasing.every((l) => l.righe.length === 0)).toBe(true);
    expect(chiavePerPdf(niente, undefined)).toBeNull();
    expect(chiavePerPdf(niente, 'A')).toBeNull();
  });
});

// --- le forme salvate --------------------------------------------------------

describe('descrizioneMezzi', () => {
  it('le descrizioni dei beni, separate da " + "', () => {
    const c2 = calcolo({ beni: [bene('Gru a torre', 50_000), bene('Attrezzature', 10_000)] });
    expect(descrizioneMezzi(c2.beni)).toBe('Gru a torre di prova + Attrezzature di prova');
  });

  it('tagliata a 300 caratteri', () => {
    const lunga = 'x'.repeat(190);
    const c2 = calcolo({ beni: [
      { ...bene('Gru a torre', 50_000), descrizione: lunga },
      { ...bene('Gru a torre', 50_000), descrizione: lunga },
    ] });
    expect(descrizioneMezzi(c2.beni)).toHaveLength(300);
  });
});

describe('datiPropostaMezzi e numeriPropostaMezzi', () => {
  const c = calcolo(GRU);

  it('dati: beni, venditore, anticipo, colonna del PDF e il partner di ogni colonna', () => {
    const dati = datiPropostaMezzi(c, 'B');
    expect(Object.keys(dati).sort()).toEqual(['anticipoPerc', 'beni', 'chiaveLeasing', 'partner', 'venditore']);
    expect(dati.venditore).toBe('manc');
    expect(dati.anticipoPerc).toBe(10);
    expect(dati.chiaveLeasing).toBe('B');
    expect(dati.partner).toEqual({ A: 'sella', B: 'credem', C: 'alba' });
    expect(dati.beni).toEqual(c.beni);
  });

  it('dati: senza colonna scelta la chiave e\' null, e la mappa dei partner c\'e\' lo stesso', () => {
    const dati = datiPropostaMezzi(c, null);
    expect(dati.chiaveLeasing).toBeNull();
    expect(dati.partner).toEqual({ A: 'sella', B: 'credem', C: 'alba' });
  });

  it('numeri: lo schermo, con i nomi che la configurazione consente', () => {
    expect(numeriPropostaMezzi(c, K)).toEqual(mezziPerSchermo(c, true));
    const senza = calcolo(GRU, ricerca(), KSENZANOMI);
    expect(numeriPropostaMezzi(senza, KSENZANOMI)).toEqual(mezziPerSchermo(senza, false));
  });

  it('numeri: con i nomi spenti nessun nome di partner, nemmeno nella chiave', () => {
    const senza = calcolo(GRU, ricerca(), KSENZANOMI);
    const testo = JSON.stringify(numeriPropostaMezzi(senza, KSENZANOMI)).toLowerCase();
    for (const v of ['sella', 'credem', 'alba']) expect(testo).not.toContain(v);
  });

  it('numeri: con una carrozzeria senza configurazione mezzi i nomi sono spenti', () => {
    const senzaConfig = bergamelli({ mezzi: null });
    expect(numeriPropostaMezzi(c, senzaConfig)).toEqual(mezziPerSchermo(c, false));
  });
});

// --- spread e provvigione ----------------------------------------------------

describe('condizioniUsate: spread e provvigione per gruppo di durate', () => {
  const c = calcolo(GRU);

  it('Alba cambia spread e provvigione al confine dei 48 mesi', () => {
    const alba = condizioniUsate(K, c.leasing[2], c.totale);
    expect(alba).toHaveLength(2);
    expect(alba[0]).toMatchObject({ durate: [36, 48], spread: 3.1 });
    expect(alba[1]).toMatchObject({ durate: [60, 72, 84], spread: 2.5 });
    // Provvigione in percentuale dell'importo: 0,93% fino a 48 mesi, 1,50% da 60 (spec, sezione 5)
    expect(alba[0].provvigionePerc).toBeCloseTo(0.93, 2);
    expect(alba[1].provvigionePerc).toBeCloseTo(1.5, 2);
  });

  it('Sella e Credem hanno una condizione sola su tutte le durate', () => {
    const sella = condizioniUsate(K, c.leasing[0], c.totale);
    expect(sella).toHaveLength(1);
    expect(sella[0]).toMatchObject({ durate: [36, 48, 60, 72, 84], spread: 2.25 });
    expect(sella[0].provvigionePerc).toBeCloseTo(1, 2);
    const credem = condizioniUsate(K, c.leasing[1], c.totale);
    expect(credem).toHaveLength(1);
    expect(credem[0]).toMatchObject({ spread: 2.9 });
    expect(credem[0].provvigionePerc).toBeCloseTo(1.5, 2);
  });

  it('un partner senza righe non ha condizioni da mostrare', () => {
    const sotto = calcolo({ beni: [bene('Attrezzature', 8_000)] });
    expect(condizioniUsate(K, sotto.leasing[0], sotto.totale)).toEqual([]);
  });
});

// --- la mail a MCF -----------------------------------------------------------

const AGENTE = { nome: 'Gino Agente', email: 'agente@example.it' };

const mail = (c: CalcoloMezzi, chiave: string | null, avviso: string | null = null, k: Carrozzeria = K) =>
  corpoMailMezzi({ k, agente: AGENTE, c, id: 'BG-20261023-101500', chiave, avviso });

describe('corpoMailMezzi: la mail e\' per MCF, dove i nomi ci vanno', () => {
  it('l\'oggetto: portale, venditore, agente, cliente e totale', () => {
    const { subject } = mail(calcolo(GRU), 'C');
    expect(subject).toBe('Preventivo Bergamelli — Manc S.r.l. — Gino Agente — EDILE ALFA S.R.L. — 50.000 euro');
  });

  it('senza nome dell\'agente nell\'oggetto c\'e\' la sua email; con i centesimi si scrivono', () => {
    const c = calcolo({ beni: [bene('Gru a torre', 50_000.5)] });
    const { subject } = corpoMailMezzi({ k: K, agente: { nome: '', email: 'agente@example.it' }, c, id: 'BG-1', chiave: null, avviso: null });
    expect(subject).toContain('agente@example.it');
    expect(subject).toMatch(/50\.000,50 euro$/);
  });

  it('il noleggio col nome del canale e le rate; il leasing per partner con nome, spread e provvigione', () => {
    const c = calcolo(GRU);
    const { html } = mail(c, 'C');
    expect(html).toContain('Grenke');
    for (const r of c.noleggio!.rate) expect(html).toContain(`${r.durata} mesi`);
    for (const nome of ['Sella Leasing', 'Credem Leasing', 'Alba Leasing']) expect(html).toContain(nome);
    for (const spread of ['2,25%', '2,90%', '3,10%', '2,50%']) expect(html).toContain(spread);
    for (const provvigione of ['1,00%', '1,50%', '0,93%']) expect(html).toContain(provvigione);
    expect(html).toContain('spread');
    expect(html).toContain('provvigione');
  });

  it('il partner messo nel PDF e\' indicato', () => {
    const c = calcolo(GRU);
    expect(mail(c, 'C').html).toContain('Alba Leasing (colonna C)');
    expect(mail(c, 'A').html).toContain('Sella Leasing (colonna A)');
    // Nessun partner nel PDF: lo dice
    const { html } = mail(c, null);
    expect(html).toContain('nessun partner');
  });

  it('Econocom: il canale col suo nome e la rata da confermare', () => {
    const c = calcolo(CARRELLO, ricerca(6_000_000));
    const { html } = mail(c, 'A');
    expect(html).toContain('Econocom');
    expect(html).toContain('da confermare');
    expect(html).toContain('NOL SYSTEM ITALIA SRL');
  });

  it('senza noleggio: il motivo, e nessun canale', () => {
    const c = calcolo(AUTOGRU);
    const { html } = mail(c, 'A');
    expect(html).toContain('Mezzo targato: noleggio su richiesta a Mediocredito Facile.');
    expect(html).not.toContain('Grenke');
  });

  it('un partner senza righe porta il motivo', () => {
    const c = calcolo({ beni: [bene('Attrezzature', 8_000)] });
    expect(mail(c, 'B').html).toContain('Importo fuori dai limiti di questo partner.');
  });

  it('i beni, il venditore e il semaforo del locatore', () => {
    const c = calcolo(GRU, ricerca(1_000_000, 'presenti'));
    const { html } = mail(c, 'C');
    expect(html).toContain('Gru a torre di prova');
    expect(html).toContain('Manc S.r.l.');
    expect(html).toContain(c.valutazione!.locatore!.etichetta);
    expect(html).toContain('rosso');
    expect(html).toContain('01234567890');
  });

  it('con i nomi dei partner spenti per l\'agente la mail a MCF li porta lo stesso', () => {
    const c = calcolo(GRU, ricerca(), KSENZANOMI);
    const { html } = mail(c, 'A', null, KSENZANOMI);
    expect(html).toContain('Sella Leasing');
    expect(html).toContain('Grenke');
  });

  it('l\'avviso si stampa solo se c\'e\', e il testo e\' protetto', () => {
    const c = calcolo(GRU);
    expect(mail(c, 'C').html).not.toContain('sono usciti');
    expect(mail(c, 'C', 'I PDF <non> sono usciti').html).toContain('I PDF &lt;non&gt; sono usciti');
  });
});

// --- generaPreventivoMezzi ---------------------------------------------------

const CONTESTO = {
  userId: 'u-agente', email: 'agente@example.it', nome: 'Gino Agente', ruolo: 'agente',
  organizationId: 'org-bg', fornitoreSlug: 'bergamelli', fornitoreNome: 'Bergamelli', fornitoreCitta: null,
  tabellaCanoni: null, prefisso: 'BG', brandLogo: null, brandColore: null, brandAccento: null,
};

const sessione = (k: Carrozzeria = K) =>
  ({ ok: true, contesto: CONTESTO, carrozzeria: k, vedeTutto: false }) as unknown as Parameters<typeof generaPreventivoMezzi>[0];

/** Quello che l'agente non deve mai leggere nella risposta */
const RISERVATO = /sella|credem|alba|grenke|econocom|sputnik|spread|provvig|tasso|canale|coeff/i;

describe('generaPreventivoMezzi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockImplementation(async (sql: string, valori: unknown[]) =>
      sql.trim().startsWith('INSERT') ? [{ id: valori[0] }] : []);
    pv.salvaPdf.mockImplementation(async (slug: string, id: string, pdf: { filename: string; contenuto: string }[]) =>
      pdf.map((f) => ({ nome: f.filename, pathname: `preventivi/${slug}/${id}/${f.filename}`, size: 10 })));
    posta.inviaMail.mockResolvedValue({ ok: true, id: 'm-1' });
  });

  const insert = () => db.query.mock.calls.find(([sql]) => String(sql).trim().startsWith('INSERT'))!;
  const update = () => db.query.mock.calls.find(([sql]) => String(sql).trim().startsWith('UPDATE'))!;

  it('senza ricerca (una simulazione) non si salva niente: ricerca_non_trovata', async () => {
    const simulato = calcolo(GRU, null);
    expect(await generaPreventivoMezzi(sessione(), simulato, GRU)).toEqual({ ok: false, error: 'ricerca_non_trovata' });
    expect(db.query).not.toHaveBeenCalled();
    expect(pv.salvaPdf).not.toHaveBeenCalled();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  it('la riga in app.proposta: colonne del preventivo, canale a parte', async () => {
    const c = calcolo(GRU);
    const r = await generaPreventivoMezzi(sessione(), c, GRU);
    expect(r.ok).toBe(true);
    const [sql, v] = insert();
    expect(sql).toMatch(/canale/);
    expect(sql).not.toMatch(/riservato/);
    const [id, slug, org, user, ricercaId, piva, nome, voceCodice, descrizione, prezzo, semaforo, anticipo, markup, dati, numeri, canale] = v as unknown[];
    expect(id).toBe(r.id);
    expect(id).toMatch(/^BG-\d{8}-\d{6}$/);
    expect([slug, org, user, ricercaId, piva, nome]).toEqual(['bergamelli', 'org-bg', 'u-agente', 'r-1', '01234567890', 'EDILE ALFA S.R.L.']);
    expect(voceCodice).toBeNull();
    expect(descrizione).toBe('Gru a torre di prova');
    expect([prezzo, semaforo, anticipo, markup]).toEqual([50_000, c.valutazione!.semaforo, 10, 0]);
    expect(JSON.parse(String(dati))).toEqual(JSON.parse(JSON.stringify(datiPropostaMezzi(c, chiavePerPdf(c, undefined)))));
    expect(JSON.parse(String(numeri))).toEqual(JSON.parse(JSON.stringify(mezziPerSchermo(c, true))));
    expect(canale).toBe('grenke');
  });

  it('il canale: Econocom per il carrello da Nol System, null quando il noleggio non c\'e\'', async () => {
    await generaPreventivoMezzi(sessione(), calcolo(CARRELLO, ricerca(6_000_000)), CARRELLO);
    expect(insert()[1][15]).toBe('econocom');
    db.query.mockClear();
    await generaPreventivoMezzi(sessione(), calcolo(AUTOGRU), AUTOGRU);
    expect(insert()[1][15]).toBeNull();
  });

  it('la colonna chiesta dall\'agente va in dati e nel PDF; senza richiesta la piu\' economica a 60 mesi', async () => {
    const c = calcolo(GRU);
    await generaPreventivoMezzi(sessione(), c, { ...GRU, leasingPdf: 'B' });
    expect(JSON.parse(String(insert()[1][13])).chiaveLeasing).toBe('B');
    db.query.mockClear();
    await generaPreventivoMezzi(sessione(), c, GRU);
    expect(JSON.parse(String(insert()[1][13])).chiaveLeasing).toBe(chiavePerPdf(c, undefined));
    // Una chiave che non regge si ignora: non resta scritta com'e'
    db.query.mockClear();
    await generaPreventivoMezzi(sessione(), c, { ...GRU, leasingPdf: 'sella' });
    expect(JSON.parse(String(insert()[1][13])).chiaveLeasing).toBe(chiavePerPdf(c, undefined));
  });

  it('la mappa colonna -> partner sta solo in dati; i numeri con i nomi spenti non nominano nessuno', async () => {
    const c = calcolo(GRU, ricerca(), KSENZANOMI);
    await generaPreventivoMezzi(sessione(KSENZANOMI), c, GRU);
    const [, v] = insert();
    expect(JSON.parse(String(v[13])).partner).toEqual({ A: 'sella', B: 'credem', C: 'alba' });
    const numeri = String(v[14]).toLowerCase();
    for (const nome of ['sella', 'credem', 'alba']) expect(numeri).not.toContain(nome);
  });

  it('i PDF nella cartella della proposta: il noleggio e il leasing del partner scelto', async () => {
    const c = calcolo(GRU);
    const r = await generaPreventivoMezzi(sessione(), c, GRU);
    const [slug, id, pdf] = pv.salvaPdf.mock.calls[0];
    expect([slug, id]).toEqual(['bergamelli', r.id]);
    expect(pdf.map((f: { filename: string }) => f.filename)).toEqual([`preventivo-noleggio-${r.id}.pdf`, `prospetto-leasing-${r.id}.pdf`]);
    for (const f of pdf) expect(Buffer.from(f.contenuto, 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const [sqlU, vU] = update();
    expect(sqlU).toMatch(/documenti/);
    expect(sqlU).toMatch(/pdf_pronti/);
    expect(vU[0]).toBe(r.id);
    expect(JSON.parse(String(vU[1]))).toEqual([
      { nome: `preventivo-noleggio-${r.id}.pdf`, pathname: `preventivi/bergamelli/${r.id}/preventivo-noleggio-${r.id}.pdf` },
      { nome: `prospetto-leasing-${r.id}.pdf`, pathname: `preventivi/bergamelli/${r.id}/prospetto-leasing-${r.id}.pdf` },
    ]);
    expect(vU[2]).toBe(true);
  });

  it('mezzo targato: nel PDF c\'e\' solo il leasing', async () => {
    const r = await generaPreventivoMezzi(sessione(), calcolo(AUTOGRU), AUTOGRU);
    expect(r.documenti!.map((d) => d.nome)).toEqual([`prospetto-leasing-${r.id}.pdf`]);
    expect(r.pdfPronti).toBe(true);
  });

  it('la mail a MCF: oggetto, allegati e i nomi che a MCF servono', async () => {
    const c = calcolo(GRU);
    const r = await generaPreventivoMezzi(sessione(), c, GRU);
    expect(posta.inviaMail).toHaveBeenCalledTimes(1);
    const opzioni = posta.inviaMail.mock.calls[0][0];
    expect(opzioni.to).toBe('mediocreditofacile@gmail.com');
    expect(opzioni.subject).toBe('Preventivo Bergamelli — Manc S.r.l. — Gino Agente — EDILE ALFA S.R.L. — 50.000 euro');
    expect(opzioni.allegati.map((a: { filename: string }) => a.filename)).toEqual([
      `preventivo-noleggio-${r.id}.pdf`, `prospetto-leasing-${r.id}.pdf`,
    ]);
    expect(opzioni.html).toContain(r.id);
    expect(opzioni.html).toContain('Grenke');
    expect(opzioni.html).toContain('Sella Leasing');
    expect(opzioni.html).toContain('spread');
  });

  it('la risposta all\'agente: id, pdfPronti e documenti, e nessun nome riservato', async () => {
    const r = await generaPreventivoMezzi(sessione(), calcolo(GRU), GRU);
    expect(Object.keys(r).sort()).toEqual(['documenti', 'id', 'ok', 'pdfPronti']);
    expect(r.pdfPronti).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(RISERVATO);
  });

  it('il rosso non blocca: la riga si salva col semaforo rosso, i PDF e la mail escono', async () => {
    const c = calcolo(GRU, ricerca(1_000_000, 'presenti'));
    const r = await generaPreventivoMezzi(sessione(), c, GRU);
    expect(r.ok).toBe(true);
    expect(r.pdfPronti).toBe(true);
    expect(insert()[1][10]).toBe('rosso');
    expect(posta.inviaMail.mock.calls[0][0].allegati).toHaveLength(2);
  });

  it('nessun PDF possibile: la proposta si salva, la mail lo dice', async () => {
    // 1.000 euro di attrezzature: nessun noleggio (Grenke e' di manc, qui firma nolsystem) e nessun partner quota
    const poco = { beni: [bene('Attrezzature', 1_000)] };
    const r = await generaPreventivoMezzi(sessione(), calcolo(poco), poco);
    expect(r.ok).toBe(true);
    expect(r.pdfPronti).toBe(false);
    expect(r.documenti).toEqual([]);
    expect(pv.salvaPdf).not.toHaveBeenCalled();
    const opzioni = posta.inviaMail.mock.calls[0][0];
    expect(opzioni.allegati).toEqual([]);
    expect(opzioni.html).toMatch(/Nessun PDF/);
  });

  it('un PDF non si salva: pdf_pronti falso, gli allegati restano tutti, la mail lo dice', async () => {
    pv.salvaPdf.mockImplementationOnce(async (slug: string, id: string, pdf: { filename: string }[]) =>
      [{ nome: pdf[0].filename, pathname: `preventivi/${slug}/${id}/${pdf[0].filename}`, size: 10 }]);
    const r = await generaPreventivoMezzi(sessione(), calcolo(GRU), GRU);
    expect(r.ok).toBe(true);
    expect(r.pdfPronti).toBe(false);
    expect(r.documenti).toHaveLength(1);
    expect(update()[1][2]).toBe(false);
    const opzioni = posta.inviaMail.mock.calls[0][0];
    expect(opzioni.allegati).toHaveLength(2);
    expect(opzioni.html).toMatch(/non si sono salvati/);
  });

  it('id gia\' preso: si aggiunge un suffisso, come sugli altri settori', async () => {
    let primo = true;
    db.query.mockImplementation(async (sql: string, valori: unknown[]) => {
      if (!sql.trim().startsWith('INSERT')) return [];
      if (primo) { primo = false; return []; }
      return [{ id: valori[0] }];
    });
    const r = await generaPreventivoMezzi(sessione(), calcolo(GRU), GRU);
    expect(r.id).toMatch(/^BG-\d{8}-\d{6}-2$/);
  });

  it('quattro id occupati di fila: l\'errore sale, niente PDF e niente mail', async () => {
    db.query.mockImplementation(async () => []);
    await expect(generaPreventivoMezzi(sessione(), calcolo(GRU), GRU)).rejects.toThrow('id_proposta_occupato');
    expect(pv.salvaPdf).not.toHaveBeenCalled();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  it('il log dice cosa e\' successo, senza nomi di partner', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await generaPreventivoMezzi(sessione(), calcolo(GRU), GRU);
    const riga = log.mock.calls.map(([m]) => String(m)).find((m) => m.includes('motore_preventivo_mezzi'));
    log.mockRestore();
    expect(riga).toBeDefined();
    expect(JSON.parse(riga!)).toMatchObject({
      evento: 'motore_preventivo_mezzi', fornitore: 'bergamelli', id: r.id, userId: 'u-agente', pdf_ok: true, mail_ok: true,
    });
  });
});

// --- l'API -------------------------------------------------------------------

describe('/api/motore/preventivo sul settore mezzi', () => {
  const sessioneDi = (k: Carrozzeria) => ({ ok: true, contesto: CONTESTO, carrozzeria: k, vedeTutto: false });
  const post = (corpo: Record<string, unknown>) =>
    preventivo({ request: new Request('https://www.example.it/api/motore/preventivo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    }) });

  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockImplementation(async (sql: string, valori: unknown[]) =>
      sql.trim().startsWith('INSERT') ? [{ id: valori[0] }] : []);
    pv.salvaPdf.mockImplementation(async (slug: string, id: string, pdf: { filename: string }[]) =>
      pdf.map((f) => ({ nome: f.filename, pathname: `preventivi/${slug}/${id}/${f.filename}`, size: 10 })));
    posta.inviaMail.mockResolvedValue({ ok: true, id: 'm-1' });
    lettura.sessioneMotore.mockResolvedValue(sessioneDi(K));
  });

  it('passa da calcolaMezzi e dal preventivo dei mezzi, mai da calcolaProposta', async () => {
    lettura.calcolaMezzi.mockResolvedValueOnce({ ok: true, calcolo: calcolo(GRU) });
    const r = await post({ f: 'bergamelli', ricercaId: 'r-1', ...GRU, leasingPdf: 'C' });
    expect(r.status).toBe(200);
    expect(lettura.calcolaMezzi).toHaveBeenCalledTimes(1);
    expect(lettura.calcolaProposta).not.toHaveBeenCalled();
    expect(lettura.calcolaDistinta).not.toHaveBeenCalled();
    expect(lettura.generaPreventivoMotore).not.toHaveBeenCalled();
    expect(lettura.generaPreventivoDistinta).not.toHaveBeenCalled();
    // La sessione si chiede col permesso di creare un preventivo
    expect(lettura.sessioneMotore).toHaveBeenCalledWith(expect.anything(), 'bergamelli', { permesso: { preventivo: ['crea'] } });
  });

  it('la risposta e\' { ok, id, pdfPronti, documenti }: la mail a MCF sa tutto, l\'agente niente', async () => {
    lettura.calcolaMezzi.mockResolvedValueOnce({ ok: true, calcolo: calcolo(CARRELLO, ricerca(6_000_000)) });
    const r = await post({ f: 'bergamelli', ricercaId: 'r-1', ...CARRELLO });
    expect(r.status).toBe(200);
    const testo = await r.text();
    const corpo = JSON.parse(testo);
    expect(Object.keys(corpo).sort()).toEqual(['documenti', 'id', 'ok', 'pdfPronti']);
    expect(corpo.ok).toBe(true);
    expect(corpo.id).toMatch(/^BG-/);
    expect(testo).not.toMatch(RISERVATO);
    // La stessa richiesta ha portato i nomi a MCF
    const html = String(posta.inviaMail.mock.calls[0][0].html);
    expect(html).toContain('Econocom');
    expect(html).toContain('Credem Leasing');
  });

  it('un calcolo che non regge si ferma con la sua risposta, senza salvare niente', async () => {
    lettura.calcolaMezzi.mockResolvedValueOnce({
      ok: false, risposta: new Response(JSON.stringify({ ok: false, error: 'venditore_non_valido', riga: null }), { status: 400 }),
    });
    const r = await post({ f: 'bergamelli', ricercaId: 'r-1', ...GRU, venditore: 'xyz' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'venditore_non_valido', riga: null });
    expect(db.query).not.toHaveBeenCalled();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  it('un errore del salvataggio e\' un 500 che non dice niente', async () => {
    lettura.calcolaMezzi.mockResolvedValueOnce({ ok: true, calcolo: calcolo(GRU) });
    db.query.mockImplementation(async () => { throw new Error('neon giu: sella credem'); });
    const errore = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await post({ f: 'bergamelli', ricercaId: 'r-1', ...GRU });
    errore.mockRestore();
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: 'preventivo_non_riuscito' });
  });

  it('gli altri settori restano su calcolaProposta', async () => {
    lettura.sessioneMotore.mockResolvedValue(sessioneDi(bergamelli({ settore: 'macchine' })));
    lettura.calcolaProposta.mockResolvedValueOnce({ ok: true, calcolo: {} });
    lettura.generaPreventivoMotore.mockResolvedValueOnce({ ok: true, id: 'DX-1' });
    const r = await post({ f: 'duplex', ricercaId: 'r-1', codice: 'X' });
    expect(r.status).toBe(200);
    expect(lettura.calcolaMezzi).not.toHaveBeenCalled();
    expect(lettura.calcolaProposta).toHaveBeenCalledTimes(1);
  });
});

// Il numero di colonne e' quello della configurazione: la chiave segue l'ordine
describe('chiaveColonna e la configurazione', () => {
  it('A, B, C nell\'ordine di Bergamelli: Sella, Credem, Alba', () => {
    expect(K.mezzi?.leasing.partner.map((p, i) => [chiaveColonna(i), p.partner])).toEqual([
      ['A', 'sella'], ['B', 'credem'], ['C', 'alba'],
    ]);
  });
});
