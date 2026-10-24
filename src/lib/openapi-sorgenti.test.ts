// Registro spesa per sorgente: sito, fiera e una cartella per ogni carrozzeria.
//
// La regola che si protegge qui: un fornitore sul motore dei portali spende il
// suo budget e solo quello. Le sue chiamate finiscono sotto
// openapi/costi/<mese>/carrozzeria/<slug>/, si sommano a parte, e il tetto le
// guarda da sole: un fornitore che esagera non ferma ne' gli altri ne' il sito.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scritti = vi.hoisted(() => [] as string[]);
const elenco = vi.hoisted(() => ({ blobs: [] as { pathname: string }[] }));
vi.mock('@vercel/blob', () => ({
  put: async (percorso: string) => { scritti.push(percorso); return {}; },
  list: async () => ({ blobs: elenco.blobs }),
  get: async () => null,
}));

const MESE = '2026-10';
const blob = (resto: string) => ({ pathname: `openapi/costi/${MESE}/${resto}` });

describe('sorgente dal percorso', () => {
  it('riconosce sito, fiera e carrozzeria', async () => {
    const { sorgenteDaPercorso } = await import('./openapi');
    const parti = (p: string) => p.split('/').slice(0, -1);
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/1-IT-full-x.json`))).toBe('sito');
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/fiera/1-IT-advanced-x.json`))).toBe('fiera');
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/simulatore/1-IT-advanced-x.json`))).toBe('simulatore');
    expect(sorgenteDaPercorso(parti(`openapi/costi/${MESE}/carrozzeria/demo-fv/1-IT-full-x.json`)))
      .toBe('carrozzeria/demo-fv');
  });

  it('non accetta uno slug che uscirebbe dalla sua cartella', async () => {
    const { sorgenteCarrozzeria } = await import('./openapi');
    expect(sorgenteCarrozzeria('demo-fv')).toBe('carrozzeria/demo-fv');
    expect(() => sorgenteCarrozzeria('../sito')).toThrow();
    expect(() => sorgenteCarrozzeria('Demo FV')).toThrow();
    expect(() => sorgenteCarrozzeria('')).toThrow();
  });
});

describe('spesa e tetto per carrozzeria', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OPENAPI_EMAIL', 'prova@example.it');
    vi.stubEnv('OPENAPI_KEY', 'chiave-di-prova');
    // Il wallet non risponde: si conta il solo registro
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, json: async () => null }) as Response);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${MESE}-15T10:00:00Z`));
    scritti.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('divide la spesa del mese fra sito, fiera e ciascuna carrozzeria', async () => {
    elenco.blobs = [
      blob('1-IT-full-a.json'),
      blob('2-IT-creditscore-advanced-b.json'),
      blob('fiera/3-IT-advanced-c.json'),
      blob('carrozzeria/demo-fv/4-IT-full-d.json'),
      blob('carrozzeria/demo-fv/5-IT-creditscore-advanced-e.json'),
      blob('carrozzeria/altro/6-IT-full-f.json'),
    ];
    const { spesaDelMese } = await import('./openapi');
    const c = await spesaDelMese(MESE);

    expect(c.perSorgente.sito.totale).toBe(0.81);
    expect(c.perSorgente.fiera.chiamate).toBe(1);
    expect(c.perSorgente['carrozzeria/demo-fv'].totale).toBe(0.81);
    expect(c.perSorgente['carrozzeria/demo-fv'].chiamate).toBe(2);
    expect(c.perSorgente['carrozzeria/altro'].totale).toBe(0.3);
    expect(c.totale).toBe(1.92);
  });

  it('il tetto della carrozzeria guarda solo la sua spesa', async () => {
    elenco.blobs = [
      // il sito ha speso molto: non deve contare
      ...Array.from({ length: 50 }, (_, i) => blob(`${i}-IT-full-s${i}.json`)),
      blob('carrozzeria/demo-fv/100-IT-full-d.json'),
      blob('carrozzeria/demo-fv/101-IT-creditscore-advanced-e.json'),
    ];
    const { entroIlTetto } = await import('./openapi');

    expect((await entroIlTetto('IT-full', 'carrozzeria/demo-fv', 1)).ok).toBe(true);
    const fermo = await entroIlTetto('IT-full', 'carrozzeria/demo-fv', 0.8);
    expect(fermo.ok).toBe(false);
    expect(fermo.motivo).toContain('0.81');
    // una carrozzeria che non ha ancora speso niente parte da zero
    expect((await entroIlTetto('IT-full', 'carrozzeria/nuova', 0.5)).ok).toBe(true);
  });

  it('le chiamate di una carrozzeria finiscono nella sua cartella', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://oauth.openapi.com/tokens')) {
        return {
          ok: true, status: 200,
          json: async () => init?.method === 'POST'
            ? { success: true, data: { token: 't', expireAt: new Date(Date.now() + 9e8).toISOString() } }
            : { success: true, data: [] },
        } as Response;
      }
      n++;
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: `neg-${n}` } }) } as Response;
    });
    const { avviaNegativita } = await import('./openapi');
    const esito = avviaNegativita('00000000000', 'carrozzeria/demo-fv');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await esito).toBe('neg-1');
    expect(scritti).toHaveLength(1);
    expect(scritti[0]).toMatch(new RegExp(`^openapi/costi/${MESE}/carrozzeria/demo-fv/\\d+-IT-negativita\\.json$`));
  });
});
