// Lo storico dei prezzi del catalogo: una riga a ogni cambio di prezzo o di validità,
// dal Pannello MCF o dall'import. Spec mcf_spec-ledoffice-motore_v1, paragrafi 4 e 10.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn() }));
vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna }));

import { cambiaStorico, registraStorico, ultimoStorico } from './storico-prezzi';

describe('cambiaStorico', () => {
  it('voce nuova: si scrive la prima riga', () => {
    expect(cambiaStorico(null, { prezzo: 1900, validoFino: '2026-12-31' })).toBe(true);
    expect(cambiaStorico(null, { prezzo: 1900, validoFino: null })).toBe(true);
  });
  it('stesso prezzo e stessa validità: niente', () => {
    expect(cambiaStorico({ prezzo: 1900, validoFino: '2026-12-31' }, { prezzo: 1900, validoFino: '2026-12-31' })).toBe(false);
    expect(cambiaStorico({ prezzo: 1900, validoFino: null }, { prezzo: 1900, validoFino: null })).toBe(false);
  });
  it('prezzo cambiato: si scrive', () => {
    expect(cambiaStorico({ prezzo: 1900, validoFino: '2026-12-31' }, { prezzo: 1950, validoFino: '2026-12-31' })).toBe(true);
  });
  it('solo la validità cambiata: si scrive, anche quando si toglie', () => {
    expect(cambiaStorico({ prezzo: 1900, validoFino: '2026-12-31' }, { prezzo: 1900, validoFino: '2027-06-30' })).toBe(true);
    expect(cambiaStorico({ prezzo: 1900, validoFino: '2026-12-31' }, { prezzo: 1900, validoFino: null })).toBe(true);
    expect(cambiaStorico({ prezzo: 1900, validoFino: null }, { prezzo: 1900, validoFino: '2026-12-31' })).toBe(true);
  });
  it('i centesimi contano, la virgola mobile no', () => {
    expect(cambiaStorico({ prezzo: 186.32, validoFino: null }, { prezzo: 186.33, validoFino: null })).toBe(true);
    expect(cambiaStorico({ prezzo: 0.1 + 0.2, validoFino: null }, { prezzo: 0.3, validoFino: null })).toBe(false);
  });
});

describe('lettura e scrittura dello storico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ultimoStorico legge l\'ultima riga della voce, con la data come testo', async () => {
    db.queryUna.mockResolvedValueOnce({ prezzo: '1900.00', valido_fino: '2026-12-31' });
    expect(await ultimoStorico('led-office', 'LO-SRV-1')).toEqual({ prezzo: 1900, validoFino: '2026-12-31' });
    const [sql, valori] = db.queryUna.mock.calls[0];
    expect(sql).toContain("to_char(valido_fino, 'YYYY-MM-DD')");
    expect(sql).toMatch(/ORDER BY registrato DESC, id DESC/);
    expect(valori).toEqual(['led-office', 'LO-SRV-1']);
  });
  it('ultimoStorico senza righe: null', async () => {
    db.queryUna.mockResolvedValueOnce(null);
    expect(await ultimoStorico('led-office', 'NUOVA')).toBeNull();
  });
  it('registraStorico scrive la riga come il seed: slug, codice, prezzo, validità, utente', async () => {
    db.query.mockResolvedValueOnce([]);
    await registraStorico('led-office', 'LO-SRV-1', { prezzo: 1950, validoFino: null }, 'admin@example.it');
    const [sql, valori] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO app\.catalogo_storico \(fornitore_slug, codice, prezzo, valido_fino, da_utente\)/);
    expect(valori).toEqual(['led-office', 'LO-SRV-1', 1950, null, 'admin@example.it']);
  });
});
