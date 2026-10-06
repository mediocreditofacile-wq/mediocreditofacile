import { describe, it, expect, beforeEach } from 'vitest';
import {
  cookieDispositivo, leggiDispositivo, registra, serveRegistrazione, restanti, fineFiera, ipDellaRichiesta,
} from './fiera-guardia';

const conCookie = (setCookie: string) =>
  new Request('https://www.mediocreditofacile.it/api/fiera-verifica', { headers: { cookie: setCookie.split(';')[0] } });

describe('guardia della verifica in fiera', () => {
  beforeEach(() => {
    process.env.FIERA_COOKIE_SECRET = 'segreto-di-prova';
    process.env.FIERA_RICERCHE_REGISTRATO = '20';
  });

  it('FIERA_FINE come data vale fino a fine giornata, ora italiana', () => {
    process.env.FIERA_FINE = '2026-10-04';
    expect(new Date(fineFiera()).toISOString()).toBe('2026-10-04T21:59:59.000Z');
  });

  it('durante la fiera non chiede mai la registrazione', () => {
    process.env.FIERA_FINE = '2099-01-01';
    expect(serveRegistrazione({ d: 'x', n: 500, a: 0 })).toBe(false);
    expect(restanti({ d: 'x', n: 500, a: 0 })).toBeNull();
  });

  it('dopo la fiera serve la registrazione dalla prima ricerca, e il modulo estende di 20', () => {
    process.env.FIERA_FINE = '2020-01-01';
    const nuovo = { d: 'x', n: 0, a: 0 };
    expect(serveRegistrazione(nuovo)).toBe(true);
    const reg = registra(nuovo);
    expect(serveRegistrazione(reg)).toBe(false);
    expect(restanti(reg)).toBe(20);
    expect(serveRegistrazione({ ...reg, n: 20 })).toBe(true);
  });

  it('il cookie firmato torna uguale, quello manomesso riparte da zero', () => {
    const c = cookieDispositivo({ d: 'abc', n: 3, a: 20 })!;
    expect(c).toMatch(/HttpOnly; SameSite=Lax; Secure/);
    expect(leggiDispositivo(conCookie(c))).toEqual({ d: 'abc', n: 3, a: 20 });

    const [nome, valore] = c.split(';')[0].split('=');
    const [dati, firma] = valore.split('.');
    const falso = Buffer.from(JSON.stringify({ d: 'abc', n: 0, a: 999, e: Date.now() + 1e9 })).toString('base64url');
    const letto = leggiDispositivo(conCookie(`${nome}=${falso}.${firma}`));
    expect(letto.a).toBe(0);
    expect(letto.d).not.toBe('abc');
    expect(dati).toBeTruthy();
  });

  it("l'IP arriva da x-real-ip, poi dal primo valore di x-forwarded-for", () => {
    const r1 = new Request('https://x', { headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2, 3.3.3.3' } });
    const r2 = new Request('https://x', { headers: { 'x-forwarded-for': '2.2.2.2, 3.3.3.3' } });
    expect(ipDellaRichiesta(r1)).toBe('1.1.1.1');
    expect(ipDellaRichiesta(r2)).toBe('2.2.2.2');
  });
});
