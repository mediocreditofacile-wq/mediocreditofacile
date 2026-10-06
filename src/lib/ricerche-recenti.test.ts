// Elenco "Ricerche ultimi 30 giorni" di /tools/valutazione.
// L'elenco e' la cache: qui si controlla che non mostri schede scadute (riaprirle
// costerebbe), che lasci fuori gli esempi demo del tool Marotta e che le pagine
// da dieci tornino anche quando una scheda scade mentre la pagina e' aperta.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/blob', () => ({
  put: async () => ({}),
  list: async () => ({ blobs: [] }),
  get: async () => null,
}));

import { selezionaRecenti, sintesiItaliana, sintesiEstera, nomeComune } from './ricerche-recenti';

const GIORNO = 24 * 60 * 60 * 1000;
const ORA = Date.parse('2026-10-06T10:00:00Z');
const blob = (pathname: string, giorniFa: number) => ({ pathname, uploadedAt: new Date(ORA - giorniFa * GIORNO) });
const piva = (n: number) => String(10000000000 + n);

describe('selezionaRecenti', () => {
  it('tiene solo le schede ancora in cache, dalla piu recente', () => {
    const r = selezionaRecenti([
      blob(`openapi/aziende/${piva(1)}.json`, 10),
      blob(`openapi/aziende/${piva(2)}.json`, 31),   // scaduta
      blob(`openapi/aziende/${piva(3)}.json`, 2),
      blob('openapi/estero/US-871847072.json', 5),
    ], ORA, 1);
    expect(r.totale).toBe(3);
    expect(r.voci.map((v) => v.pathname)).toEqual([
      `openapi/aziende/${piva(3)}.json`,
      'openapi/estero/US-871847072.json',
      `openapi/aziende/${piva(1)}.json`,
    ]);
  });

  it('lascia fuori gli esempi demo del tool Marotta', () => {
    const r = selezionaRecenti([
      blob('openapi/estero/DE-DE129274202.json', 1),       // Siemens
      blob('openapi/estero/BR-33592510000154.json', 1),    // Vale, CNPJ senza punti e barra
      blob('openapi/estero/ES-A39000013.json', 1),         // Santander
      blob('openapi/estero/FR-447635830.json', 1),         // Les Bufflonnes du Sud
      blob('openapi/estero/DE-DE811220642.json', 1),       // un'altra tedesca, vera
    ], ORA, 1);
    expect(r.voci.map((v) => v.pathname)).toEqual(['openapi/estero/DE-DE811220642.json']);
  });

  it('ignora quello che non e una scheda (registro costi, verifiche, ricerche base)', () => {
    const r = selezionaRecenti([
      blob('openapi/costi/2026-10/123-IT-full.json', 1),
      blob(`openapi/verifiche/${piva(1)}.json`, 1),
      blob(`openapi/ricerche/${piva(1)}.json`, 1),
    ], ORA, 1);
    expect(r.totale).toBe(0);
    expect(r.pagine).toBe(1);
  });

  it('divide in pagine da dieci e porta all ultima una pagina che non esiste piu', () => {
    const tanti = Array.from({ length: 23 }, (_, i) => blob(`openapi/aziende/${piva(i)}.json`, i / 2));
    const p1 = selezionaRecenti(tanti, ORA, 1);
    expect([p1.totale, p1.pagine, p1.voci.length]).toEqual([23, 3, 10]);
    expect(p1.voci[0].pathname).toBe(`openapi/aziende/${piva(0)}.json`);
    const p3 = selezionaRecenti(tanti, ORA, 3);
    expect(p3.voci.length).toBe(3);
    expect(selezionaRecenti(tanti, ORA, 9).pagina).toBe(3);
    expect(selezionaRecenti(tanti, ORA, 0).pagina).toBe(1);
  });
});

describe('sintesi delle righe', () => {
  it('scheda italiana: nome, comune leggibile, provincia, rating e scadenza a 30 giorni', () => {
    const b = blob(`openapi/aziende/${piva(7)}.json`, 3);
    const v = sintesiItaliana({
      piva: piva(7),
      full: { companyDetails: { companyName: 'ESEMPIO S.R.L.' }, address: { town: 'FARRA DI SOLIGO', province: { code: 'TV', description: 'TREVISO' } } },
      advanced: { address: { registeredOffice: { town: 'FARRA DI SOLIGO', province: 'TV' } } },
      score: { rating: 'B2' },
    }, b);
    expect(v).toMatchObject({ tipo: 'italia', paese: 'IT', id: piva(7), ragioneSociale: 'ESEMPIO S.R.L.', sede: 'Farra di Soligo (TV)', rating: 'B2' });
    expect(Date.parse(v.scade) - Date.parse(v.analizzata)).toBe(30 * GIORNO);
  });

  it('scheda illeggibile: resta apribile con la partita IVA del percorso', () => {
    const v = sintesiItaliana(null, blob(`openapi/aziende/${piva(8)}.json`, 1));
    expect([v.id, v.ragioneSociale, v.sede]).toEqual([piva(8), null, null]);
  });

  it('controparte estera: torna l identificativo come era stato digitato', () => {
    const v = sintesiEstera(
      { paese: 'BR', identificativo: '12.345.678/0001-90', ragioneSociale: 'Esemplo Ltda' },
      blob('openapi/estero/BR-12345678000190.json', 1),
    );
    expect(v).toMatchObject({ tipo: 'estero', paese: 'BR', id: '12.345.678/0001-90', rating: null, sede: null });
  });
});

describe('nomeComune', () => {
  it.each([
    ['FARRA DI SOLIGO', 'Farra di Soligo'],
    ["SANT'ANGELO LODIGIANO", "Sant'Angelo Lodigiano"],
    ["CASSANO D'ADDA", "Cassano d'Adda"],
    ["SAN DONA' DI PIAVE", "San Dona' di Piave"],
    ["REGGIO NELL'EMILIA", "Reggio nell'Emilia"],
    ['DI MARZIO', 'Di Marzio'],
  ])('%s -> %s', (da, a) => expect(nomeComune(da)).toBe(a));
});
