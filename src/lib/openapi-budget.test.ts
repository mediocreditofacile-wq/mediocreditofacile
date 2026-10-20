// Budget Openapi separati per strumento.
//
// Il caso da cui nasce, 20/10/2026: tool di valutazione e tool Marotta scrivevano
// nella stessa sorgente 'sito'. A ottobre il tool interno aveva speso 93 euro fra
// schede, verifiche e visure, il tetto da 30 euro della ricerca estera di Marotta
// era pieno dal 14/10, e /tools/valutazione rispondeva "Ricerche esaurite" su una
// societa' olandese. Le regole che si proteggono qui:
//   - una spesa del tool interno non riduce il budget di Marotta, e viceversa
//   - Marotta oltre il suo tetto si ferma, e il messaggio dice di chi e' il budget
//   - il tool interno non si ferma mai per budget, ma la sua spesa si registra
//   - le voci storiche e il resto del wallet non finiscono sul budget di Marotta
// Tutto con mock: nessuna chiamata a Openapi, nessuna scrittura su Blob.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scritti = vi.hoisted(() => [] as string[]);
const elenco = vi.hoisted(() => ({ blobs: [] as { pathname: string; uploadedAt?: Date }[] }));
vi.mock('@vercel/blob', () => ({
  put: async (percorso: string) => { scritti.push(percorso); return {}; },
  list: async ({ prefix }: { prefix: string }) => ({
    blobs: elenco.blobs.filter((b) => b.pathname.startsWith(prefix)),
  }),
  get: async () => null,
}));

const MESE = '2026-10';
const voce = (resto: string) => ({ pathname: `openapi/costi/${MESE}/${resto}` });
/** n voci dello stesso servizio nella cartella di una sorgente ('' = cartella storica 'sito') */
const voci = (cartella: string, servizio: string, n: number) =>
  Array.from({ length: n }, (_, i) => voce(`${cartella ? `${cartella}/` : ''}${i + 1}-${servizio}-x${i}.json`));

const risposta = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Wallet che non risponde: la spesa si conta sul solo registro */
const walletMuto = async () => risposta(500, null);

beforeEach(() => {
  vi.resetModules(); // la spesa del mese resta in memoria un minuto: si riparte da zero
  vi.stubEnv('OPENAPI_EMAIL', 'prova@example.invalid');
  vi.stubEnv('OPENAPI_KEY', 'chiave-finta');
  vi.stubGlobal('fetch', walletMuto);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${MESE}-20T10:00:00Z`));
  elenco.blobs = [];
  scritti.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('budget del tool Marotta e del tool interno', () => {
  it('una spesa del tool interno non riduce il budget di Marotta', async () => {
    elenco.blobs = [
      ...voci('valutazione', 'IT-full', 200),          // 60 euro di schede
      ...voci('valutazione', 'IT-report-persona', 10), // 36 euro di report
      ...voci('marotta', 'WW-advanced', 10),           // 1,10 euro di ricerche estere
    ];
    const { entroIlTetto } = await import('./openapi');
    const esito = await entroIlTetto('WW-advanced', 'marotta');

    expect(esito.ok).toBe(true);
    expect(esito.consumo.perSorgente.marotta.totale).toBe(1.1);
    expect(esito.consumo.perSorgente.valutazione.totale).toBe(96);
  });

  it('e una spesa di Marotta non tocca il tool interno', async () => {
    elenco.blobs = voci('marotta', 'WW-advanced', 300); // 33 euro, oltre il tetto
    const { entroIlTetto } = await import('./openapi');

    expect((await entroIlTetto('WW-advanced', 'marotta')).ok).toBe(false);
    const interno = await entroIlTetto('WW-advanced', 'valutazione');
    expect(interno.ok).toBe(true);
    expect(interno.consumo.perSorgente.valutazione.totale).toBe(0);
  });

  it('Marotta oltre i 30 euro si blocca, e il messaggio dice budget, spesa e riapertura', async () => {
    elenco.blobs = voci('marotta', 'WW-advanced', 273); // 30,03 euro
    const { entroIlTetto } = await import('./openapi');
    const esito = await entroIlTetto('WW-advanced', 'marotta');

    expect(esito.ok).toBe(false);
    expect(esito.messaggio).toBe(
      'Budget Openapi del tool Marotta esaurito: a ottobre spesi 30,03 € su 30,00 €. Si riapre il 1° novembre 2026.',
    );
  });

  it('sotto i 30 euro Marotta passa', async () => {
    elenco.blobs = voci('marotta', 'WW-advanced', 272); // 29,92 euro
    const { entroIlTetto } = await import('./openapi');
    expect((await entroIlTetto('WW-advanced', 'marotta')).ok).toBe(true);
  });

  it('il tool interno non si blocca mai, ma la sua spesa resta contata', async () => {
    elenco.blobs = [
      ...voci('valutazione', 'IT-report-persona', 1000), // 3.600 euro
      ...voci('valutazione', 'IT-advanced', 500),        // oltre il tetto delle ricerche gratuite
    ];
    const { entroIlTetto } = await import('./openapi');

    for (const servizio of ['WW-advanced', 'IT-full', 'IT-advanced'] as const) {
      const esito = await entroIlTetto(servizio, 'valutazione');
      expect(esito.ok).toBe(true);
      expect(esito.messaggio).toBeUndefined();
    }
    const { consumo } = await entroIlTetto('IT-full', 'valutazione');
    expect(consumo.perSorgente.valutazione.totale).toBe(3600);
    expect(consumo.perSorgente.valutazione.chiamate).toBe(1500);
  });

  it('le voci di ottobre registrate prima della separazione non contano per Marotta', async () => {
    // E' la situazione del 20/10/2026: 93 euro nella cartella storica, niente nelle nuove
    elenco.blobs = [
      ...voci('', 'IT-report-persona', 8),
      ...voci('', 'DOC-visura-capitale', 3),
      ...voci('', 'IT-full', 24),
      ...voci('', 'WW-advanced', 4),
    ];
    const { entroIlTetto } = await import('./openapi');
    const esito = await entroIlTetto('WW-advanced', 'marotta');

    expect(esito.ok).toBe(true);
    expect(esito.consumo.perSorgente.marotta.totale).toBe(0);
    expect(esito.consumo.perSorgente.sito.totale).toBe(51.14);
  });

  it('il resto del wallet va ai non attribuiti, mai a Marotta', async () => {
    elenco.blobs = [...voci('marotta', 'WW-advanced', 1), ...voci('valutazione', 'IT-full', 10)];
    // Il wallet ha fatturato 150 euro a ottobre: prove, scarti di listino, voci vecchie
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/wallet/transactions')
        ? risposta(200, { success: true, data: [{ amount: -150, createdAt: `${MESE}-18T10:00:00Z` }] })
        : risposta(500, null));
    const { entroIlTetto } = await import('./openapi');
    const { ok, consumo } = await entroIlTetto('WW-advanced', 'marotta');

    expect(ok).toBe(true);
    expect(consumo.totale).toBe(150);
    expect(consumo.perSorgente.marotta.totale).toBe(0.11);
    expect(consumo.perSorgente.valutazione.totale).toBe(3);
    expect(consumo.perSorgente.sito.totale).toBe(146.89);
  });

  it('il tetto di Marotta si cambia con OPENAPI_TETTO_MAROTTA', async () => {
    vi.stubEnv('OPENAPI_TETTO_MAROTTA', '1');
    elenco.blobs = voci('marotta', 'WW-advanced', 10); // 1,10 euro
    const { entroIlTetto } = await import('./openapi');
    const esito = await entroIlTetto('WW-advanced', 'marotta');

    expect(esito.ok).toBe(false);
    expect(esito.messaggio).toContain('su 1,00 €');
  });

  it('il tetto delle ricerche gratuite conta solo quelle di Marotta', async () => {
    elenco.blobs = voci('valutazione', 'IT-advanced', 450);
    const { entroIlTetto } = await import('./openapi');
    expect((await entroIlTetto('IT-advanced', 'marotta')).ok).toBe(true);

    elenco.blobs = voci('marotta', 'IT-advanced', 400);
    vi.resetModules();
    const { entroIlTetto: dopo } = await import('./openapi');
    const esito = await dopo('IT-advanced', 'marotta');
    expect(esito.ok).toBe(false);
    expect(esito.messaggio).toBe(
      'Ricerche Openapi del tool Marotta esaurite: a ottobre ne sono state fatte 400 su 400. Si riaprono il 1° novembre 2026.',
    );
  });

  it('le carrozzerie restano sul loro tetto, senza contare gli strumenti', async () => {
    elenco.blobs = [
      ...voci('valutazione', 'IT-full', 100),
      ...voci('marotta', 'WW-advanced', 300),
      ...voci('carrozzeria/duplex', 'IT-full', 2),
    ];
    const { entroIlTetto } = await import('./openapi');
    expect((await entroIlTetto('IT-full', 'carrozzeria/duplex', 1)).ok).toBe(true);
    expect((await entroIlTetto('IT-full', 'carrozzeria/duplex', 0.5)).ok).toBe(false);
  });
});

describe('chi scrive dove nel registro', () => {
  /** Finto Openapi: crea un token e risponde alla ricerca estera */
  function fintoOpenapi() {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://oauth.openapi.com/tokens')) {
        return risposta(200, init?.method === 'POST'
          ? { success: true, data: { token: 't', createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + 9e8).toISOString() } }
          : { success: true, data: [] });
      }
      if (url.startsWith('https://oauth.openapi.com/wallet')) return risposta(500, null);
      return risposta(200, { success: true, data: { companyName: 'Knibbelberg B.V.', balanceSheets: { last: {} } } });
    });
  }

  for (const sorgente of ['marotta', 'valutazione'] as const) {
    it(`la ricerca estera del ${sorgente === 'marotta' ? 'tool Marotta' : 'tool interno'} finisce nella sua cartella`, async () => {
      fintoOpenapi();
      const { ricercaEstera } = await import('./openapi');
      const esito = ricercaEstera('NL', '56286333', sorgente);
      await vi.advanceTimersByTimeAsync(5_000);

      expect((await esito).ragioneSociale).toBe('Knibbelberg B.V.');
      const costi = scritti.filter((p) => p.startsWith('openapi/costi/'));
      expect(costi).toHaveLength(1);
      expect(costi[0]).toMatch(new RegExp(`^openapi/costi/${MESE}/${sorgente}/\\d+-WW-advanced\\.json$`));
    });
  }

  it('il registro riconosce le cartelle dei due strumenti', async () => {
    const { sorgenteDaPercorso } = await import('./openapi');
    const parti = (p: string) => p.split('/').slice(0, -1);
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/marotta/1-WW-advanced-x.json`))).toBe('marotta');
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/valutazione/1-IT-full-x.json`))).toBe('valutazione');
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/1-IT-full-x.json`))).toBe('sito');
  });
});

describe('conto del mese dal wallet', () => {
  /** n addebiti da 1 euro nel giorno indicato */
  const addebiti = (n: number, giorno: string) =>
    Array.from({ length: n }, () => ({ amount: -1, createdAt: `${giorno}T09:00:00Z` }));

  it('sfoglia le pagine da 100 finché non arriva al mese prima', async () => {
    const pagine: Record<string, unknown[]> = {
      0: addebiti(100, `${MESE}-18`),
      100: [...addebiti(10, `${MESE}-02`), ...addebiti(90, '2026-09-28')],
      200: addebiti(100, '2026-09-10'), // tutta di settembre: non si deve chiedere
    };
    const chieste: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const skip = new URL(url).searchParams.get('skip') ?? '';
      chieste.push(skip);
      return risposta(200, { success: true, data: pagine[skip] ?? [] });
    });
    const { spesaDelMese } = await import('./openapi');
    const c = await spesaDelMese(MESE);

    // con la sola prima pagina sarebbe uscito 100, come gli 85,63 del 20/10/2026
    expect(c.addebitato).toBe(110);
    expect(chieste).toEqual(['0', '100']);
  });

  it('se una pagina non risponde vale il solo registro', async () => {
    elenco.blobs = voci('valutazione', 'IT-full', 10);
    vi.stubGlobal('fetch', async (url: string) => {
      const skip = new URL(url).searchParams.get('skip');
      return skip === '0'
        ? risposta(200, { success: true, data: addebiti(100, `${MESE}-18`) })
        : risposta(500, null);
    });
    const { spesaDelMese } = await import('./openapi');
    const c = await spesaDelMese(MESE);

    expect(c.addebitato).toBeNull();
    expect(c.totale).toBe(3);
  });
});
