// Gli stati della pratica (SQL 012, 22/10/2026): MCF vede su quale canale ha caricato
// la pratica, referente e agente leggono soltanto "inserita".

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ETICHETTA_STATO, STATI, statiPerAdmin, statoPerRuolo, statoValido, storiaPerRuolo } from './stati-pratica';

describe('stati della pratica', () => {
  it('gli otto stati del vincolo SQL, nello stesso ordine', () => {
    const sql = readFileSync('scripts/sql/012-pratica-stati-inserita.sql', 'utf8');
    const nelSql = [...sql.slice(sql.indexOf('CHECK')).matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(nelSql).toEqual([...STATI]);
  });

  it('i tre stati nuovi hanno il canale nell\'etichetta di MCF', () => {
    expect(ETICHETTA_STATO['inserita-pagarent']).toBe('Inserita PagaRent');
    expect(ETICHETTA_STATO['inserita-reterent']).toBe('Inserita ReteRent');
    expect(ETICHETTA_STATO['inserita-esterno']).toBe('Inserita fornitore esterno');
    expect(statiPerAdmin().map(([s]) => s)).toEqual([...STATI]);
  });

  it('solo gli stati del vincolo sono validi', () => {
    expect(statoValido('inserita-pagarent')).toBe(true);
    expect(statoValido('inserita')).toBe(false);
    expect(statoValido('Approvata')).toBe(false);
  });
});

describe('statoPerRuolo e storiaPerRuolo', () => {
  it('a referente e agente il canale non arriva', () => {
    for (const s of ['inserita-pagarent', 'inserita-reterent', 'inserita-esterno']) {
      expect(statoPerRuolo(s, false)).toBe('inserita');
      expect(statoPerRuolo(s, true)).toBe(s);
    }
    expect(statoPerRuolo('in-delibera', false)).toBe('in-delibera');
  });

  it('anche nella storia dei cambi, campi da e a', () => {
    const storia = [
      { da: 'ricevuta', a: 'inserita-pagarent', chi: 'Alberto', quando: '2026-10-22' },
      { da: 'inserita-pagarent', a: 'in-delibera', chi: 'Alberto', quando: '2026-10-23' },
    ];
    const ridotta = storiaPerRuolo(storia, false);
    expect(JSON.stringify(ridotta).toLowerCase()).not.toMatch(/pagarent|reterent|esterno/);
    expect(ridotta).toEqual([
      { da: 'ricevuta', a: 'inserita', chi: 'Alberto', quando: '2026-10-22' },
      { da: 'inserita', a: 'in-delibera', chi: 'Alberto', quando: '2026-10-23' },
    ]);
    expect(storiaPerRuolo(storia, true)).toBe(storia);
    expect(storiaPerRuolo(null, false)).toBeNull();
  });
});
