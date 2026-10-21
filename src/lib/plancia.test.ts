// La plancia segue l'indice Portali Clienti: ogni portale dell'indice ha le
// sue credenziali, e nessuna credenziale si perde per strada.

import { describe, expect, it } from 'vitest';
import { CREDENZIALI } from '../data/credenziali-portali';
import { AREE_PARTNER, PORTALI_PRATICHE } from '../data/portali-clienti';
import { componiPlancia } from './plancia';

const { sezioni, senzaCredenziali } = componiPlancia(CREDENZIALI, PORTALI_PRATICHE, AREE_PARTNER);
const sezione = (id: string) => sezioni.find((s) => s.id === id)!;
const percorsi = (id: string) => sezione(id).voci.map((v) => v.percorso);

describe('plancia', () => {
  it('ogni portale dell indice ha le credenziali in plancia', () => {
    expect(senzaCredenziali).toEqual([]);
  });

  it('le sezioni dell indice seguono l ordine dell indice', () => {
    expect(percorsi('pratiche')).toEqual(PORTALI_PRATICHE.map((p) => p.href));
    expect(percorsi('aree')).toEqual(AREE_PARTNER.map((p) => p.href));
  });

  it('Led Office sta fra i portali pratiche, ad accesso personale, col settore dell indice', () => {
    const v = sezione('pratiche').voci.find((x) => x.percorso === '/portale/led-office');
    expect(v).toMatchObject({ tipo: 'personale', settore: 'Informatica e digital signage' });
    expect(v!.password).toBeUndefined();
  });

  it('i portali che non stanno nell indice finiscono a parte', () => {
    expect(percorsi('fuori')).toEqual(expect.arrayContaining(['/portale/fas-italia-orby1x', '/tools/edilizia-gierre', '/tools/gruppo-barone', '/tools/datron']));
    expect(percorsi('fuori')).not.toContain('/portale/led-office');
  });

  it('gli strumenti interni hanno la loro scheda', () => {
    expect(sezione('interni').scheda).toBe('interni');
    expect(sezione('interni').voci.every((v) => v.tipo === 'interno')).toBe(true);
    expect(sezioni.filter((s) => s.id !== 'interni').every((s) => s.scheda === 'clienti')).toBe(true);
  });

  it('nessuna credenziale si perde e nessuna compare due volte', () => {
    const tutte = sezioni.flatMap((s) => s.voci).map((v) => v.percorso);
    expect(tutte).toHaveLength(CREDENZIALI.length);
    expect(new Set(tutte).size).toBe(tutte.length);
  });

  it('una voce dell indice senza credenziali si vede e si segnala', () => {
    const r = componiPlancia([], [{ nome: 'Nuovo', href: '/portale/nuovo', icona: 'x', settore: 'Prova', descrizione: '' }], []);
    expect(r.senzaCredenziali).toEqual(['/portale/nuovo']);
    expect(r.sezioni[0].voci[0]).toMatchObject({ nome: 'Nuovo', tipo: 'mancante' });
  });

  it('la barra finale del percorso non conta', () => {
    const r = componiPlancia(
      [{ nome: 'Marotta', percorso: '/tools/marotta/', password: '1', tipo: 'partner' }],
      [],
      [{ nome: 'Marotta', href: '/tools/marotta', icona: 'x', settore: 'Rete', descrizione: '' }],
    );
    expect(r.senzaCredenziali).toEqual([]);
    expect(r.sezioni.find((s) => s.id === 'fuori')!.voci).toEqual([]);
  });
});
