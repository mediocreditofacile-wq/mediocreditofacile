// /api/motore/storico: i preventivi del settore mezzi portano le colonne che servono alla
// pratica. Sessione e database finti.
//
// Il punto: la pratica dei mezzi parte da un preventivo salvato, anche fatto ieri o in
// un'altra sessione, e la pagina deve sapere che cosa quel preventivo offriva. Dallo
// schermo salvato (app.proposta.numeri) escono le durate del noleggio, chiave, nome,
// motivo e durate di ogni colonna del leasing e la ragione sociale del venditore: mai
// `dati`, che ha la mappa colonna -> partner, mai rate, spese o totali. Sugli altri
// settori la query e la risposta restano quelle di prima, carattere per carattere.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
const motore = vi.hoisted(() => ({ sessioneMotore: vi.fn() }));

vi.mock('../db', async (originale) => ({
  ...(await originale<typeof import('../db')>()),
  query: db.query,
}));
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: motore.sessioneMotore,
}));

import { GET } from '../../pages/api/motore/storico';
import { colonneMezziStorico } from './storico-mezzi';

type Ruolo = 'admin' | 'referente' | 'agente';
const sessione = (settore: string, ruolo: Ruolo = 'agente') => ({
  ok: true,
  contesto: { userId: `u-${ruolo}`, email: `${ruolo}@example.it`, nome: ruolo, ruolo, organizationId: 'org-1' },
  carrozzeria: { slug: `prova-${settore}`, settore, prezzoVerifica: null },
  vedeTutto: ruolo !== 'agente',
});

// La query dei preventivi com'era prima dei mezzi: sugli altri settori non cambia
const SQL_PROPOSTE_DI_SEMPRE = `SELECT x.id, x.ricerca_id, x.piva, x.cliente_nome, x.descrizione, x.prezzo, x.semaforo,
              x.numeri->'scelta' AS scelta, x.documenti, x.pdf_pronti, x.creato, u.name AS agente_nome
         FROM app.proposta x JOIN "user" u ON u.id = x.user_id
        WHERE x.organization_id = $1 AND x.user_id = $2 ORDER BY x.creato DESC LIMIT 200`;

/** Lo schermo salvato di un preventivo di mezzi: le cifre che la pratica non deve portarsi dietro */
const NOLEGGIO_SALVATO = {
  rate: [{ durata: 24, canone: 2_301.17 }, { durata: 36, canone: 1_611.43 }, { durata: 60, canone: 1_017.89 }],
  durataEvidenza: 60,
  nota: 'Fatturazione trimestrale anticipata.',
  daConfermare: false,
};
const riga = (durata: number, rata: number) => ({
  durata, rata, numRate: durata - 1, anticipo: 4_850, anticipoPerc: 10, riscatto: 485, riscattoPerc: 1,
  speseIstruttoria: 380, speseIncassoRata: 6, spese: 380 + 6 * (durata - 1), totale: 55_123.45,
});
const LEASING_SALVATO = [
  { chiave: 'A', nome: 'Sella Leasing', motivo: null, righe: [riga(36, 1_398.76), riga(60, 877.65)] },
  { chiave: 'B', nome: null, motivo: 'Sotto il minimo di 9.000 euro.', righe: [] },
];

/** Le righe che il database restituisce: per i mezzi anche le tre colonne in piu' */
const PROPOSTA = {
  id: 'EB-20261023-100000', ricerca_id: 'r-1', piva: '01234567890', cliente_nome: 'EDILE ALFA S.R.L.',
  descrizione: 'Gru Potain MDT 219', prezzo: '48500.00', semaforo: 'verde-chiaro',
  scelta: { durata: 60, canone: 1_017.89, rataLeasing: 877.65 },
  documenti: [{ nome: 'preventivo-noleggio-EB-20261023-100000.pdf', pathname: 'preventivi/bergamelli/x.pdf' }],
  pdf_pronti: true, creato: '2026-10-23T09:00:00.000Z', agente_nome: 'Enrico',
};
const PROPOSTA_MEZZI = { ...PROPOSTA, noleggio: NOLEGGIO_SALVATO, leasing: LEASING_SALVATO, venditore: 'MANC SRL' };

function rispondi(proposte: unknown[]) {
  db.query.mockImplementation(async (sql: string) => (String(sql).includes('FROM app.proposta') ? proposte : []));
}

async function leggi(settore: string, ruolo: Ruolo = 'agente') {
  motore.sessioneMotore.mockResolvedValueOnce(sessione(settore, ruolo));
  const r = await GET({ request: new Request(`https://www.example.it/api/motore/storico?f=prova-${settore}`) });
  expect(r.status).toBe(200);
  const sql = db.query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('FROM app.proposta'))!;
  return { corpo: (await r.json()) as { proposte: Record<string, unknown>[] }, sql };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/api/motore/storico sul settore mezzi', () => {
  it('la query legge noleggio, leasing e venditore dallo schermo salvato, mai `dati`', async () => {
    rispondi([PROPOSTA_MEZZI]);
    for (const ruolo of ['agente', 'referente', 'admin'] as const) {
      db.query.mockClear();
      const { sql } = await leggi('mezzi', ruolo);
      expect(sql).toContain("x.numeri->'noleggio' AS noleggio");
      expect(sql).toContain("x.numeri->'leasing' AS leasing");
      expect(sql).toContain("x.numeri->'venditore'->>'ragioneSociale' AS venditore");
      expect(sql).not.toMatch(/x\.dati|x\.canale|\*/);
      // Dello schermo salvato solo queste tre parti e la scelta di sempre, mai la colonna intera
      expect(sql).not.toMatch(/x\.numeri(?!->'(scelta|noleggio|leasing|venditore)')/);
    }
  });

  it('di ogni preventivo escono solo le durate, le colonne con nome e motivo, e il venditore', async () => {
    rispondi([PROPOSTA_MEZZI]);
    const { corpo } = await leggi('mezzi');
    expect(corpo.proposte).toEqual([{
      ...PROPOSTA,
      noleggio: { durate: [24, 36, 60] },
      leasing: [
        { chiave: 'A', nome: 'Sella Leasing', motivo: null, durate: [36, 60] },
        { chiave: 'B', nome: null, motivo: 'Sotto il minimo di 9.000 euro.', durate: [] },
      ],
      venditore: 'MANC SRL',
    }]);
  });

  it('nessuna rata, spesa o totale del preventivo nella risposta', async () => {
    rispondi([PROPOSTA_MEZZI]);
    const { corpo } = await leggi('mezzi');
    const { noleggio, leasing } = corpo.proposte[0];
    const testo = JSON.stringify({ noleggio, leasing });
    for (const parola of ['canone', 'rata', 'spese', 'totale', 'anticipo', 'riscatto', 'nota', '2301', '877', '55123', 'partner']) {
      expect(testo, parola).not.toContain(parola);
    }
  });

  it('i nomi dei partner come sono salvati: spenti restano null', async () => {
    rispondi([{ ...PROPOSTA_MEZZI, leasing: LEASING_SALVATO.map((c) => ({ ...c, nome: null })) }]);
    const { corpo } = await leggi('mezzi');
    expect((corpo.proposte[0].leasing as { nome: unknown }[]).map((c) => c.nome)).toEqual([null, null]);
  });

  it('senza noleggio salvato (mezzo targato) il noleggio e\' null; un preventivo rovinato non rompe la lista', async () => {
    rispondi([
      { ...PROPOSTA_MEZZI, noleggio: null },
      { ...PROPOSTA_MEZZI, id: 'EB-2', noleggio: 'x', leasing: { chiave: 'A' }, venditore: 7 },
    ]);
    const { corpo } = await leggi('mezzi');
    expect(corpo.proposte[0].noleggio).toBeNull();
    expect(corpo.proposte[1]).toMatchObject({ id: 'EB-2', noleggio: null, leasing: [], venditore: null });
  });
});

describe('/api/motore/storico sugli altri settori: niente cambia', () => {
  for (const settore of ['distinta', 'macchine', 'generico', 'fotovoltaico']) {
    it(`${settore}: la stessa query e le stesse righe di prima`, async () => {
      rispondi([PROPOSTA]);
      const { corpo, sql } = await leggi(settore);
      expect(sql.trim()).toBe(SQL_PROPOSTE_DI_SEMPRE);
      expect(corpo.proposte).toEqual([PROPOSTA]);
    });
  }
});

describe('colonneMezziStorico', () => {
  it('una colonna senza chiave si scarta, durate che non sono numeri non contano', () => {
    expect(colonneMezziStorico({
      noleggio: { rate: [{ durata: 36 }, { durata: '48' }, null, { durata: 60 }] },
      leasing: [{ nome: 'Sella Leasing', righe: [{ durata: 36 }] }, { chiave: 'B', righe: [{ durata: 48 }, { durata: Number.NaN }] }],
      venditore: 'NOL SYSTEM ITALIA SRL',
    })).toEqual({
      noleggio: { durate: [36, 60] },
      leasing: [{ chiave: 'B', nome: null, motivo: null, durate: [48] }],
      venditore: 'NOL SYSTEM ITALIA SRL',
    });
  });

  it('un noleggio senza rate e\' nessun noleggio', () => {
    expect(colonneMezziStorico({ noleggio: { rate: [] }, leasing: [], venditore: null }).noleggio).toBeNull();
  });
});
