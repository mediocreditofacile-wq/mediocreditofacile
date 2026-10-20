// Identificativo estero: cosa si manda a Openapi prima di pagare 0,11 euro.
// Il caso da cui nasce e' Knibbelberg B.V., 20/10/2026: KVK 56286333, partita
// IVA scritta come NL852057775801, con un 8 al posto della B.

import { describe, expect, it } from 'vitest';
import { normalizzaIdEstero } from './id-estero';

describe('Paesi Bassi', () => {
  it('accetta il numero KVK di 8 cifre', () => {
    expect(normalizzaIdEstero('NL', '56286333')).toEqual({ ok: true, id: '56286333', tipo: 'kvk' });
    expect(normalizzaIdEstero('nl', ' 5628 6333 ')).toEqual({ ok: true, id: '56286333', tipo: 'kvk' });
  });

  it('accetta la partita IVA col prefisso NL, ripulita da spazi e punti', () => {
    expect(normalizzaIdEstero('NL', 'NL852057775B01')).toEqual({ ok: true, id: 'NL852057775B01', tipo: 'partita-iva' });
    expect(normalizzaIdEstero('NL', 'nl 8520.57775.b01')).toEqual({ ok: true, id: 'NL852057775B01', tipo: 'partita-iva' });
  });

  it('senza prefisso rimette NL, il formato europeo della partita IVA', () => {
    expect(normalizzaIdEstero('NL', '852057775B01')).toEqual({ ok: true, id: 'NL852057775B01', tipo: 'partita-iva' });
  });

  it('una cifra al posto della B si ferma prima di spendere, e suggerisce la forma giusta', () => {
    const esito = normalizzaIdEstero('NL', 'NL852057775801');
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toContain('NL852057775B01');
  });

  it('un codice che non e\' nessuno dei due si ferma col formato atteso', () => {
    const esito = normalizzaIdEstero('NL', '1234567');
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toContain('KVK');
  });
});

describe('gli altri paesi passano come sono stati scritti', () => {
  it('non tocca formati che non conosce', () => {
    expect(normalizzaIdEstero('DE', 'DE129274202')).toEqual({ ok: true, id: 'DE129274202', tipo: 'libero' });
    expect(normalizzaIdEstero('BR', ' 33.592.510/0001-54 ')).toEqual({ ok: true, id: '33.592.510/0001-54', tipo: 'libero' });
  });
});
