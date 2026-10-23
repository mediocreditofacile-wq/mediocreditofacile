// La pratica del settore mezzi (Bergamelli): parte solo da un preventivo salvato e ne
// rilegge importo, venditore e partner del leasing. Spec mcf_spec-bergamelli-motore_v2.
//
// Database, verifica eventi, mail e sessione sono finti: qui si prova cosa si scrive,
// cosa torna al browser e cosa no. Le forme salvate (dati e numeri di app.proposta)
// non sono scritte a mano: escono dalle funzioni del preventivo (datiPropostaMezzi,
// numeriPropostaMezzi) sul calcolo vero, cosi' il test si accorge se cambiano.
//
// I punti che contano: l'importo viene dal preventivo e mai dal browser; un partner o
// una durata che il preventivo non aveva sono un 400; il rosso non blocca ma marca la
// pratica; la risposta all'agente e' solo { ok, id } e non nomina nessun partner; i
// percorsi generico e distinta della route restano quelli di sempre.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const posta = vi.hoisted(() => ({ inviaMail: vi.fn() }));
const motore = vi.hoisted(() => ({ sessioneMotore: vi.fn() }));
const distinta = vi.hoisted(() => ({ creaPraticaDistinta: vi.fn() }));
const oa = vi.hoisted(() => ({
  leggiVerifica: vi.fn(), avviaNegativita: vi.fn(), entroIlTetto: vi.fn(), scriviVerifica: vi.fn(), esitoNegativita: vi.fn(),
}));

vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
vi.mock('../auth', () => ({ BASE_URL: 'https://www.example.it' }));
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));
vi.mock('../preventivi-pv', () => ({ salvaPdf: vi.fn() }));
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: motore.sessioneMotore,
}));
vi.mock('../openapi', async (originale) => ({
  ...(await originale<typeof import('../openapi')>()),
  leggiVerifica: oa.leggiVerifica,
  avviaNegativita: oa.avviaNegativita,
  entroIlTetto: oa.entroIlTetto,
  scriviVerifica: oa.scriviVerifica,
  esitoNegativita: oa.esitoNegativita,
}));
vi.mock('../mail-portale', async (originale) => ({
  ...(await originale<typeof import('../mail-portale')>()),
  inviaMail: posta.inviaMail,
}));
vi.mock('./pratica-distinta', () => ({ creaPraticaDistinta: distinta.creaPraticaDistinta }));

import { POST as inviaPratica } from '../../pages/api/motore/pratica';
import { buildChecklist } from '../checklist-pratica';
import { DESTINATARIO_MCF } from '../mail-portale';
import { componiMezzi, type CalcoloMezzi } from './calcolo-mezzi';
import type { RicercaSalvata } from './calcolo-proposta';
import { carrozzeriaDaRiga, type Carrozzeria, type RigaCarrozzeria } from './carrozzeria';
import type { EventiRicerca } from './eventi-stato';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { checklistPratica, creaPratica, type ExtraPratica } from './pratica';
import { creaPraticaMezzi, sceltaPratica, VOCE_BILANCIO_ANALITICO } from './pratica-mezzi';
import { datiPropostaMezzi, numeriPropostaMezzi } from './preventivo-mezzi';

// "Oggi" in ora locale, come nei test del calcolo
const OGGI = new Date(2026, 9, 23);
const PIVA = '01234567890';
const BOZZA = '3f2c1a7e-1111-4222-8333-944455556666';
const CARTELLA = `pratiche/bergamelli/bozze/${BOZZA}/`;
const IBAN = 'IT60X0542811101000000123456';
const ID_PROPOSTA = 'BG-20261023-100000';

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
    { nome: 'Carrelli elevatori', targato: false },
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

type Ruolo = 'admin' | 'referente' | 'agente';
const sessione = (ruolo: Ruolo = 'agente', k: Carrozzeria = K) => ({
  ok: true as const,
  contesto: { userId: `u-${ruolo}`, email: `${ruolo}@example.it`, nome: ruolo, ruolo, organizationId: 'org-bg' } as any,
  carrozzeria: k,
  vedeTutto: ruolo !== 'agente',
});

// --- la ricerca e i preventivi salvati ----------------------------------------

const SCHEDA: SchedaRidotta = {
  piva: PIVA,
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
  stato, id: 'ev-1', avviata: null, chiusa: null, codice: PIVA, daRegistro: true, mail: 'non-serve',
});

const ricerca = (stato: EventiRicerca['stato'] = 'assenti'): RicercaSalvata => ({
  id: 'r-1',
  piva: PIVA,
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: DATI, scheda: SCHEDA },
  eventi: EVENTI(stato),
  segnali: null,
});

const bene = (categoria: string, prezzo: number) => ({
  descrizione: `${categoria} di prova`, categoria, quantita: 1, prezzo,
});

function calcolo(corpo: Record<string, unknown>, r: RicercaSalvata = ricerca()): CalcoloMezzi {
  const esito = componiMezzi(r, K, corpo, OGGI);
  if (!esito.ok) throw new Error(`mezzi rifiutati: ${esito.error}`);
  return esito.calcolo;
}

/** La riga di app.proposta come la restituisce Postgres: il prezzo e' un numeric, quindi una stringa */
function salvata(corpo: Record<string, unknown>, o: { ricerca?: RicercaSalvata; chiave?: string | null } = {}) {
  const c = calcolo(corpo, o.ricerca);
  const chiave = o.chiave === undefined ? 'C' : o.chiave;
  return {
    id: ID_PROPOSTA,
    // Non li seleziona la pratica: servono al database finto per filtrare come farebbe Postgres
    fornitore_slug: 'bergamelli',
    organization_id: 'org-bg',
    user_id: 'u-agente',
    piva: PIVA,
    prezzo: c.totale.toFixed(2),
    semaforo: c.valutazione!.semaforo,
    dati: JSON.parse(JSON.stringify(datiPropostaMezzi(c, chiave))),
    numeri: JSON.parse(JSON.stringify(numeriPropostaMezzi(c, K, chiave))),
  };
}

type Salvata = ReturnType<typeof salvata>;
const perScelta = (r: Salvata) => ({ prezzo: Number(r.prezzo), semaforo: r.semaforo, dati: r.dati, numeri: r.numeri });

// Gru a torre da 50.000 euro: Grenke quota 24-60 mesi, i tre partner di leasing 36-84
const GRU = { beni: [bene('Gru a torre', 50_000)] };
// Autogru: mezzo targato, nessun noleggio
const AUTOGRU = { beni: [bene('Autogru', 80_000)] };
// 6.000 euro: sotto il minimo di Sella (9.000), la sua colonna c'e' ma senza righe
const PICCOLA = { beni: [bene('Gru a torre', 6_000)] };

// --- sceltaPratica ------------------------------------------------------------

describe('sceltaPratica: il noleggio', () => {
  const proposta = salvata(GRU);

  it('a una durata salvata: prodotto, durata e importo del preventivo, nessun partner', () => {
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata: 48 })).toEqual({
      ok: true, prodotto: 'noleggio', durata: 48, partner: null, importo: 50_000, rivalutare: false,
    });
  });

  it('ogni durata del noleggio salvato passa', () => {
    for (const durata of [24, 30, 36, 48, 60]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata })).toMatchObject({ ok: true, durata });
    }
  });

  it('senza un noleggio salvato (mezzo targato) e\' prodotto_non_valido', () => {
    const targato = salvata(AUTOGRU);
    expect(targato.numeri.noleggio).toBeNull();
    expect(sceltaPratica(perScelta(targato), { prodotto: 'noleggio', durata: 60 })).toEqual({ ok: false, error: 'prodotto_non_valido' });
  });

  it('una durata che il noleggio non aveva e\' durata_non_valida', () => {
    for (const durata of [12, 72, 84, 59, 0, -60]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata })).toEqual({ ok: false, error: 'durata_non_valida' });
    }
  });

  it('il noleggio non guarda la colonna del leasing: una chiave in piu\' non cambia niente', () => {
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata: 60, leasingChiave: 'Z' }))
      .toMatchObject({ ok: true, partner: null });
  });
});

describe('sceltaPratica: il leasing', () => {
  const proposta = salvata(GRU);

  it('chiave e durata salvate: il partner e\' quello della colonna', () => {
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'A', durata: 36 })).toEqual({
      ok: true, prodotto: 'leasing', durata: 36, partner: 'sella', importo: 50_000, rivalutare: false,
    });
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'B', durata: 60 })).toMatchObject({ ok: true, partner: 'credem' });
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'C', durata: 84 })).toMatchObject({ ok: true, partner: 'alba' });
  });

  it('senza noleggio il leasing si puo\' scegliere lo stesso', () => {
    expect(sceltaPratica(perScelta(salvata(AUTOGRU)), { prodotto: 'leasing', leasingChiave: 'C', durata: 60 }))
      .toMatchObject({ ok: true, partner: 'alba', importo: 80_000 });
  });

  it('la chiave assente, vuota, sconosciuta o non testo e\' partner_non_valido', () => {
    for (const leasingChiave of [undefined, '', 'Z', 'a', 'AA', 7, null, ['A'], { chiave: 'A' }]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave, durata: 60 }))
        .toEqual({ ok: false, error: 'partner_non_valido' });
    }
  });

  it('una colonna senza righe (importo sotto il minimo del partner) e\' partner_non_valido', () => {
    const piccola = salvata(PICCOLA);
    expect(piccola.numeri.leasing[0].righe).toEqual([]);
    expect(sceltaPratica(perScelta(piccola), { prodotto: 'leasing', leasingChiave: 'A', durata: 60 }))
      .toEqual({ ok: false, error: 'partner_non_valido' });
    // gli altri partner restano scegliebili
    expect(sceltaPratica(perScelta(piccola), { prodotto: 'leasing', leasingChiave: 'B', durata: 60 })).toMatchObject({ ok: true, partner: 'credem' });
  });

  it('una durata che il partner non aveva e\' durata_non_valida: 24 mesi non sono salvati', () => {
    for (const durata of [24, 30, 96, 0]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'C', durata }))
        .toEqual({ ok: false, error: 'durata_non_valida' });
    }
  });

  it('la durata di un partner non e\' quella di un altro: Sella senza righe a 36 mesi non presta le sue', () => {
    const p = perScelta(proposta);
    // Si toglie la riga a 72 mesi alla sola colonna A: la B la ha ancora
    const numeri = JSON.parse(JSON.stringify(p.numeri));
    numeri.leasing[0].righe = numeri.leasing[0].righe.filter((r: { durata: number }) => r.durata !== 72);
    expect(sceltaPratica({ ...p, numeri }, { prodotto: 'leasing', leasingChiave: 'A', durata: 72 })).toEqual({ ok: false, error: 'durata_non_valida' });
    expect(sceltaPratica({ ...p, numeri }, { prodotto: 'leasing', leasingChiave: 'B', durata: 72 })).toMatchObject({ ok: true });
  });

  it('una colonna che nei dati salvati non ha un partner noto e\' partner_non_valido', () => {
    const p = perScelta(proposta);
    for (const partner of [{ A: 'sella', B: 'credem' }, { A: 'sella', B: 'credem', C: 'banca-x' }, { A: 'sella', B: 'credem', C: null }, {}]) {
      expect(sceltaPratica({ ...p, dati: { ...p.dati, partner } }, { prodotto: 'leasing', leasingChiave: 'C', durata: 60 }))
        .toEqual({ ok: false, error: 'partner_non_valido' });
    }
  });
});

describe('sceltaPratica: durata, prodotto, importo e semaforo', () => {
  const proposta = salvata(GRU);

  it('la durata e\' un intero, come numero o come stringa di sole cifre', () => {
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata: '36' })).toMatchObject({ ok: true, durata: 36 });
    expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'A', durata: '60' })).toMatchObject({ ok: true, durata: 60 });
  });

  it('qualunque altra forma di durata e\' durata_non_valida', () => {
    for (const durata of [undefined, null, '', ' 60', '60 ', '60.0', '6e1', '+60', '-60', 'sessanta', 60.5, NaN, Infinity, true, [60], { durata: 60 }]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata })).toEqual({ ok: false, error: 'durata_non_valida' });
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'A', durata })).toEqual({ ok: false, error: 'durata_non_valida' });
    }
  });

  it('il prodotto e\' noleggio o leasing, scritto cosi\'', () => {
    for (const prodotto of [undefined, null, '', 'altro', 'Noleggio', 'LEASING', 'noleggio ', 1, ['noleggio']]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto, durata: 60, leasingChiave: 'A' })).toEqual({ ok: false, error: 'prodotto_non_valido' });
    }
  });

  it('l\'importo e\' quello del preventivo anche se il corpo ne manda un altro', () => {
    for (const importo of [1, 999_999, '12', -5]) {
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'noleggio', durata: 60, importo }))
        .toMatchObject({ ok: true, importo: 50_000 });
      expect(sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'A', durata: 60, importo }))
        .toMatchObject({ ok: true, importo: 50_000 });
    }
  });

  it('l\'importo si arrotonda ai centesimi', () => {
    expect(sceltaPratica({ ...perScelta(proposta), prezzo: 12345.678 }, { prodotto: 'noleggio', durata: 60 }))
      .toMatchObject({ ok: true, importo: 12345.68 });
  });

  it('un prezzo che non e\' un importo positivo e\' prodotto_non_valido', () => {
    for (const prezzo of [0, -1, NaN, Infinity, '50000' as unknown as number]) {
      expect(sceltaPratica({ ...perScelta(proposta), prezzo }, { prodotto: 'noleggio', durata: 60 })).toEqual({ ok: false, error: 'prodotto_non_valido' });
    }
  });

  it('il semaforo rosso vuole la rivalutazione, gli altri colori no', () => {
    const rossa = salvata(GRU, { ricerca: ricerca('presenti') });
    expect(rossa.semaforo).toBe('rosso');
    expect(sceltaPratica(perScelta(rossa), { prodotto: 'noleggio', durata: 60 })).toMatchObject({ ok: true, rivalutare: true });
    expect(sceltaPratica(perScelta(rossa), { prodotto: 'leasing', leasingChiave: 'A', durata: 60 })).toMatchObject({ ok: true, rivalutare: true });
    for (const semaforo of ['verde-scuro', 'verde-chiaro', 'giallo', '', 'ROSSO']) {
      expect(sceltaPratica({ ...perScelta(proposta), semaforo }, { prodotto: 'noleggio', durata: 60 })).toMatchObject({ ok: true, rivalutare: false });
    }
  });

  it('dalle forme salvate non esce niente di piu\' di quello che serve', () => {
    const r = sceltaPratica(perScelta(proposta), { prodotto: 'leasing', leasingChiave: 'C', durata: 60 });
    expect(Object.keys(r).sort()).toEqual(['durata', 'importo', 'ok', 'partner', 'prodotto', 'rivalutare']);
  });
});

describe('sceltaPratica: forme che non sono di un preventivo di mezzi', () => {
  const proposta = salvata(GRU);
  const rotte: [string, unknown][] = [
    ['null', null], ['undefined', undefined], ['una stringa', 'testo'], ['un numero', 42], ['un array', []],
    ['un oggetto vuoto', {}], ['un noleggio che non e\' un oggetto', { noleggio: 'x' }],
    ['un noleggio senza rate', { noleggio: { nota: 'x' } }], ['rate vuote', { noleggio: { rate: [] } }],
    ['rate che non sono un array', { noleggio: { rate: { durata: 60 } } }],
    ['rate di cose che non sono oggetti', { noleggio: { rate: [60, null, 'x'] } }],
  ];

  it.each(rotte)('numeri %s: noleggio e\' prodotto_non_valido e non lancia', (_nome, numeri) => {
    expect(sceltaPratica({ ...perScelta(proposta), numeri }, { prodotto: 'noleggio', durata: 60 })).toEqual({ ok: false, error: 'prodotto_non_valido' });
  });

  it('numeri senza colonne di leasing in forma di array: leasing e\' prodotto_non_valido', () => {
    for (const leasing of [undefined, null, 'x', 3, {}, { A: {} }]) {
      const numeri = { ...perScelta(proposta).numeri, leasing };
      expect(sceltaPratica({ ...perScelta(proposta), numeri }, { prodotto: 'leasing', leasingChiave: 'A', durata: 60 }))
        .toEqual({ ok: false, error: 'prodotto_non_valido' });
    }
  });

  it('colonne che non sono oggetti o senza righe in forma di array: partner_non_valido, senza lanciare', () => {
    for (const leasing of [[], [null, 3, 'x'], [{ chiave: 'A' }], [{ chiave: 'A', righe: 'x' }], [{ chiave: 'A', righe: [] }]]) {
      const numeri = { ...perScelta(proposta).numeri, leasing };
      expect(sceltaPratica({ ...perScelta(proposta), numeri }, { prodotto: 'leasing', leasingChiave: 'A', durata: 60 }))
        .toEqual({ ok: false, error: 'partner_non_valido' });
    }
  });

  it('dati senza l\'elenco dei partner: leasing e\' prodotto_non_valido e non lancia', () => {
    for (const dati of [null, undefined, 'x', [], {}, { partner: 'x' }, { partner: null }, { partner: [] }]) {
      expect(sceltaPratica({ ...perScelta(proposta), dati }, { prodotto: 'leasing', leasingChiave: 'A', durata: 60 }))
        .toEqual({ ok: false, error: 'prodotto_non_valido' });
    }
  });

  it('una chiave come __proto__ o constructor non si legge dalla catena dei prototipi', () => {
    const p = perScelta(proposta);
    const numeri = { ...p.numeri, leasing: [{ chiave: 'constructor', righe: [{ durata: 60 }] }] };
    expect(sceltaPratica({ ...p, numeri }, { prodotto: 'leasing', leasingChiave: 'constructor', durata: 60 }))
      .toEqual({ ok: false, error: 'partner_non_valido' });
  });
});

// --- checklistPratica e creaPratica con extra ---------------------------------

describe('checklistPratica', () => {
  it('senza extra e\' la checklist di sempre, per ogni forma e importo', () => {
    for (const forma of ['Società di capitali', 'Ditta individuale', 'Lavoratore autonomo', 'Altro']) {
      for (const importo of [5_000, 10_000, 10_001, 80_000]) {
        expect(checklistPratica(forma, importo, undefined, ['Preventivo del fornitore']))
          .toEqual(buildChecklist(forma, importo, ['Preventivo del fornitore']));
        expect(checklistPratica(forma, importo, null, [])).toEqual(buildChecklist(forma, importo, []));
      }
    }
  });

  it('con extra le voci in piu\' vanno in coda, dopo i documenti reddituali', () => {
    const extra: ExtraPratica = { venditore: 'Manc S.r.l.', partner: 'Alba Leasing', rivalutare: false, checklistExtra: [VOCE_BILANCIO_ANALITICO] };
    const lista = checklistPratica('Società di capitali', 80_000, extra, ['Offerta del fornitore']);
    expect(lista).toEqual([...buildChecklist('Società di capitali', 80_000, ['Offerta del fornitore']), VOCE_BILANCIO_ANALITICO]);
    expect(lista.at(-1)).toBe(VOCE_BILANCIO_ANALITICO);
  });

  it('con extra e nessuna voce in piu\' (noleggio) non cambia niente', () => {
    const extra: ExtraPratica = { venditore: 'Manc S.r.l.', partner: null, rivalutare: true, checklistExtra: [] };
    expect(checklistPratica('Ditta individuale', 20_000, extra, [])).toEqual(buildChecklist('Ditta individuale', 20_000, []));
  });

  it('la voce del bilancio analitico e\' quella del testo fisso', () => {
    expect(VOCE_BILANCIO_ANALITICO).toBe("Bilancio analitico dell'ultimo esercizio (bilancio di verifica o situazione contabile dettagliata)");
  });
});

// --- il mondo finto per creaPratica e creaPraticaMezzi -----------------------

type Mail = { to: string; subject: string; html: string };
const mailPratica = () => posta.inviaMail.mock.calls.map(([m]) => m as Mail).find((m) => /^Pratica /.test(m.subject))!;

/** La riga scritta in app.pratica, colonna per colonna */
function inserita() {
  const chiamata = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO app.pratica'));
  if (!chiamata) return null;
  const v = chiamata[1] as unknown[];
  return {
    id: v[0] as string, fornitore: v[1], organizzazione: v[2], utente: v[3], propostaId: v[4], piva: v[5], cliente: v[6],
    importo: v[7] as number, dati: JSON.parse(String(v[8])), documenti: JSON.parse(String(v[9])),
    negativita: JSON.parse(String(v[10])), storia: JSON.parse(String(v[11])),
  };
}

/**
 * Il database finto filtra come farebbe Postgres: la proposta si trova solo con l'id,
 * il fornitore, la partita IVA e l'organizzazione giusti ($1-$4) e, per l'agente, il suo utente ($5).
 */
function database(o: { ricerca?: unknown; proposta?: Salvata | null } = {}) {
  db.queryUna.mockImplementation(async (sql: string, valori: unknown[]) => {
    if (sql.includes('FROM app.ricerca_merito')) return o.ricerca === undefined ? ricerca() : o.ricerca;
    if (sql.includes('FROM app.proposta')) {
      const p = o.proposta === undefined ? salvata(GRU) : o.proposta;
      if (!p) return null;
      const combacia = valori[0] === p.id && valori[1] === p.fornitore_slug && valori[2] === p.piva && valori[3] === p.organization_id
        && (valori.length < 5 || valori[4] === p.user_id);
      return combacia ? { id: p.id, prezzo: p.prezzo, semaforo: p.semaforo, dati: p.dati, numeri: p.numeri } : null;
    }
    return null;
  });
  db.query.mockImplementation(async (sql: string, valori: unknown[]) =>
    sql.includes('INSERT INTO app.pratica') ? [{ id: valori[0] }] : []);
}

const corpo = (o: Record<string, unknown> = {}) => ({
  f: 'bergamelli',
  ricercaId: 'r-1',
  propostaId: ID_PROPOSTA,
  bozza: BOZZA,
  prodotto: 'noleggio',
  durata: 60,
  formaGiuridica: 'Società di capitali',
  referente: { nome: 'Anna Rossi', telefono: '333 1234567', email: 'anna@example.it' },
  iban: IBAN,
  note: 'Consegna a novembre',
  documenti: [{ nome: 'visura.pdf', pathname: `${CARTELLA}visura.pdf`, size: 100 }],
  ...o,
});

const post = (c: Record<string, unknown>) =>
  inviaPratica({ request: new Request('https://www.example.it/api/motore/pratica', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
  }) });

beforeEach(() => {
  vi.clearAllMocks();
  database();
  // La verifica eventi e' gia' nel registro: all'invio non si ripaga
  oa.leggiVerifica.mockImplementation(async () => ({
    cf: PIVA, negativita: { id: 'ev-1', avviata: new Date().toISOString(), pronto: true, dati: { presenzaProtesti: false } },
  }));
  oa.avviaNegativita.mockRejectedValue(new Error('la verifica non si ripaga'));
  oa.entroIlTetto.mockResolvedValue({ ok: true });
  oa.scriviVerifica.mockResolvedValue(undefined);
  oa.esitoNegativita.mockResolvedValue({ pronto: false });
  posta.inviaMail.mockResolvedValue({ ok: true, id: 'm-1' });
  motore.sessioneMotore.mockResolvedValue(sessione());
  distinta.creaPraticaDistinta.mockResolvedValue({ ok: true, id: 'LO-P-1', segnalazione: false });
});

const base = {
  propostaId: ID_PROPOSTA,
  bozza: BOZZA,
  prodotto: 'leasing' as const,
  durata: 60,
  importo: 50_000,
  formaGiuridica: 'Società di capitali',
  referente: { nome: 'Anna Rossi', telefono: '333 1234567', email: 'anna@example.it' },
  iban: IBAN,
  note: '',
  documenti: [],
};

describe('creaPratica con extra', () => {
  const extra = (o: Partial<ExtraPratica> = {}): ExtraPratica => ({
    venditore: 'Manc S.r.l.', partner: 'Alba Leasing', rivalutare: false, checklistExtra: [VOCE_BILANCIO_ANALITICO], ...o,
  });

  it('senza extra niente cambia: dati senza extra, checklist di sempre, mail di sempre', async () => {
    const id = await creaPratica(sessione() as any, { ...base, ricerca: ricerca() });
    const p = inserita()!;
    expect(p.id).toBe(id);
    expect(p.dati).not.toHaveProperty('extra');
    expect(p.dati.checklist).toEqual(buildChecklist('Società di capitali', 50_000, []));
    const m = mailPratica();
    expect(m.subject).toBe('Pratica Bergamelli — EDILE ALFA S.R.L. — 50.000 euro');
    expect(m.html).not.toContain('Venditore');
    expect(m.html).not.toContain('Partner del leasing');
    expect(m.html).not.toContain('Semaforo');
    expect(m.html).not.toContain('Bilancio analitico');
  });

  it('con extra: dati.extra, la voce del bilancio analitico in checklist e le righe nella mail', async () => {
    await creaPratica(sessione() as any, { ...base, ricerca: ricerca(), extra: extra() });
    const p = inserita()!;
    expect(p.dati.extra).toEqual(extra());
    expect(p.dati.checklist).toEqual([...buildChecklist('Società di capitali', 50_000, []), VOCE_BILANCIO_ANALITICO]);
    const m = mailPratica();
    expect(m.to).toBe(DESTINATARIO_MCF);
    expect(m.html).toContain('Venditore');
    expect(m.html).toContain('Manc S.r.l.');
    expect(m.html).toContain('Partner del leasing');
    expect(m.html).toContain('Alba Leasing');
    expect(m.html).toContain('Bilancio analitico');
    // Non e' rosso: ne' l'oggetto ne' una riga lo dicono
    expect(m.subject).toBe('Pratica Bergamelli — EDILE ALFA S.R.L. — 50.000 euro');
    expect(m.html).not.toContain('da rivalutare');
  });

  it('con extra e rosso: l\'oggetto finisce con rosso, da rivalutare e la mail ha la riga del semaforo', async () => {
    await creaPratica(sessione() as any, { ...base, ricerca: ricerca(), extra: extra({ rivalutare: true }) });
    const m = mailPratica();
    expect(m.subject).toBe('Pratica Bergamelli — EDILE ALFA S.R.L. — 50.000 euro — rosso, da rivalutare');
    expect(m.html).toContain('Semaforo');
    expect(m.html).toContain('rosso, da rivalutare');
    expect(inserita()!.dati.extra.rivalutare).toBe(true);
  });

  it('noleggio: la riga del partner non c\'e\', il venditore si', async () => {
    await creaPratica(sessione() as any, {
      ...base, prodotto: 'noleggio', ricerca: ricerca(), extra: extra({ partner: null, checklistExtra: [] }),
    });
    const m = mailPratica();
    expect(m.html).toContain('Manc S.r.l.');
    expect(m.html).not.toContain('Partner del leasing');
    expect(inserita()!.dati.checklist).toEqual(buildChecklist('Società di capitali', 50_000, []));
  });

  it('i valori della mail sono scritti con l\'escape', async () => {
    await creaPratica(sessione() as any, { ...base, ricerca: ricerca(), extra: extra({ venditore: '<b>Manc</b> & C.' }) });
    expect(mailPratica().html).toContain('&lt;b&gt;Manc&lt;/b&gt; &amp; C.');
  });
});

// --- creaPraticaMezzi ----------------------------------------------------------

describe('creaPraticaMezzi: la pratica di noleggio', () => {
  it('importo, venditore e durata vengono dal preventivo; la risposta e\' { ok, id }', async () => {
    const r = await creaPraticaMezzi(sessione() as any, corpo({ importo: 1 }));
    expect(r).toEqual({ ok: true, id: expect.stringMatching(/^BG-P-\d{8}-\d{6}$/) });
    const p = inserita()!;
    expect(p.id).toBe((r as { id: string }).id);
    expect(p.fornitore).toBe('bergamelli');
    expect(p.organizzazione).toBe('org-bg');
    expect(p.utente).toBe('u-agente');
    expect(p.propostaId).toBe(ID_PROPOSTA);
    expect(p.piva).toBe(PIVA);
    expect(p.cliente).toBe('EDILE ALFA S.R.L.');
    expect(p.importo).toBe(50_000);
    expect(p.dati).toMatchObject({
      prodotto: 'noleggio',
      durata: 60,
      formaGiuridica: 'Società di capitali',
      referente: { nome: 'Anna Rossi', telefono: '333 1234567', email: 'anna@example.it' },
      iban: IBAN,
      note: 'Consegna a novembre',
      bozza: BOZZA,
      extra: { venditore: 'Manc S.r.l.', partner: null, rivalutare: false, checklistExtra: [] },
    });
    expect(p.dati.checklist).toEqual(buildChecklist('Società di capitali', 50_000, []));
    expect(p.documenti).toEqual([{ nome: 'visura.pdf', pathname: `${CARTELLA}visura.pdf`, size: 100 }]);
    expect(p.storia).toEqual([{ a: 'ricevuta', chi: 'agente', quando: expect.any(String) }]);
    // La verifica eventi viene dal registro: nessuna chiamata a pagamento
    expect(oa.avviaNegativita).not.toHaveBeenCalled();
    expect(p.negativita).toMatchObject({ id: 'ev-1', pronto: true, daRegistro: true });
  });

  it('la mail a MCF dice il venditore e non il partner del leasing', async () => {
    await creaPraticaMezzi(sessione() as any, corpo());
    const m = mailPratica();
    expect(m.to).toBe(DESTINATARIO_MCF);
    expect(m.subject).toBe('Pratica Bergamelli — EDILE ALFA S.R.L. — 50.000 euro');
    expect(m.html).toContain('Manc S.r.l.');
    expect(m.html).toContain('Noleggio operativo, 60 mesi');
    expect(m.html).not.toContain('Partner del leasing');
  });

  it('la durata puo\' arrivare come stringa di cifre', async () => {
    const r = await creaPraticaMezzi(sessione() as any, corpo({ durata: '36' }));
    expect(r.ok).toBe(true);
    expect(inserita()!.dati.durata).toBe(36);
  });

  it('la forma giuridica fuori elenco diventa Altro; i documenti fuori dalla bozza si scartano', async () => {
    await creaPraticaMezzi(sessione() as any, corpo({
      formaGiuridica: 'Cooperativa delle gru',
      documenti: [
        { nome: 'ok.pdf', pathname: `${CARTELLA}ok.pdf`, size: 1 },
        { nome: 'altra.pdf', pathname: `pratiche/bergamelli/bozze/${BOZZA.replace('3f2c', 'aaaa')}/altra.pdf`, size: 1 },
        { nome: 'fuga.pdf', pathname: `${CARTELLA}../../altro/fuga.pdf`, size: 1 },
      ],
    }));
    const p = inserita()!;
    expect(p.dati.formaGiuridica).toBe('Altro');
    expect(p.documenti.map((d: { nome: string }) => d.nome)).toEqual(['ok.pdf']);
  });
});

describe('creaPraticaMezzi: la pratica di leasing', () => {
  it('il partner e la voce del bilancio analitico entrano in pratica; il nome del partner sta solo nella mail', async () => {
    const r = await creaPraticaMezzi(sessione() as any, corpo({ prodotto: 'leasing', leasingChiave: 'C', durata: 72 }));
    expect(r.ok).toBe(true);
    const p = inserita()!;
    expect(p.importo).toBe(50_000);
    expect(p.dati).toMatchObject({
      prodotto: 'leasing',
      durata: 72,
      extra: { venditore: 'Manc S.r.l.', partner: 'Alba Leasing', rivalutare: false, checklistExtra: [VOCE_BILANCIO_ANALITICO] },
    });
    expect(p.dati.checklist.at(-1)).toBe(VOCE_BILANCIO_ANALITICO);
    const m = mailPratica();
    expect(m.html).toContain('Partner del leasing');
    expect(m.html).toContain('Alba Leasing');
    expect(m.html).toContain('Leasing finanziario, 72 mesi');
  });

  it('ogni colonna porta il suo partner', async () => {
    for (const [leasingChiave, nome] of [['A', 'Sella Leasing'], ['B', 'Credem Leasing'], ['C', 'Alba Leasing']]) {
      db.query.mockClear();
      await creaPraticaMezzi(sessione() as any, corpo({ prodotto: 'leasing', leasingChiave, durata: 60 }));
      expect(inserita()!.dati.extra.partner).toBe(nome);
    }
  });

  it('la voce del bilancio analitico c\'e\' anche sotto i 10.000 euro, dove i reddituali non servono', async () => {
    database({ proposta: salvata({ beni: [bene('Gru a torre', 8_000)] }) });
    await creaPraticaMezzi(sessione() as any, corpo({ prodotto: 'leasing', leasingChiave: 'B', durata: 60 }));
    const p = inserita()!;
    expect(p.dati.checklist).toEqual([...buildChecklist('Società di capitali', 8_000, []), VOCE_BILANCIO_ANALITICO]);
  });
});

describe('creaPraticaMezzi: il rosso non blocca', () => {
  it('la pratica parte, marcata da rivalutare nei dati, nell\'oggetto e in una riga della mail', async () => {
    const rossa = salvata(GRU, { ricerca: ricerca('presenti') });
    expect(rossa.semaforo).toBe('rosso');
    database({ proposta: rossa });
    const r = await creaPraticaMezzi(sessione() as any, corpo());
    expect(r).toMatchObject({ ok: true });
    expect(inserita()!.dati.extra.rivalutare).toBe(true);
    const m = mailPratica();
    expect(m.subject).toBe('Pratica Bergamelli — EDILE ALFA S.R.L. — 50.000 euro — rosso, da rivalutare');
    expect(m.html).toContain('rosso, da rivalutare');
  });

  it('un cliente non rosso non e\' marcato', async () => {
    await creaPraticaMezzi(sessione() as any, corpo());
    expect(inserita()!.dati.extra.rivalutare).toBe(false);
    expect(mailPratica().subject).not.toContain('rivalutare');
  });
});

describe('creaPraticaMezzi: senza preventivo o con un preventivo che non regge e\' un errore', () => {
  const nessunaScrittura = () => {
    expect(inserita()).toBeNull();
    expect(posta.inviaMail).not.toHaveBeenCalled();
    expect(oa.avviaNegativita).not.toHaveBeenCalled();
  };

  it('la ricerca non visibile e\' 404 ricerca_non_trovata', async () => {
    database({ ricerca: null });
    expect(await creaPraticaMezzi(sessione() as any, corpo())).toEqual({ ok: false, status: 404, error: 'ricerca_non_trovata' });
    nessunaScrittura();
  });

  it('senza propostaId e\' 400 preventivo_mancante, anche se il browser manda importo, durata e prodotto', async () => {
    for (const propostaId of [undefined, '', '   ', null]) {
      const r = await creaPraticaMezzi(sessione() as any, corpo({ propostaId, importo: 50_000 }));
      expect(r).toEqual({ ok: false, status: 400, error: 'preventivo_mancante' });
    }
    nessunaScrittura();
  });

  it('un preventivo che non esiste, di un altro cliente, di un altro fornitore o di un collega e\' 404 preventivo_non_trovato', async () => {
    const altro = (cambi: Partial<Salvata>) => ({ ...salvata(GRU), ...cambi });
    for (const proposta of [
      null,
      altro({ piva: '99999999999' }),
      altro({ fornitore_slug: 'duplex' }),
      altro({ organization_id: 'org-altra' }),
      altro({ user_id: 'u-collega' }),
      altro({ id: 'BG-20260101-000000' }),
    ]) {
      database({ proposta });
      const r = await creaPraticaMezzi(sessione() as any, corpo());
      expect(r).toEqual({ ok: false, status: 404, error: 'preventivo_non_trovato' });
    }
    nessunaScrittura();
  });

  it('la ricerca del preventivo e\' ristretta a fornitore, partita IVA della ricerca e visibilita\' dell\'utente', async () => {
    await creaPraticaMezzi(sessione('agente') as any, corpo());
    const chiamata = db.queryUna.mock.calls.find(([sql]) => String(sql).includes('FROM app.proposta'))!;
    expect(chiamata[0]).toMatch(/fornitore_slug = \$2/);
    expect(chiamata[0]).toMatch(/piva = \$3/);
    expect(chiamata[1]).toEqual([ID_PROPOSTA, 'bergamelli', PIVA, 'org-bg', 'u-agente']);

    db.queryUna.mockClear();
    await creaPraticaMezzi(sessione('referente') as any, corpo());
    const referente = db.queryUna.mock.calls.find(([sql]) => String(sql).includes('FROM app.proposta'))!;
    expect(referente[1]).toEqual([ID_PROPOSTA, 'bergamelli', PIVA, 'org-bg']);
  });

  it('referente e admin vedono il preventivo di un agente', async () => {
    for (const ruolo of ['referente', 'admin'] as const) {
      db.query.mockClear();
      const r = await creaPraticaMezzi(sessione(ruolo) as any, corpo());
      expect(r.ok).toBe(true);
      expect(inserita()!.utente).toBe(`u-${ruolo}`);
    }
  });

  it('prodotto, partner e durata che il preventivo non aveva sono 400, senza scritture', async () => {
    const casi: [Record<string, unknown>, string][] = [
      [{ prodotto: 'mutuo' }, 'prodotto_non_valido'],
      [{ prodotto: undefined }, 'prodotto_non_valido'],
      [{ prodotto: 'noleggio', durata: 72 }, 'durata_non_valida'],
      [{ prodotto: 'noleggio', durata: 'sessanta' }, 'durata_non_valida'],
      [{ prodotto: 'leasing', durata: 60 }, 'partner_non_valido'],
      [{ prodotto: 'leasing', leasingChiave: 'D', durata: 60 }, 'partner_non_valido'],
      [{ prodotto: 'leasing', leasingChiave: 'A', durata: 24 }, 'durata_non_valida'],
    ];
    for (const [cambi, error] of casi) {
      expect(await creaPraticaMezzi(sessione() as any, corpo(cambi))).toEqual({ ok: false, status: 400, error });
    }
    nessunaScrittura();
  });

  it('un preventivo senza noleggio (mezzo targato) non fa una pratica di noleggio', async () => {
    database({ proposta: salvata(AUTOGRU) });
    expect(await creaPraticaMezzi(sessione() as any, corpo({ prodotto: 'noleggio', durata: 60 })))
      .toEqual({ ok: false, status: 400, error: 'prodotto_non_valido' });
    nessunaScrittura();
  });

  it('un partner sotto il suo minimo non fa una pratica di leasing, gli altri si', async () => {
    database({ proposta: salvata(PICCOLA) });
    expect(await creaPraticaMezzi(sessione() as any, corpo({ prodotto: 'leasing', leasingChiave: 'A', durata: 60 })))
      .toEqual({ ok: false, status: 400, error: 'partner_non_valido' });
    nessunaScrittura();
    expect((await creaPraticaMezzi(sessione() as any, corpo({ prodotto: 'leasing', leasingChiave: 'B', durata: 60 }))).ok).toBe(true);
  });

  it('cellulare, email e IBAN sono obbligatori: 400 col messaggio, come sul percorso generico', async () => {
    const casi: [Record<string, unknown>, string][] = [
      [{ referente: { nome: 'Anna', telefono: '', email: 'anna@example.it' } }, 'cellulare_mancante'],
      [{ referente: { nome: 'Anna', telefono: '12', email: 'anna@example.it' } }, 'cellulare_non_valido'],
      [{ referente: { nome: 'Anna', telefono: '333 1234567', email: '' } }, 'email_mancante'],
      [{ referente: { nome: 'Anna', telefono: '333 1234567', email: 'anna.example.it' } }, 'email_non_valida'],
      [{ referente: undefined }, 'cellulare_mancante'],
      [{ iban: '' }, 'iban_mancante'],
      [{ iban: 'IT60X0542811101000000123457' }, 'iban_non_valido'],
    ];
    for (const [cambi, error] of casi) {
      const r = await creaPraticaMezzi(sessione() as any, corpo(cambi));
      expect(r).toEqual({ ok: false, status: 400, error, messaggio: expect.any(String) });
    }
    nessunaScrittura();
  });

  it('la bozza deve essere un identificativo valido', async () => {
    for (const bozza of [undefined, '', 'bozza', '../..', BOZZA.toUpperCase().replace(/[A-F]/g, 'Z')]) {
      expect(await creaPraticaMezzi(sessione() as any, corpo({ bozza }))).toEqual({ ok: false, status: 400, error: 'bozza_non_valida' });
    }
    nessunaScrittura();
  });

  it('un preventivo rovinato nel database e\' un 400 e non un\'eccezione', async () => {
    for (const rovinato of [
      { ...salvata(GRU), numeri: null, dati: null },
      { ...salvata(GRU), numeri: 'testo', dati: 42 },
      { ...salvata(GRU), prezzo: 'abc' },
      { ...salvata(GRU), prezzo: '0.00' },
    ]) {
      database({ proposta: rovinato as Salvata });
      const r = await creaPraticaMezzi(sessione() as any, corpo());
      expect(r).toEqual({ ok: false, status: 400, error: 'prodotto_non_valido' });
    }
    nessunaScrittura();
  });
});

// --- /api/motore/pratica sul settore mezzi --------------------------------------

describe('/api/motore/pratica sul settore mezzi', () => {
  it('la risposta e\' solo { ok, id } e non nomina nessun partner', async () => {
    const r = await post(corpo({ prodotto: 'leasing', leasingChiave: 'C', durata: 60 }));
    expect(r.status).toBe(200);
    const testo = await r.text();
    const risposta = JSON.parse(testo);
    expect(Object.keys(risposta).sort()).toEqual(['id', 'ok']);
    expect(risposta).toEqual({ ok: true, id: expect.stringMatching(/^BG-P-/) });
    for (const vietata of ['alba', 'sella', 'credem', 'grenke', 'econocom', 'partner', 'spread', 'extra', 'venditore', 'rivalutare', 'semaforo']) {
      expect(testo.toLowerCase()).not.toContain(vietata);
    }
  });

  it('la sessione si chiede col permesso di creare un preventivo', async () => {
    await post(corpo());
    expect(motore.sessioneMotore).toHaveBeenCalledWith(expect.anything(), 'bergamelli', { permesso: { preventivo: ['crea'] } });
  });

  it('non arriva mai al percorso generico: con importo nel corpo e senza preventivo non si scrive niente', async () => {
    const r = await post(corpo({ propostaId: undefined, importo: 5_000 }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'preventivo_mancante' });
    expect(inserita()).toBeNull();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  it('con preventivo e importo nel corpo, la pratica ha l\'importo del preventivo', async () => {
    const r = await post(corpo({ importo: 1, prodotto: 'noleggio' }));
    expect(r.status).toBe(200);
    expect(inserita()!.importo).toBe(50_000);
    expect(mailPratica().subject).toContain('50.000 euro');
  });

  it('un preventivo che il percorso generico avrebbe lasciato cadere qui ferma la richiesta', async () => {
    // Sul percorso generico un preventivo non trovato diventa "nessun preventivo": qui e' un 404
    database({ proposta: null });
    const r = await post(corpo());
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false, error: 'preventivo_non_trovato' });
    expect(inserita()).toBeNull();
  });

  it('gli errori hanno il loro stato e dicono solo il codice (e il messaggio dei dati del cliente)', async () => {
    const casi: [Record<string, unknown>, number, string][] = [
      [{ ricercaId: 'r-x' }, 404, 'ricerca_non_trovata'],
      [{ propostaId: '' }, 400, 'preventivo_mancante'],
      [{ prodotto: 'altro' }, 400, 'prodotto_non_valido'],
      [{ durata: 7 }, 400, 'durata_non_valida'],
      [{ prodotto: 'leasing', durata: 60 }, 400, 'partner_non_valido'],
      [{ bozza: 'no' }, 400, 'bozza_non_valida'],
    ];
    for (const [cambi, status, error] of casi) {
      if (cambi.ricercaId) database({ ricerca: null });
      else database();
      const r = await post(corpo(cambi));
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ ok: false, error });
    }
    const dati = await post(corpo({ iban: 'IT00' }));
    expect(dati.status).toBe(400);
    expect(await dati.json()).toEqual({ ok: false, error: 'iban_non_valido', messaggio: expect.any(String) });
  });

  it('un errore del salvataggio e\' un 500 che non dice niente', async () => {
    db.query.mockImplementation(async () => { throw new Error('neon giu: sella credem'); });
    const errore = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await post(corpo());
    errore.mockRestore();
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: 'pratica_non_riuscita' });
  });

  it('un corpo che non e\' JSON resta invalid_json', async () => {
    const r = await inviaPratica({ request: new Request('https://www.example.it/api/motore/pratica', { method: 'POST', body: 'no' }) });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'invalid_json' });
  });
});

describe('/api/motore/pratica sugli altri settori', () => {
  it('distinta: tutta la richiesta passa da creaPraticaDistinta, il settore mezzi non c\'entra', async () => {
    motore.sessioneMotore.mockResolvedValue(sessione('agente', bergamelli({ slug: 'led-office', prefisso: 'LO', settore: 'distinta' })));
    const r = await post({ f: 'led-office', ricercaId: 'r-1', propostaId: 'LO-1', segnalazione: false });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: 'LO-P-1', segnalazione: false });
    expect(distinta.creaPraticaDistinta).toHaveBeenCalledTimes(1);
    // Il settore mezzi avrebbe cercato la ricerca e il preventivo nel database
    expect(db.queryUna).not.toHaveBeenCalled();
  });

  it('i mezzi non passano da creaPraticaDistinta', async () => {
    await post(corpo());
    expect(distinta.creaPraticaDistinta).not.toHaveBeenCalled();
  });

  it('macchine (Duplex): resta il percorso di sempre, importo dal browser e preventivo facoltativo', async () => {
    motore.sessioneMotore.mockResolvedValue(sessione('agente', bergamelli({ slug: 'duplex', prefisso: 'DX', settore: 'macchine' })));
    const r = await post({
      f: 'duplex', ricercaId: 'r-1', bozza: BOZZA, prodotto: 'noleggio', durata: 36, importo: 5_000,
      formaGiuridica: 'Società di capitali',
      referente: { nome: 'Anna', telefono: '333 1234567', email: 'anna@example.it' }, iban: IBAN,
      documenti: [{ nome: 'ci.pdf', pathname: `pratiche/duplex/bozze/${BOZZA}/ci.pdf`, size: 1 }],
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: expect.stringMatching(/^DX-P-/) });
    const p = inserita()!;
    expect(p.importo).toBe(5_000);
    expect(p.propostaId).toBeNull();
    expect(p.dati).not.toHaveProperty('extra');
    expect(distinta.creaPraticaDistinta).not.toHaveBeenCalled();
  });

  it('macchine con un preventivo non trovato: il preventivo cade e la pratica parte lo stesso, come prima', async () => {
    motore.sessioneMotore.mockResolvedValue(sessione('agente', bergamelli({ slug: 'duplex', prefisso: 'DX', settore: 'macchine' })));
    database({ proposta: null });
    const r = await post({
      f: 'duplex', ricercaId: 'r-1', propostaId: 'DX-1', bozza: BOZZA, prodotto: 'noleggio', durata: 36, importo: 5_000,
      formaGiuridica: 'Società di capitali',
      referente: { nome: 'Anna', telefono: '333 1234567', email: 'anna@example.it' }, iban: IBAN, documenti: [],
    });
    expect(r.status).toBe(200);
    expect(inserita()!.propostaId).toBeNull();
  });
});
