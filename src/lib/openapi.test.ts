// Il ritentativo quando Openapi risponde "Wrong Token".
//
// Openapi non si puo' far sbagliare a comando, quindi qui risponde un finto: crea
// ed elenca i token come quello vero e rifiuta le chiamate ai dati per il numero
// di volte deciso dal test. Il caso da cui nasce e' del 30/09/2026: un token
// valido, in uso da un mese, rifiutato due volte di fila.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Il registro spesa scrive su Blob: dai test non deve uscire niente
vi.mock('@vercel/blob', () => ({
  put: async () => ({}),
  list: async () => ({ blobs: [] }),
  get: async () => null,
}));

const risposta = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Finto Openapi: token creati ed elencati come quelli veri, dati rifiutati `rifiuti` volte. */
function fintoOpenapi(rifiuti: number) {
  const token: { token: string; name: string; createdAt: string; expireAt: string }[] = [];
  const bearer: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://oauth.openapi.com/tokens')) {
      if (init?.method !== 'POST') return risposta(200, { success: true, data: token });
      const t = {
        token: `segreto-${token.length + 1}`,
        name: JSON.parse(String(init.body)).name,
        createdAt: new Date().toISOString(),
        expireAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      };
      token.push(t);
      return risposta(200, { success: true, data: t });
    }
    bearer.push(String((init?.headers as Record<string, string>).Authorization));
    return bearer.length <= rifiuti
      ? risposta(401, { success: false, message: 'Wrong Token', error: 125.22, data: null })
      : risposta(200, { success: true, data: { id: 'verifica-1' } });
  };
  return { fetch, token, bearer };
}

describe('Openapi risponde "Wrong Token"', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules(); // il token in memoria riparte da zero a ogni test
    vi.stubEnv('OPENAPI_EMAIL', 'prova@example.invalid');
    vi.stubEnv('OPENAPI_KEY', 'chiave-finta');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rifiutato due volte e accettato alla terza: la chiamata va a buon fine', async () => {
    const finto = fintoOpenapi(2);
    vi.stubGlobal('fetch', finto.fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { avviaNegativita } = await import('./openapi');

    const esito = avviaNegativita('00000000000');
    await vi.advanceTimersByTimeAsync(14_000);

    expect(await esito).toBe('verifica-1');
    expect(finto.bearer).toHaveLength(3);
    // si riprova con lo stesso token: non se ne crea uno a ogni tentativo
    expect(finto.token).toHaveLength(1);
    expect(new Set(finto.bearer)).toEqual(new Set(['Bearer segreto-1']));
  });

  it('rifiutato tre volte: messaggio leggibile, e nel log nome e date del token ma non il valore', async () => {
    const finto = fintoOpenapi(3);
    vi.stubGlobal('fetch', finto.fetch);
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { avviaNegativita, MESSAGGIO_ACCESSO_RIFIUTATO } = await import('./openapi');

    const esito = expect(avviaNegativita('00000000000')).rejects.toThrow(MESSAGGIO_ACCESSO_RIFIUTATO);
    await vi.advanceTimersByTimeAsync(14_000);
    await esito;

    expect(finto.bearer).toHaveLength(3);
    const righe = log.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(righe.map((r) => [r.tentativo, r.riprovaTraMs])).toEqual([[1, 4_000], [2, 10_000], [3, null]]);
    expect(righe.every((r) => r.evento === 'openapi_wrong_token' && r.creato && r.scade)).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('segreto');
  });
});
