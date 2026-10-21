import { describe, expect, it } from 'vitest';
import { copiaSetCookie } from './inoltra-cookie';

const SESSIONE = '__Secure-better-auth.session_token=abc.firma; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax';
const CACHE = '__Secure-better-auth.session_data=xyz; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax';

describe('copiaSetCookie', () => {
  it('ogni cookie resta in una riga sua', () => {
    const da = new Headers();
    da.append('set-cookie', SESSIONE);
    da.append('set-cookie', CACHE);
    const verso = copiaSetCookie(da, new Headers({ 'Content-Type': 'application/json' }));
    expect(verso.getSetCookie()).toEqual([SESSIONE, CACHE]);
  });

  it('il vecchio modo incollava i due cookie: la sessione prendeva il Max-Age della cache', () => {
    const da = new Headers();
    da.append('set-cookie', SESSIONE);
    da.append('set-cookie', CACHE);
    const incollato = da.get('set-cookie')!;
    // Una riga sola, e l'ultimo Max-Age che il browser legge e' quello dei 5 minuti
    expect(incollato).toBe(`${SESSIONE}, ${CACHE}`);
    expect([...incollato.matchAll(/Max-Age=(\d+)/g)].at(-1)![1]).toBe('300');
  });

  it('senza cookie non aggiunge niente', () => {
    const verso = copiaSetCookie(new Headers(), new Headers());
    expect(verso.getSetCookie()).toEqual([]);
  });
});
