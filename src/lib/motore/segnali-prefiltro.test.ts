// I segnali che il server legge prima del prefiltro: cliente segnalato da MCF e
// pratica recente (regola 9, spec mcf_spec-ledoffice-motore_v1, paragrafo 5).
// La finestra dei sei mesi si conta sulle date del calendario italiano, estremo
// compreso, e conta solo le pratiche nate prima della verifica (Ruling 11).
// Database e Blob sono finti: qui si prova la logica, non le connessioni.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn() }));
const blob = vi.hoisted(() => ({ leggiPratiche: vi.fn() }));
vi.mock('../db', () => ({ query: db.query, queryUna: vi.fn(), env: vi.fn() }));
vi.mock('../pratiche-nominali', () => ({ leggiPratiche: blob.leggiPratiche }));

import type { Carrozzeria } from './carrozzeria';
import type { PraticaTrovata, SegnaliPrefiltro } from './prefiltro';
import {
  azzeraIndicePortali,
  natePrima,
  praticaPiuRecente,
  praticheDaRecord,
  regoleConEventi,
  salvaSegnali,
  segnaliPrefiltro,
  unisciSegnali,
  type LetturaSegnali,
} from './segnali-prefiltro';

// A mezzogiorno locale: la data italiana e' la stessa in ogni fuso del mondo abitato
const OGGI = new Date(2026, 9, 20, 12);
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
    const fineAgosto = new Date(2026, 7, 31, 12);
    expect(praticaPiuRecente([p('2026-02-28')], fineAgosto)!.data).toBe('2026-02-28');
    expect(praticaPiuRecente([p('2026-02-27')], fineAgosto)).toBeNull();
  });
  it('conta il giorno italiano, non quello del server', () => {
    // 22:30 UTC del 20 ottobre = 00:30 del 21 in Italia: il limite e' il 21 aprile
    expect(praticaPiuRecente([p('2026-04-20')], new Date('2026-10-20T22:30:00Z'))).toBeNull();
    // 22:30 UTC del 19 ottobre = 00:30 del 20 in Italia: il limite e' il 20 aprile
    expect(praticaPiuRecente([p('2026-04-20')], new Date('2026-10-19T22:30:00Z'))!.data).toBe('2026-04-20');
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

describe('solo le pratiche nate prima della verifica', () => {
  const VERIFICA = new Date('2026-10-20T08:00:00Z'); // 10:00 in Italia
  it('con l\'istante: strettamente prima', () => {
    expect(natePrima([
      { pratica: p('2026-10-20', 'portale'), creato: '2026-10-20T07:59:59.000Z' },
      { pratica: p('2026-10-20', 'portale'), creato: '2026-10-20T08:00:00.000Z' },
      { pratica: p('2026-10-20', 'portale'), creato: '2026-10-20T09:00:00.000Z' },
    ], VERIFICA)).toHaveLength(1);
  });
  it('la pratica mandata dopo la verifica, lo stesso giorno, non conta', () => {
    expect(natePrima([{ pratica: p('2026-10-20', 'portale'), creato: '2026-10-20T14:00:00.000Z' }], VERIFICA)).toEqual([]);
  });
  it('senza istante conta solo se il giorno e\' prima di quello della verifica', () => {
    expect(natePrima([
      { pratica: p('2026-10-19'), creato: null },
      { pratica: p('2026-10-20'), creato: null },
    ], VERIFICA)).toEqual([p('2026-10-19')]);
  });
});

describe('pratiche dei portali su Blob', () => {
  it('partita IVA ripulita, data italiana e istante di creato, fornitore = slug, canale ignoto', () => {
    const r = praticheDaRecord('stilo', [
      { id: 'ST-20260728-013000', creato: '2026-07-27T23:30:00.000Z', cliente: { piva: 'IT 01234567890' } },
    ]);
    expect(r).toEqual([{
      piva: '01234567890',
      pratica: { data: '2026-07-28', canale: null, fornitore: 'stilo', fonte: 'portale' },
      creato: '2026-07-27T23:30:00.000Z',
    }]);
  });
  it('senza creato la data viene dall\'id, l\'istante resta ignoto', () => {
    const [r] = praticheDaRecord('expo-energia', [{ id: 'EE-20260723-101500', cliente: { piva: '01234567890' } }]);
    expect(r.pratica.data).toBe('2026-07-23');
    expect(r.creato).toBeNull();
  });
  it('codice fiscale al posto della partita IVA, o niente data: si scarta', () => {
    expect(praticheDaRecord('unidima', [
      { id: 'UD-20260801-100000', creato: '2026-08-01T08:00:00.000Z', cliente: { piva: 'RSSMRA80A01H501U' } },
      { id: 'senza-data', cliente: { piva: '01234567890' } },
      { id: 'UD-20260801-100001', creato: '2026-08-01T08:00:00.000Z' },
    ])).toEqual([]);
  });
});

describe('rileggendo: una fonte caduta non cancella il salvato', () => {
  const BLOCCO: SegnaliPrefiltro['segnalato'] = { motivo: 'insoluto', effetto: 'blocco' };
  const LUGLIO = { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' } as PraticaTrovata;
  const SETTEMBRE = { data: '2026-09-01', canale: null, fornitore: 'duplex', fonte: 'motore' } as PraticaTrovata;
  const SALVATI: SegnaliPrefiltro = { segnalato: BLOCCO, praticaRecente: LUGLIO };
  const letti = (segnali: SegnaliPrefiltro, segnalato = false, pratiche = false): LetturaSegnali =>
    ({ segnali, fallite: { segnalato, pratiche } });
  const VUOTI: SegnaliPrefiltro = { segnalato: null, praticaRecente: null };

  it('fonti tutte buone: vale la lettura nuova, anche se toglie qualcosa', () => {
    expect(unisciSegnali(letti(VUOTI), SALVATI)).toEqual(VUOTI);
  });
  it('cliente segnalato caduto: resta il blocco salvato', () => {
    expect(unisciSegnali(letti(VUOTI, true), SALVATI)).toEqual({ segnalato: BLOCCO, praticaRecente: null });
  });
  it('pratiche cadute: resta la piu\' recente fra salvata e letta', () => {
    expect(unisciSegnali(letti(VUOTI, false, true), SALVATI).praticaRecente).toEqual(LUGLIO);
    expect(unisciSegnali(letti({ segnalato: null, praticaRecente: SETTEMBRE }, false, true), SALVATI).praticaRecente)
      .toEqual(SETTEMBRE);
  });
  it('niente di salvato: vale la lettura', () => {
    expect(unisciSegnali(letti(VUOTI, true, true), null)).toEqual(VUOTI);
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
  const PRIMA = new Date('2026-10-20T08:00:00Z');
  let avvisi: ReturnType<typeof vi.spyOn>;
  let errori: ReturnType<typeof vi.spyOn>;
  const log = (spia: ReturnType<typeof vi.spyOn>) => spia.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

  // Le tre query: cliente segnalato, app.pratica, app.pratica_esterna
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
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
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

  it('cliente pulito: nessun segnale, nessuna fonte caduta', async () => {
    risposte([], [], []);
    expect(await segnaliPrefiltro(PIVA, PRIMA)).toEqual({
      segnali: { segnalato: null, praticaRecente: null },
      fallite: { segnalato: false, pratiche: false },
    });
  });

  it('cliente segnalato: motivo ed effetto', async () => {
    risposte([{ motivo: 'insoluto', effetto: 'blocco' }], [], []);
    expect((await segnaliPrefiltro(PIVA, PRIMA)).segnali.segnalato).toEqual({ motivo: 'insoluto', effetto: 'blocco' });
  });

  it('le query delle pratiche portano il limite della verifica', async () => {
    risposte([], [], []);
    await segnaliPrefiltro(PIVA, PRIMA);
    const chiamate = db.query.mock.calls as [string, unknown[]][];
    const motore = chiamate.find(([sql]) => sql.includes('FROM app.pratica WHERE'))!;
    const esterna = chiamate.find(([sql]) => sql.includes('app.pratica_esterna'))!;
    expect(motore[0]).toContain('creato < $2');
    expect(motore[1]).toEqual([PIVA, '2026-10-20T08:00:00.000Z']);
    expect(esterna[0]).toContain('data < $2');
    expect(esterna[1]).toEqual([PIVA, '2026-10-20']);
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
    expect((await segnaliPrefiltro(PIVA, PRIMA)).segnali.praticaRecente)
      .toEqual({ data: '2026-08-01', canale: null, fornitore: 'stilo', fonte: 'portale' });
  });

  it('una pratica dei portali nata dopo la verifica non conta, una nata prima si', async () => {
    risposte([], [], []);
    blob.leggiPratiche.mockImplementation(async (slug: string) => slug === 'stilo'
      ? [
        { id: 'ST-20261020-160000', creato: '2026-10-20T14:00:00.000Z', cliente: { piva: PIVA } },
        { id: 'ST-20261020-090000', creato: '2026-10-20T07:00:00.000Z', cliente: { piva: PIVA } },
      ]
      : []);
    expect((await segnaliPrefiltro(PIVA, PRIMA)).segnali.praticaRecente)
      .toEqual({ data: '2026-10-20', canale: null, fornitore: 'stilo', fonte: 'portale' });
    // La stessa ricerca riaperta con un limite piu' vecchio: nessuna delle due
    expect((await segnaliPrefiltro(PIVA, new Date('2026-10-20T06:00:00Z'))).segnali.praticaRecente).toBeNull();
  });

  it('una pratica del motore su qualunque fornitore conta', async () => {
    risposte([], [{ data: '2026-09-01', canale: 'pagarent', fornitore_slug: 'duplex' }], []);
    expect((await segnaliPrefiltro(PIVA, PRIMA)).segnali.praticaRecente)
      .toEqual({ data: '2026-09-01', canale: 'pagarent', fornitore: 'duplex', fonte: 'motore' });
  });

  it('il cliente segnalato che non si legge non ferma la verifica, ma resta nei log e risulta caduto', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.cliente_segnalato')) throw new Error('relation does not exist');
      return [];
    });
    expect(await segnaliPrefiltro(PIVA, PRIMA)).toEqual({
      segnali: { segnalato: null, praticaRecente: null },
      fallite: { segnalato: true, pratiche: false },
    });
    expect(log(errori)).toContain('motore_segnalato_errore');
  });

  it('una fonte delle pratiche che non risponde vale come vuota, con un avviso', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('app.cliente_segnalato')) return [];
      if (sql.includes('app.pratica_esterna')) return [{ data: '2026-07-28', canale: 'pagarent', fornitore_slug: 'led-office' }];
      throw new Error('timeout');
    });
    blob.leggiPratiche.mockRejectedValue(new Error('blob_non_configurato'));
    const l = await segnaliPrefiltro(PIVA, PRIMA);
    expect(l.segnali.praticaRecente).toEqual({ data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' });
    expect(l.fallite).toEqual({ segnalato: false, pratiche: true });
    expect(log(avvisi)).toContain('motore_segnali_errore');
  });

  it('l\'indice dei portali vive 60 secondi', async () => {
    risposte([], [], []);
    await segnaliPrefiltro(PIVA, PRIMA);
    const letture = blob.leggiPratiche.mock.calls.length;
    expect(letture).toBeGreaterThan(0);
    await segnaliPrefiltro(PIVA, PRIMA);
    expect(blob.leggiPratiche.mock.calls.length).toBe(letture);
    vi.setSystemTime(new Date('2026-10-20T08:01:01Z'));
    await segnaliPrefiltro(PIVA, PRIMA);
    expect(blob.leggiPratiche.mock.calls.length).toBe(2 * letture);
  });

  it('un indice letto a meta\' non si tiene in memoria e risulta caduto', async () => {
    risposte([], [], []);
    blob.leggiPratiche.mockRejectedValueOnce(new Error('timeout'));
    expect((await segnaliPrefiltro(PIVA, PRIMA)).fallite.pratiche).toBe(true);
    const letture = blob.leggiPratiche.mock.calls.length;
    expect((await segnaliPrefiltro(PIVA, PRIMA)).fallite.pratiche).toBe(false);
    expect(blob.leggiPratiche.mock.calls.length).toBe(2 * letture);
  });

  it('il salvataggio che non riesce non fa fallire la ricerca', async () => {
    db.query.mockRejectedValue(new Error('connection terminated'));
    await expect(salvaSegnali('r1', { segnalato: null, praticaRecente: null })).resolves.toBeUndefined();
    expect(log(errori)).toContain('motore_segnali_errore');
  });
});
