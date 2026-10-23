// Il calcolo del settore mezzi (Bergamelli): dalla ricerca salvata e dai beni
// dell'agente a noleggio, leasing a tre partner e semaforo, e da li' allo schermo.
//
// Niente database: la carrozzeria nasce da una riga finta passata per
// carrozzeriaDaRiga (cosi' il test prova anche che canali e configurazione mezzi si
// leggono), la ricerca e' un oggetto scritto qui. I punti che contano sono tre: il
// canale lo decidono venditore, categoria e targa del bene; i rifiuti sono errori e
// mai ripieghi; e verso il browser non esce nessun nome che la regola nasconde.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALBA, CREDEM, SELLA } from '../../data/leasing';
import type { RicercaSalvata } from './calcolo-proposta';
import {
  calcolaMezzi,
  chiaveColonna,
  componiMezzi,
  mezziPerSchermo,
  simulaMezzi,
  TESTO_NOLEGGIO_NON_DISPONIBILE,
  TESTO_TARGATO,
  type CalcoloMezzi,
} from './calcolo-mezzi';
import { carrozzeriaDaRiga, type Carrozzeria, type RigaCarrozzeria } from './carrozzeria';
import type { EventiRicerca } from './eventi-stato';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { POST as proposte } from '../../pages/api/motore/proposte';
import { POST as simulazione } from '../../pages/api/motore/simulazione';

// calcolaMezzi legge la ricerca dal database e la completa dal Registro: qui si
// sostituiscono con funzioni finte. Tutto il resto del calcolo e' quello vero.
const lettura = vi.hoisted(() => ({
  ricercaVisibile: vi.fn(),
  completaRicerca: vi.fn(),
  calcolaProposta: vi.fn(),
  sessioneMotore: vi.fn(),
  generaSimulazione: vi.fn(),
}));
vi.mock('./calcolo-proposta', async (originale) => ({
  ...(await originale<typeof import('./calcolo-proposta')>()),
  ricercaVisibile: lettura.ricercaVisibile,
  calcolaProposta: lettura.calcolaProposta,
}));
vi.mock('./registro-ricerca', () => ({ completaRicerca: lettura.completaRicerca }));
// Le due API: la sessione e' finta (l'autorizzazione ha i suoi test), il resto e' vero
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: lettura.sessioneMotore,
}));
vi.mock('./simulazione-distinta', async (originale) => ({
  ...(await originale<typeof import('./simulazione-distinta')>()),
  generaSimulazione: lettura.generaSimulazione,
}));

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
    { nome: 'Piattaforme aeree', targato: null },
    { nome: 'Carrelli elevatori', targato: false },
    { nome: 'Autocarri', targato: true },
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

/** Cliente con `fatturato` dato, eventi assenti salvo diversa indicazione */
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

/** Una gru a torre da 50.000 euro: manc, non targata, Grenke */
const GRU = { beni: [bene('Gru a torre', 50_000)] };
/** Un carrello elevatore da 200.000 euro: nolsystem, non targato */
const CARRELLO = { beni: [bene('Carrelli elevatori', 200_000)] };

function calcolo(
  corpo: Record<string, unknown>,
  r: RicercaSalvata | null = ricerca(),
  k: Carrozzeria = K,
): CalcoloMezzi {
  const esito = componiMezzi(r, k, corpo, OGGI);
  if (!esito.ok) throw new Error(`mezzi rifiutati: ${esito.error}`);
  return esito.calcolo;
}

const errore = (corpo: Record<string, unknown>, k: Carrozzeria = K) => {
  const esito = componiMezzi(ricerca(), k, corpo, OGGI);
  if (esito.ok) throw new Error('doveva essere rifiutato');
  return esito;
};

// --- componiMezzi ------------------------------------------------------------

describe('componiMezzi: la configurazione di Bergamelli si legge', () => {
  it('canali e configurazione mezzi arrivano dalla riga', () => {
    expect(K.settore).toBe('mezzi');
    expect(K.regoleSemaforo).toBe('locatore');
    expect(K.canali).toHaveLength(2);
    expect(K.mezzi?.venditori.map((v) => v.codice)).toEqual(['manc', 'nolsystem']);
    expect(K.mezzi?.leasing.partner.map((p) => p.partner)).toEqual(['sella', 'credem', 'alba']);
  });
});

describe('componiMezzi: i quattro casi della spec', () => {
  it('gru a torre da 50.000 e cliente da un milione: Grenke, tre colonne di leasing, venditore manc', () => {
    const c = calcolo(GRU);
    expect(c.venditore.codice).toBe('manc');
    expect(c.totale).toBe(50_000);
    expect(c.noleggio?.canale).toBe('grenke');
    expect(c.noleggio?.daConfermare).toBe(false);
    expect(c.noleggio?.rate.length).toBeGreaterThan(0);
    expect(c.motivoNoNoleggio).toBeNull();
    expect(c.leasing).toHaveLength(3);
    expect(c.leasing.every((l) => l.righe.length > 0)).toBe(true);
    expect(c.anticipoPerc).toBe(10);
    expect(c.ricerca?.id).toBe('r-1');
    expect(c.valutazione).not.toBeNull();
  });

  it('autogru targata: nessun noleggio, il testo del targato, il leasing resta', () => {
    const c = calcolo({ beni: [bene('Autogru', 80_000)] });
    expect(c.venditore.codice).toBe('manc');
    expect(c.beni[0].targato).toBe(true);
    expect(c.noleggio).toBeNull();
    expect(c.motivoNoNoleggio).toBe(TESTO_TARGATO);
    expect(c.leasing.every((l) => l.righe.length > 0)).toBe(true);
  });

  it('carrello elevatore da 200.000 e cliente da 6 milioni: nolsystem, Econocom a 36, 48 e 60, da confermare', () => {
    const c = calcolo(CARRELLO, ricerca(6_000_000));
    expect(c.venditore.codice).toBe('nolsystem');
    expect(c.noleggio?.canale).toBe('econocom');
    expect(c.noleggio?.rate.map((r) => r.durata)).toEqual([36, 48, 60]);
    expect(c.noleggio?.daConfermare).toBe(true);
    expect(c.motivoNoNoleggio).toBeNull();
    expect(c.leasing).toHaveLength(3);
  });

  it('lo stesso carrello con un cliente da 4 milioni: niente noleggio, il leasing resta', () => {
    const c = calcolo(CARRELLO, ricerca(4_000_000));
    expect(c.noleggio).toBeNull();
    expect(c.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
    expect(c.leasing.every((l) => l.righe.length > 0)).toBe(true);
  });

  it('i due testi fissi sono quelli della spec', () => {
    expect(TESTO_TARGATO).toBe('Mezzo targato: noleggio su richiesta a Mediocredito Facile.');
    expect(TESTO_NOLEGGIO_NON_DISPONIBILE).toBe('Noleggio non disponibile per questo cliente e questo bene: resta il leasing.');
  });
});

describe('componiMezzi: venditore, categorie e canali', () => {
  it('senza venditore si usa quello della categoria del primo bene', () => {
    const c = calcolo({ beni: [bene('Carrelli elevatori', 100_000), bene('Gru a torre', 100_000)] }, ricerca(6_000_000));
    expect(c.venditore.codice).toBe('nolsystem');
    expect(c.totale).toBe(200_000);
    expect(c.noleggio?.canale).toBe('econocom');
  });

  it('un venditore scelto dall\'agente vale al posto di quello della categoria', () => {
    const c = calcolo({ ...GRU, venditore: 'nolsystem' });
    expect(c.venditore.codice).toBe('nolsystem');
    // Grenke e' solo di manc e Econocom chiede 150.000: nessun canale regge
    expect(c.noleggio).toBeNull();
    expect(c.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
  });

  it('i ponteggi non vanno su Grenke nemmeno con manc', () => {
    const c = calcolo({ beni: [bene('Ponteggi', 30_000)], venditore: 'manc' });
    expect(c.venditore.codice).toBe('manc');
    expect(c.noleggio).toBeNull();
    expect(c.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
  });

  it('un bene targato nell\'elenco basta a togliere Grenke a tutto l\'elenco', () => {
    const c = calcolo({ beni: [bene('Gru a torre', 50_000), bene('Gru a torre', 20_000, { targato: true })] });
    expect(c.noleggio).toBeNull();
    expect(c.motivoNoNoleggio).toBe(TESTO_TARGATO);
  });

  it('il cliente che non si legge dalla ricerca non regge Econocom', () => {
    const r = ricerca(6_000_000);
    r.dati_credito.dati.fatturato = null;
    const c = calcolo(CARRELLO, r);
    expect(c.noleggio).toBeNull();
    expect(c.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
  });
});

describe('componiMezzi: il semaforo del locatore non cambia i numeri', () => {
  it('eventi negativi presenti: semaforo rosso e noleggio e leasing escono lo stesso', () => {
    const rosso = calcolo(GRU, ricerca(1_000_000, 'presenti'));
    const verde = calcolo(GRU, ricerca(1_000_000, 'assenti'));
    expect(rosso.valutazione?.semaforo).toBe('rosso');
    expect(rosso.valutazione?.blocca).toBe(false);
    expect(rosso.noleggio).not.toBeNull();
    expect(rosso.noleggio?.rate).toEqual(verde.noleggio?.rate);
    expect(rosso.leasing).toEqual(verde.leasing);
    expect(rosso.leasing.every((l) => l.righe.length > 0)).toBe(true);
  });

  it('il semaforo guarda gli eventi della ricerca; senza eventi salvati sono non verificati', () => {
    const r = ricerca();
    r.eventi = null;
    const c = calcolo(GRU, r);
    expect(c.valutazione?.locatore?.eventi).toBe('non-avviata');
  });
});

describe('componiMezzi: rifiuti', () => {
  it('un venditore che non esiste, vuoto o non testo: venditore_non_valido, mai un ripiego', () => {
    for (const venditore of ['xyz', '', 'MANC', 5, true, {}]) {
      expect(errore({ ...GRU, venditore })).toEqual({ ok: false, error: 'venditore_non_valido', riga: null });
    }
  });

  it('venditore assente o null: si usa quello della categoria', () => {
    expect(calcolo({ ...GRU, venditore: null }).venditore.codice).toBe('manc');
    expect(calcolo({ ...GRU, venditore: undefined }).venditore.codice).toBe('manc');
  });

  it('anticipo fuori scala o scritto male: anticipo_non_valido', () => {
    for (const anticipoPerc of ['20%', '1.000', 45, -1, 31, '31', 20.5, '20.5', '', ' 20', 'venti', true, {}, Number.NaN]) {
      expect(errore({ ...GRU, anticipoPerc }), String(anticipoPerc)).toEqual({ ok: false, error: 'anticipo_non_valido', riga: null });
    }
  });

  it('anticipo valido: numero intero o stringa di sole cifre, da 0 a 30', () => {
    expect(calcolo({ ...GRU, anticipoPerc: 0 }).anticipoPerc).toBe(0);
    expect(calcolo({ ...GRU, anticipoPerc: 30 }).anticipoPerc).toBe(30);
    expect(calcolo({ ...GRU, anticipoPerc: '25' }).anticipoPerc).toBe(25);
    expect(calcolo({ ...GRU, anticipoPerc: '0' }).anticipoPerc).toBe(0);
  });

  it('anticipo assente o null: quello della configurazione', () => {
    expect(calcolo(GRU).anticipoPerc).toBe(10);
    expect(calcolo({ ...GRU, anticipoPerc: null }).anticipoPerc).toBe(10);
  });

  it('anticipo 20: le righe del leasing hanno l\'anticipo al 20% e la rata scende', () => {
    const base = calcolo(GRU);
    const venti = calcolo({ ...GRU, anticipoPerc: 20 });
    expect(venti.anticipoPerc).toBe(20);
    for (const l of venti.leasing) {
      expect(l.righe.every((r) => r.anticipoPerc === 20)).toBe(true);
    }
    expect(venti.leasing[0].righe[0].anticipo).toBe(10_000);
    expect(venti.leasing[0].righe[0].rata).toBeLessThan(base.leasing[0].righe[0].rata);
    // L'anticipo non sposta il noleggio
    expect(venti.noleggio?.rate).toEqual(base.noleggio?.rate);
  });

  it('i beni che non reggono si fermano con l\'errore e la riga', () => {
    expect(errore({ beni: [] })).toEqual({ ok: false, error: 'beni_vuoti', riga: null });
    expect(errore({})).toEqual({ ok: false, error: 'beni_vuoti', riga: null });
    // Movimento terra non ha un default sul targato: senza risposta si ferma, mai "non targato"
    expect(errore({ beni: [bene('Gru a torre', 1_000), bene('Movimento terra', 90_000)] })).toEqual({
      ok: false, error: 'targato_mancante', riga: 1,
    });
    expect(errore({ beni: [bene('Elicotteri', 90_000)] })).toEqual({ ok: false, error: 'categoria_non_valida', riga: 0 });
  });

  it('senza configurazione mezzi o senza canali: configurazione_mancante, mai un altro listino', () => {
    const senzaMezzi = bergamelli({ mezzi: null });
    expect(senzaMezzi.mezzi).toBeNull();
    expect(errore(GRU, senzaMezzi)).toEqual({ ok: false, error: 'configurazione_mancante', riga: null });
    const senzaCanali = bergamelli({ canali: null });
    expect(senzaCanali.canali).toBeNull();
    expect(errore(GRU, senzaCanali)).toEqual({ ok: false, error: 'configurazione_mancante', riga: null });
  });

  it('con una configurazione che non si legge dalla riga: configurazione_mancante', () => {
    expect(errore(GRU, bergamelli({ mezzi: { ...MEZZI, venditori: [] } }))).toEqual({
      ok: false, error: 'configurazione_mancante', riga: null,
    });
  });
});

describe('componiMezzi: partner sotto il minimo', () => {
  it('8.000 euro: Sella senza righe e con il motivo, gli altri due restano', () => {
    const c = calcolo({ beni: [bene('Attrezzature', 8_000)] });
    const sella = c.leasing.find((l) => l.partner === 'sella')!;
    expect(sella.righe).toEqual([]);
    expect(sella.motivo).not.toBeNull();
    expect(c.leasing.filter((l) => l.righe.length > 0).map((l) => l.partner)).toEqual(['credem', 'alba']);
  });
});

// --- chiaveColonna -----------------------------------------------------------

describe('chiaveColonna', () => {
  it('A, B, C dalla posizione', () => {
    expect([0, 1, 2].map(chiaveColonna)).toEqual(['A', 'B', 'C']);
  });
});

// --- mezziPerSchermo ---------------------------------------------------------

/** Le parole che non devono mai arrivare al browser, nemmeno a chi vede i nomi dei partner */
const VIETATE = ['spread', 'provvig', 'tasso', 'coeff', 'grenke', 'econocom', 'sputnik', 'canale', 'imponibile'];
const NOMI_PARTNER = ['sella', 'credem', 'alba'];

/** I calcoli su cui si controlla l'uscita: Grenke, Econocom, nessun noleggio, rosso, partner sotto minimo */
const CALCOLI: [string, () => CalcoloMezzi][] = [
  ['Grenke', () => calcolo(GRU)],
  ['Econocom', () => calcolo(CARRELLO, ricerca(6_000_000))],
  ['targato', () => calcolo({ beni: [bene('Autogru', 80_000)] })],
  ['rosso', () => calcolo(GRU, ricerca(1_000_000, 'presenti'))],
  ['sotto il minimo di Sella', () => calcolo({ beni: [bene('Attrezzature', 8_000)] })],
  ['simulazione', () => {
    const s = simulaMezzi(K, { importo: 50_000, categoria: 'Gru a torre', targato: false }, OGGI);
    if (!s.ok) throw new Error(s.error);
    return s.calcolo;
  }],
];

describe('mezziPerSchermo: riservatezza', () => {
  it.each(CALCOLI)('%s, con i nomi dei partner: nessuna parola riservata', (_nome, fai) => {
    const testo = JSON.stringify(mezziPerSchermo(fai(), true)).toLowerCase();
    for (const v of VIETATE) expect(testo, v).not.toContain(v);
  });

  it.each(CALCOLI)('%s, senza i nomi: nemmeno sella, credem, alba', (_nome, fai) => {
    const s = mezziPerSchermo(fai(), false);
    const testo = JSON.stringify(s).toLowerCase();
    for (const v of [...VIETATE, ...NOMI_PARTNER]) expect(testo, v).not.toContain(v);
    for (const colonna of s.leasing) {
      expect(colonna.nome).toBeNull();
      for (const r of colonna.righe) {
        expect(r.speseIstruttoria).toBeNull();
        expect(r.speseIncassoRata).toBeNull();
      }
    }
  });

  it('del venditore escono solo codice e ragione sociale', () => {
    const s = mezziPerSchermo(calcolo(GRU), true);
    expect(s.venditore).toEqual({ codice: 'manc', ragioneSociale: 'Manc S.r.l.' });
    const testo = JSON.stringify(s);
    for (const v of ['03863700989', 'info@manc.example', 'manc@pec.example', 'Via Roma']) expect(testo).not.toContain(v);
  });
});

describe('mezziPerSchermo: la forma', () => {
  it('noleggio: rate, 60 mesi in evidenza, nota e se e\' da confermare; niente altro', () => {
    const s = mezziPerSchermo(calcolo(GRU), true);
    expect(Object.keys(s.noleggio!).sort()).toEqual(['daConfermare', 'durataEvidenza', 'nota', 'rate']);
    expect(s.noleggio?.durataEvidenza).toBe(60);
    expect(s.noleggio?.daConfermare).toBe(false);
    expect(s.noleggio?.rate.every((r) => Object.keys(r).sort().join() === 'canone,durata')).toBe(true);
    expect(s.motivoNoNoleggio).toBeNull();
  });

  it('Econocom: da confermare, 60 mesi in evidenza', () => {
    const s = mezziPerSchermo(calcolo(CARRELLO, ricerca(6_000_000)), true);
    expect(s.noleggio?.daConfermare).toBe(true);
    expect(s.noleggio?.durataEvidenza).toBe(60);
    expect(s.venditore.codice).toBe('nolsystem');
  });

  it('senza noleggio: noleggio null e il motivo', () => {
    const t = mezziPerSchermo(calcolo({ beni: [bene('Autogru', 80_000)] }), true);
    expect(t.noleggio).toBeNull();
    expect(t.motivoNoNoleggio).toBe(TESTO_TARGATO);
    const n = mezziPerSchermo(calcolo(CARRELLO, ricerca(4_000_000)), true);
    expect(n.noleggio).toBeNull();
    expect(n.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
  });

  it('beni, totale e anticipo sono quelli dell\'agente', () => {
    const s = mezziPerSchermo(calcolo({ ...GRU, anticipoPerc: 15 }), true);
    expect(s.totale).toBe(50_000);
    expect(s.anticipoPerc).toBe(15);
    expect(s.beni).toHaveLength(1);
    expect(s.beni[0]).toMatchObject({ categoria: 'Gru a torre', quantita: 1, prezzo: 50_000, targato: false, totale: 50_000 });
  });

  it('il semaforo e\' quello del locatore nella forma dello schermo', () => {
    const rosso = mezziPerSchermo(calcolo(GRU, ricerca(1_000_000, 'presenti')), true);
    expect(rosso.semaforo?.semaforo).toBe('rosso');
    expect(rosso.semaforo?.criteri.length).toBeGreaterThan(0);
    // Il rosso non toglie niente
    expect(rosso.noleggio).not.toBeNull();
    expect(rosso.leasing.every((l) => l.righe.length > 0)).toBe(true);
  });

  it('con i nomi accesi la colonna porta il nome e le spese per voce; la chiave resta A, B, C', () => {
    const s = mezziPerSchermo(calcolo(GRU), true);
    expect(s.leasing.map((l) => l.chiave)).toEqual(['A', 'B', 'C']);
    expect(s.leasing.map((l) => l.nome)).toEqual([SELLA.label, CREDEM.label, ALBA.label]);
    const r = s.leasing[0].righe[0];
    expect(r.speseIstruttoria).toBe(380);
    expect(r.speseIncassoRata).toBe(6);
  });

  it('con i nomi spenti la chiave e\' la stessa, il nome e le spese per voce no', () => {
    const s = mezziPerSchermo(calcolo(GRU, ricerca(), KSENZANOMI), false);
    expect(s.leasing.map((l) => l.chiave)).toEqual(['A', 'B', 'C']);
    expect(s.leasing.map((l) => l.nome)).toEqual([null, null, null]);
  });

  it('la riga del leasing: durata, rata, rate, anticipo, riscatto, spese e totale', () => {
    const s = mezziPerSchermo(calcolo(GRU), true);
    const r = s.leasing[0].righe[0];
    expect(Object.keys(r).sort()).toEqual([
      'anticipo', 'anticipoPerc', 'durata', 'numRate', 'rata', 'riscatto', 'riscattoPerc',
      'spese', 'speseIncassoRata', 'speseIstruttoria', 'totale',
    ]);
    expect(r.durata).toBe(36);
    expect(r.anticipoPerc).toBe(10);
    expect(r.riscattoPerc).toBe(1);
    expect(r.anticipo).toBe(5_000);
  });

  it('le spese sono istruttoria piu\' incasso su tutte le rate, anche a nomi spenti', () => {
    const acceso = mezziPerSchermo(calcolo(GRU), true);
    const spento = mezziPerSchermo(calcolo(GRU, ricerca(), KSENZANOMI), false);
    for (const colonna of acceso.leasing) {
      for (const r of colonna.righe) {
        const attese = Math.round(((r.speseIstruttoria ?? 0) + (r.speseIncassoRata ?? 0) * r.numRate) * 100) / 100;
        expect(r.spese).toBe(attese);
        expect(r.spese).toBeGreaterThan(0);
      }
    }
    // Stesse cifre con o senza nomi: cambia solo cosa si vede
    expect(spento.leasing.map((l) => l.righe.map((r) => [r.rata, r.spese, r.totale])))
      .toEqual(acceso.leasing.map((l) => l.righe.map((r) => [r.rata, r.spese, r.totale])));
  });

  it('il partner sotto il minimo porta il motivo e nessuna riga, e il motivo non dice chi e\'', () => {
    const s = mezziPerSchermo(calcolo({ beni: [bene('Attrezzature', 8_000)] }), false);
    const a = s.leasing[0];
    expect(a.chiave).toBe('A');
    expect(a.righe).toEqual([]);
    expect(a.motivo).toBe('Importo fuori dai limiti di questo partner.');
    expect(s.leasing[1].motivo).toBeNull();
  });
});

// --- simulaMezzi -------------------------------------------------------------

describe('simulaMezzi', () => {
  it('gru a torre non targata da manc: Grenke, senza ricerca e senza semaforo', () => {
    const s = simulaMezzi(K, { importo: 50_000, categoria: 'Gru a torre', targato: false }, OGGI);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.calcolo.ricerca).toBeNull();
    expect(s.calcolo.valutazione).toBeNull();
    expect(s.calcolo.venditore.codice).toBe('manc');
    expect(s.calcolo.noleggio?.canale).toBe('grenke');
    expect(s.calcolo.totale).toBe(50_000);
    expect(s.calcolo.beni).toHaveLength(1);
    expect(s.calcolo.leasing).toHaveLength(3);
    expect(mezziPerSchermo(s.calcolo, true).semaforo).toBeNull();
  });

  it('carrello da nolsystem a 200.000: il cliente non si conosce, Econocom non regge mai', () => {
    const s = simulaMezzi(K, { importo: 200_000, categoria: 'Carrelli elevatori', targato: false }, OGGI);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.calcolo.venditore.codice).toBe('nolsystem');
    expect(s.calcolo.noleggio).toBeNull();
    expect(s.calcolo.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
    expect(s.calcolo.leasing.every((l) => l.righe.length > 0)).toBe(true);
  });

  it('un mezzo targato non ha il noleggio Grenke', () => {
    const s = simulaMezzi(K, { importo: 80_000, categoria: 'Autogru', targato: true }, OGGI);
    expect(s.ok && s.calcolo.noleggio).toBeNull();
    expect(s.ok && s.calcolo.motivoNoNoleggio).toBe(TESTO_TARGATO);
  });

  it('categoria senza default e senza risposta sul targato: si ferma, mai "non targato"', () => {
    for (const categoria of ['Movimento terra', 'Piattaforme aeree']) {
      expect(simulaMezzi(K, { importo: 90_000, categoria }, OGGI)).toEqual({ ok: false, error: 'targato_mancante', riga: null });
      expect(simulaMezzi(K, { importo: 90_000, categoria, targato: 'si' }, OGGI)).toEqual({ ok: false, error: 'targato_mancante', riga: null });
    }
    // Il movimento terra e' di nolsystem, che Grenke non quota: serve manc scelto a mano
    const nolsystem = simulaMezzi(K, { importo: 90_000, categoria: 'Movimento terra', targato: false }, OGGI);
    expect(nolsystem.ok && nolsystem.calcolo.venditore.codice).toBe('nolsystem');
    expect(nolsystem.ok && nolsystem.calcolo.noleggio).toBeNull();
    const manc = simulaMezzi(K, { importo: 90_000, categoria: 'Movimento terra', targato: false, venditore: 'manc' }, OGGI);
    expect(manc.ok && manc.calcolo.noleggio?.canale).toBe('grenke');
  });

  it('importo illeggibile: importo_non_valido; categoria o venditore sconosciuti: il loro errore', () => {
    for (const importo of [undefined, 0, -5, 'molto', Number.NaN]) {
      expect(simulaMezzi(K, { importo, categoria: 'Gru a torre', targato: false }, OGGI)).toEqual({
        ok: false, error: 'importo_non_valido', riga: null,
      });
    }
    expect(simulaMezzi(K, { importo: 50_000, categoria: 'Elicotteri', targato: false }, OGGI)).toEqual({
      ok: false, error: 'categoria_non_valida', riga: null,
    });
    expect(simulaMezzi(K, { importo: 50_000, categoria: 'Gru a torre', targato: false, venditore: 'xyz' }, OGGI)).toEqual({
      ok: false, error: 'venditore_non_valido', riga: null,
    });
  });

  it('con un venditore scelto vale quello', () => {
    const s = simulaMezzi(K, { importo: 50_000, categoria: 'Gru a torre', targato: false, venditore: 'nolsystem' }, OGGI);
    expect(s.ok && s.calcolo.venditore.codice).toBe('nolsystem');
    expect(s.ok && s.calcolo.noleggio).toBeNull();
  });

  it('senza configurazione: configurazione_mancante', () => {
    expect(simulaMezzi(bergamelli({ mezzi: null }), { importo: 50_000, categoria: 'Gru a torre', targato: false }, OGGI)).toEqual({
      ok: false, error: 'configurazione_mancante', riga: null,
    });
  });
});

// --- calcolaMezzi ------------------------------------------------------------

describe('calcolaMezzi', () => {
  // Solo i campi che calcolaMezzi legge dalla sessione
  const sessione = (k: Carrozzeria = K) => ({ ok: true, carrozzeria: k }) as unknown as Parameters<typeof calcolaMezzi>[0];

  beforeEach(() => {
    lettura.ricercaVisibile.mockReset();
    lettura.completaRicerca.mockReset();
    lettura.completaRicerca.mockImplementation(async (r: RicercaSalvata) => r);
  });

  it('ricerca non visibile all\'utente: 404 ricerca_non_trovata, il calcolo non parte', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(null);
    const esito = await calcolaMezzi(sessione(), { ricercaId: 'r-altrui', ...GRU }, OGGI);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.risposta.status).toBe(404);
    expect(await esito.risposta.json()).toEqual({ ok: false, error: 'ricerca_non_trovata' });
    expect(lettura.ricercaVisibile).toHaveBeenCalledWith(expect.anything(), 'r-altrui');
    expect(lettura.completaRicerca).not.toHaveBeenCalled();
  });

  it('senza ricercaId la ricerca e\' obbligatoria lo stesso', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(null);
    const esito = await calcolaMezzi(sessione(), GRU, OGGI);
    expect(esito.ok).toBe(false);
    expect(lettura.ricercaVisibile).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('ricerca trovata: la completa dal Registro e compone il calcolo', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(ricerca());
    const esito = await calcolaMezzi(sessione(), { ricercaId: 'r-1', ...GRU }, OGGI);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(lettura.completaRicerca).toHaveBeenCalledTimes(1);
    expect(esito.calcolo.ricerca?.id).toBe('r-1');
    expect(esito.calcolo.noleggio?.canale).toBe('grenke');
  });

  it('corpo che non regge: 400 con l\'errore e la riga', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(ricerca());
    const esito = await calcolaMezzi(sessione(), { ricercaId: 'r-1', beni: [bene('Movimento terra', 90_000)] }, OGGI);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.risposta.status).toBe(400);
    expect(await esito.risposta.json()).toEqual({ ok: false, error: 'targato_mancante', riga: 0 });
  });

  it('venditore e anticipo sbagliati: 400, mai un ripiego', async () => {
    for (const [cambio, error] of [
      [{ venditore: 'xyz' }, 'venditore_non_valido'],
      [{ anticipoPerc: '20%' }, 'anticipo_non_valido'],
    ] as const) {
      lettura.ricercaVisibile.mockResolvedValueOnce(ricerca());
      const esito = await calcolaMezzi(sessione(), { ricercaId: 'r-1', ...GRU, ...cambio }, OGGI);
      expect(esito.ok).toBe(false);
      if (esito.ok) continue;
      expect(esito.risposta.status).toBe(400);
      expect((await esito.risposta.json()).error).toBe(error);
    }
  });
});

// --- le due API --------------------------------------------------------------

describe('/api/motore/proposte e /api/motore/simulazione sul settore mezzi', () => {
  const sessioneDi = (k: Carrozzeria) => ({
    ok: true,
    contesto: { userId: 'u-agente', email: 'agente@example.it', nome: 'Agente', ruolo: 'agente', organizationId: 'org-bg' },
    carrozzeria: k,
    vedeTutto: false,
  });
  const post = (percorso: 'proposte' | 'simulazione', corpo: unknown) => {
    const request = new Request(`https://www.example.it/api/motore/${percorso}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });
    return percorso === 'proposte' ? proposte({ request }) : simulazione({ request });
  };

  beforeEach(() => {
    for (const f of Object.values(lettura)) f.mockReset();
    lettura.completaRicerca.mockImplementation(async (r: RicercaSalvata) => r);
    lettura.sessioneMotore.mockResolvedValue(sessioneDi(K));
  });

  it('proposte: la risposta e\' mezziPerSchermo, con i nomi dei partner accesi sulla configurazione di Bergamelli', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(ricerca());
    const r = await post('proposte', { f: 'bergamelli', ricercaId: 'r-1', ...GRU });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.venditore).toEqual({ codice: 'manc', ragioneSociale: 'Manc S.r.l.' });
    expect(corpo.noleggio.rate.length).toBeGreaterThan(0);
    expect(corpo.semaforo.semaforo).toBeTruthy();
    expect(corpo.leasing.map((l: { chiave: string; nome: string }) => [l.chiave, l.nome])).toEqual([
      ['A', SELLA.label], ['B', CREDEM.label], ['C', ALBA.label],
    ]);
    // La sessione si chiede col permesso di creare un preventivo, come per gli altri settori
    expect(lettura.sessioneMotore).toHaveBeenCalledWith(expect.anything(), 'bergamelli', { permesso: { preventivo: ['crea'] } });
    expect(lettura.calcolaProposta).not.toHaveBeenCalled();
  });

  it('proposte: con i nomi spenti nella configurazione nessun nome esce', async () => {
    lettura.sessioneMotore.mockResolvedValue(sessioneDi(KSENZANOMI));
    lettura.ricercaVisibile.mockResolvedValueOnce(ricerca());
    const r = await post('proposte', { f: 'bergamelli', ricercaId: 'r-1', ...GRU });
    const testo = (await r.text()).toLowerCase();
    for (const v of NOMI_PARTNER) expect(testo).not.toContain(v);
    expect(testo).toContain('"nome":null');
  });

  it('proposte: un corpo che non regge e\' un 400 con l\'errore e la riga', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(ricerca());
    const r = await post('proposte', { f: 'bergamelli', ricercaId: 'r-1', ...GRU, venditore: 'xyz' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'venditore_non_valido', riga: null });
  });

  it('proposte: una ricerca che non e\' dell\'utente e\' un 404', async () => {
    lettura.ricercaVisibile.mockResolvedValueOnce(null);
    const r = await post('proposte', { f: 'bergamelli', ricercaId: 'r-altrui', ...GRU });
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe('ricerca_non_trovata');
  });

  it('proposte: gli altri settori passano ancora da calcolaProposta', async () => {
    lettura.sessioneMotore.mockResolvedValue(sessioneDi(bergamelli({ settore: 'generico' })));
    lettura.calcolaProposta.mockResolvedValueOnce({ ok: false, risposta: new Response('{}', { status: 404 }) });
    const r = await post('proposte', { f: 'bergamelli', ricercaId: 'r-1', codice: 'X' });
    expect(r.status).toBe(404);
    expect(lettura.calcolaProposta).toHaveBeenCalledTimes(1);
    expect(lettura.ricercaVisibile).not.toHaveBeenCalled();
  });

  it('simulazione: il canone della gru a torre, senza semaforo e senza salvare niente', async () => {
    const r = await post('simulazione', { f: 'bergamelli', importo: 50_000, categoria: 'Gru a torre', targato: false });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.semaforo).toBeNull();
    expect(corpo.noleggio.rate.length).toBeGreaterThan(0);
    expect(corpo.leasing).toHaveLength(3);
    expect(lettura.ricercaVisibile).not.toHaveBeenCalled();
  });

  it('simulazione: il documento non si chiede mai, nemmeno con documento: true', async () => {
    const r = await post('simulazione', { f: 'bergamelli', importo: 50_000, categoria: 'Gru a torre', targato: false, documento: true });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(lettura.generaSimulazione).not.toHaveBeenCalled();
    expect(corpo.id).toBeUndefined();
    expect(corpo.documenti).toBeUndefined();
  });

  it('simulazione: il carrello di nolsystem non ha il noleggio e dice perche\'', async () => {
    const r = await post('simulazione', { f: 'bergamelli', importo: 200_000, categoria: 'Carrelli elevatori', targato: false });
    const corpo = await r.json();
    expect(corpo.noleggio).toBeNull();
    expect(corpo.motivoNoNoleggio).toBe(TESTO_NOLEGGIO_NON_DISPONIBILE);
    expect(corpo.leasing).toHaveLength(3);
  });

  it('simulazione: errori come 400, con il nome del campo', async () => {
    const targa = await post('simulazione', { f: 'bergamelli', importo: 90_000, categoria: 'Movimento terra' });
    expect(targa.status).toBe(400);
    expect(await targa.json()).toEqual({ ok: false, error: 'targato_mancante', riga: null });
    const importo = await post('simulazione', { f: 'bergamelli', importo: 0, categoria: 'Gru a torre', targato: false });
    expect(importo.status).toBe(400);
    expect((await importo.json()).error).toBe('importo_non_valido');
  });

  it('simulazione: i settori che non sono ne\' distinta ne\' mezzi restano un 404', async () => {
    lettura.sessioneMotore.mockResolvedValue(sessioneDi(bergamelli({ settore: 'macchine' })));
    const r = await post('simulazione', { f: 'bergamelli', importo: 50_000, categoria: 'Gru a torre', targato: false });
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe('non_disponibile');
  });

  it('un corpo che non e\' JSON e\' un 400 su entrambe', async () => {
    for (const percorso of ['proposte', 'simulazione'] as const) {
      const r = await post(percorso, 'non json');
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe('invalid_json');
    }
  });
});
