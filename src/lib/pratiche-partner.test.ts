// Il server dei portali pratiche (Expo Energia, STILO, Full Service, UNIDIMA,
// Extreme Computer) rifiuta le pratiche senza cellulare, email o IBAN valido,
// qualunque cosa abbia lasciato passare il browser. Store Blob, Resend e Zapier
// sono finti: nessun test scrive o manda niente davvero.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scritti: { percorso: string; corpo: string }[] = [];
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (percorso: string, corpo: string) => {
    scritti.push({ percorso, corpo });
    return { pathname: percorso };
  }),
}));

import { PORTALI_PARTNER } from '../data/portali-partner';
import { gestisciPratica } from './pratiche-partner';

const chiamate: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  scritti.length = 0;
  chiamate.length = 0;
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'finto');
  vi.stubEnv('RESEND_API_KEY', 'finto');
  vi.stubEnv('ZAPIER_WEBHOOK_URL', 'https://zapier.invalid/hook');
  vi.stubEnv('EXPO_PORTAL_ADMIN_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    chiamate.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const BUONI: Record<string, string> = {
  ragione_sociale: 'Rossi Impianti SRL',
  forma_giuridica: 'SRL',
  piva: '01234567890',
  referente: 'Mario Rossi',
  telefono: '333 123 4567',
  email: 'mario@esempio.it',
  iban: 'it60 x054 2811 1010 0000 0123 456',
  beni: JSON.stringify([{ tipologia: 'PC', descrizione: 'Due workstation', importo: '6000' }]),
  durata: '60',
};

async function invia(campi: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campi)) fd.set(k, v);
  const res = await gestisciPratica(
    new Request('https://www.mediocreditofacile.it/api/submit-full-service', { method: 'POST', body: fd }),
    PORTALI_PARTNER['full-service'],
    { notaLavorazione: 'prova' },
  );
  return { status: res.status, corpo: await res.json() };
}

describe('gestisciPratica, i rifiuti', () => {
  const casi: [string, Record<string, string>, string][] = [
    ['senza email', { email: '' }, 'email_mancante'],
    ['senza cellulare', { telefono: '' }, 'cellulare_mancante'],
    ['senza IBAN', { iban: '' }, 'iban_mancante'],
    ['con un IBAN sbagliato di una cifra', { iban: 'IT60X0542811101000000123457' }, 'iban_non_valido'],
    ['con un IBAN italiano corto', { iban: 'IT60X054281110100000012345' }, 'iban_non_valido'],
  ];

  for (const [nome, cambio, errore] of casi) {
    it(`rifiuta la pratica ${nome}, col motivo, senza salvare ne' mandare niente`, async () => {
      const { status, corpo } = await invia({ ...BUONI, ...cambio });
      expect(status).toBe(400);
      expect(corpo.ok).toBe(false);
      expect(corpo.error).toBe(errore);
      expect(corpo.messaggio.length).toBeGreaterThan(20);
      expect(scritti).toHaveLength(0);
      expect(chiamate).toHaveLength(0);
    });
  }

  it('un modulo vecchio, senza il campo IBAN, non passa', async () => {
    const { iban: _, ...senza } = BUONI;
    const { status, corpo } = await invia(senza);
    expect(status).toBe(400);
    expect(corpo.error).toBe('iban_mancante');
  });
});

describe('gestisciPratica, la pratica buona', () => {
  it("salva l'IBAN normalizzato nel record e lo scrive a gruppi di quattro nella mail a MCF", async () => {
    const { status, corpo } = await invia(BUONI);
    expect(status).toBe(200);
    expect(corpo.ok).toBe(true);

    const record = JSON.parse(scritti.find((s) => s.percorso.endsWith('/pratica.json'))!.corpo);
    expect(record.cliente.iban).toBe('IT60X0542811101000000123456');
    expect(record.cliente.telefono).toBe('333 123 4567');
    expect(record.cliente.email).toBe('mario@esempio.it');

    const mail = chiamate.find((c) => c.url.includes('resend.com'))!;
    expect(String(mail.init.body)).toContain('IT60 X054 2811 1010 0000 0123 456');
  });

  it("l'IBAN non viaggia verso Zapier", async () => {
    await invia(BUONI);
    const zap = chiamate.find((c) => c.url.includes('zapier'))!;
    const inoltrato = zap.init.body as FormData;
    expect(inoltrato.get('ragione_sociale')).toBe('Rossi Impianti SRL');
    expect(inoltrato.has('iban')).toBe(false);
  });
});
