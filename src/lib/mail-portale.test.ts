// La copia nascosta a MCF arriva davvero a Resend: si guarda il corpo della
// richiesta, con Resend simulato. Nessuna mail parte.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESTINATARIO_MCF, inviaMail } from './mail-portale';

let corpi: any[] = [];

beforeEach(() => {
  corpi = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  process.env.RESEND_API_KEY = 'chiave-di-prova';
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    corpi.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('copia nascosta nelle mail dei portali', () => {
  it('invito a un esterno durante la fase sperimentale: MCF in copia nascosta', async () => {
    vi.setSystemTime(new Date('2026-10-16T10:00:00+02:00'));
    const esito = await inviaMail({ to: 'leo@example.invalid', subject: 'Invito', html: '<p>ciao</p>' });
    expect(esito.ok).toBe(true);
    expect(corpi[0].to).toEqual(['leo@example.invalid']);
    expect(corpi[0].bcc).toEqual([DESTINATARIO_MCF]);
  });
  it('notifica a MCF: nessuna copia', async () => {
    vi.setSystemTime(new Date('2026-10-16T10:00:00+02:00'));
    await inviaMail({ to: DESTINATARIO_MCF, subject: 'Nuovo preventivo', html: '<p>x</p>' });
    expect(corpi[0].bcc).toBeUndefined();
  });
  it('dal 2027 la copia non parte piu', async () => {
    vi.setSystemTime(new Date('2027-01-05T10:00:00+01:00'));
    await inviaMail({ to: 'leo@example.invalid', subject: 'Invito', html: '<p>ciao</p>' });
    expect(corpi[0].bcc).toBeUndefined();
  });
});
