// I segnali che il server legge prima del prefiltro: cliente segnalato da MCF e
// pratica recente (regola 9, spec mcf_spec-ledoffice-motore_v1, paragrafo 5).
// La finestra dei sei mesi si conta sulle date di calendario, estremo compreso.
// Database e Blob sono finti: qui si prova la logica, non le connessioni.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
const blob = vi.hoisted(() => ({ leggiPratiche: vi.fn() }));
vi.mock('../db', () => ({ query: db.query, queryUna: vi.fn(), env: vi.fn() }));
vi.mock('../pratiche-nominali', () => ({ leggiPratiche: blob.leggiPratiche }));

import type { Carrozzeria } from './carrozzeria';
import type { PraticaTrovata } from './prefiltro';
import {
  azzeraIndicePortali,
  praticaPiuRecente,
  praticheDaRecord,
  regoleConEventi,
  segnaliPrefiltro,
} from './segnali-prefiltro';

const OGGI = new Date(2026, 9, 20);
const p = (data: string, fonte: PraticaTrovata['fonte'] = 'esterna'): PraticaTrovata =>
  ({ data, canale: null, fornitore: null, fonte });

describe('pratica piu\' recente', () => {
  it('la piu\' recente entro sei mesi', () => {
    expect(praticaPiuRecente([
      { data: '2026-03-01', canale: 'pagarent', fornitore: 'x', fonte: 'esterna' },
      { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' },
    ], OGGI)!.data).toBe('2026-07-28');
    expect(praticaPiuRecente([{ data: '2026-04-19', canale: null, fornitore: null, fonte: 'portale' }], OGGI)).toBeNull();
  });
  it('esattamente sei mesi fa e\' ancora recente', () => {
    expect(praticaPiuRecente([p('2026-04-20')], OGGI)!.data).toBe('2026-04-20');
  });
  it('a fine mese il limite cade sull\'ultimo giorno del mese, non sfora nel successivo', () => {
    const fineAgosto = new Date(2026, 7, 31);
    expect(praticaPiuRecente([p('2026-02-28')], fineAgosto)!.data).toBe('2026-02-28');
    expect(praticaPiuRecente([p('2026-02-27')], fineAgosto)).toBeNull();
  });
  it('vale l\'ora del giorno di oggi: conta la data, non le ore', () => {
    expect(praticaPiuRecente([p('2026-04-20')], new Date(2026, 9, 20, 23, 59))!.data).toBe('2026-04-20');
  });
  it('nessuna pratica, nessun segnale', () => expect(praticaPiuRecente([], OGGI)).toBeNull());
  it('una finestra diversa si passa in mesi', () => {
    expect(praticaPiuRecente([p('2026-06-01')], OGGI, 3)).toBeNull();
    expect(praticaPiuRecente([p('2026-07-20')], OGGI, 3)!.data).toBe('2026-07-20');
  });
  it('una data illeggibile non conta', () => {
    expect(praticaPiuRecente([p(''), p('28/07/2026')], OGGI)).toBeNull();
  });
});

describe('pratiche dei portali su Blob', () => {
  it('partita IVA ripulita, data italiana di creato, fornitore = slug, canale ignoto', () => {
    const r = praticheDaRecord('stilo', [
      { id: 'ST-20260728-013000', creato: '2026-07-27T23:30:00.000Z', cliente: { piva: 'IT 01234567890' } },
    ]);
    expect(r).toEqual([{ piva: '01234567890', pratica: { data: '2026-07-28', canale: null, fornitore: 'stilo', fonte: 'portale' } }]);
  });
  it('senza creato la data viene dall\'id', () => {
    expect(praticheDaRecord('expo-energia', [{ id: 'EE-20260723-101500', cliente: { piva: '01234567890' } }])[0].pratica.data)
      .toBe('2026-07-23');
  });
  it('codice fiscale al posto della partita IVA, o niente data: si scarta', () => {
    expect(praticheDaRecord('unidima', [
      { id: 'UD-20260801-100000', creato: '2026-08-01T08:00:00.000Z', cliente: { piva: 'RSSMRA80A01H501U' } },
      { id: 'senza-data', cliente: { piva: '01234567890' } },
      { id: 'UD-20260801-100001', creato: '2026-08-01T08:00:00.000Z' },
    ])).toEqual([]);
  });
});

describe('quali regole fanno partire gli eventi alla ricerca', () => {
  const k = (regoleSemaforo: Carrozzeria['regoleSemaforo']) => ({ regoleSemaforo }) as Carrozzeria;
  it('locatore e prefiltro si, credit policy no', () => {
    expect(regoleConEventi(k('locatore'))).toBe(true);
    expect(regoleConEventi(k('prefiltro'))).toBe(true);
    expect(regoleConEventi(k('credit-policy'))).toBe(false);
  });
});

describe('lettura dei segnali', () => {
  const PIVA = '01234567890';
  let avvisi: ReturnType<typeof vi.spyOn>;
  let errori: ReturnType<typeof vi.spyOn>;

  // Le tre query in ordine: cliente segnalato, app.pratica, app.pratica_esterna
  function risposte(segnalato: unknown[], motore: unknown[], esterna: unknown[]) {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.cliente_segnalato')) return segnalato;
      if (sql.includes('app.pratica_esterna')) return esterna;
      if (sql.includes('app.pratica')) return motore;
      throw new Error(`query inattesa: ${sql}`);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
    azzeraIndicePortali();
    db.query.mockReset();
    blob.leggiPratiche.mockReset();
    blob.leggiPratiche.mockResolvedValue([]);
    avvisi = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errori = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    avvisi.mockRestore();
    errori.mockRestore();
  });

  it('cliente pulito: nessun segnale', async () => {
    risposte([], [], []);
    expect(await segnaliPrefiltro(PIVA)).toEqual({ segnalato: null, praticaRecente: null });
  });

  it('cliente segnalato: motivo ed effetto', async () => {
    risposte([{ motivo: 'insoluto', effetto: 'blocco' }], [], []);
    expect((await segnaliPrefiltro(PIVA)).segnalato).toEqual({ motivo: 'insoluto', effetto: 'blocco' });
  });

  it('la pratica piu\' recente fra motore, portali e storico importato', async () => {
    risposte(
      [],
      [{ data: '2026-06-10', canale: null, fornitore_slug: 'duplex' }],
      [{ data: '2026-07-28', canale: 'pagarent', fornitore_slug: 'led-office' }],
    );
    blob.leggiPratiche.mockImplementation(async (slug: string) => slug === 'stilo'
      ? [{ id: 'ST-20260801-100000', creato: '2026-08-01T08:00:00.000Z', cliente: { piva: PIVA } }]
      : []);
    expect((await segnaliPrefiltro(PIVA)).praticaRecente)
      .toEqual({ data: '2026-08-01', canale: null, fornitore: 'stilo', fonte: 'portale' });
  });

  it('una pratica del motore su qualunque fornitore conta', async () => {
    risposte([], [{ data: '2026-09-01', canale: 'pagarent', fornitore_slug: 'duplex' }], []);
    expect((await segnaliPrefiltro(PIVA)).praticaRecente)
      .toEqual({ data: '2026-09-01', canale: 'pagarent', fornitore: 'duplex', fonte: 'motore' });
  });

  it('il cliente segnalato che non si legge non ferma la verifica, ma resta nei log', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.cliente_segnalato')) throw new Error('relation does not exist');
      return [];
    });
    expect(await segnaliPrefiltro(PIVA)).toEqual({ segnalato: null, praticaRecente: null });
    expect(errori.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')).toContain('motore_segnalato_errore');
  });

  it('una fonte delle pratiche che non risponde vale come vuota, con un avviso', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.cliente_segnalato')) return [];
      if (sql.includes('app.pratica_esterna')) return [{ data: '2026-07-28', canale: 'pagarent', fornitore_slug: 'led-office' }];
      throw new Error('timeout');
    });
    blob.leggiPratiche.mockRejectedValue(new Error('blob_non_configurato'));
    expect((await segnaliPrefiltro(PIVA)).praticaRecente)
      .toEqual({ data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' });
    expect(avvisi.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')).toContain('motore_segnali_errore');
  });

  it('l\'indice dei portali vive 60 secondi', async () => {
    risposte([], [], []);
    await segnaliPrefiltro(PIVA);
    const letture = blob.leggiPratiche.mock.calls.length;
    expect(letture).toBeGreaterThan(0);
    await segnaliPrefiltro(PIVA);
    expect(blob.leggiPratiche.mock.calls.length).toBe(letture);
    vi.setSystemTime(new Date(2026, 9, 20, 10, 1, 1));
    await segnaliPrefiltro(PIVA);
    expect(blob.leggiPratiche.mock.calls.length).toBe(2 * letture);
  });

  it('un indice letto a meta\' non si tiene in memoria', async () => {
    risposte([], [], []);
    blob.leggiPratiche.mockRejectedValueOnce(new Error('timeout'));
    await segnaliPrefiltro(PIVA);
    const letture = blob.leggiPratiche.mock.calls.length;
    await segnaliPrefiltro(PIVA);
    expect(blob.leggiPratiche.mock.calls.length).toBe(2 * letture);
  });
});
