// La plancia di MCF (/tools/credenziali): i portali a password unica con la
// loro password, quelli ad accesso personale senza, perche' lì ognuno entra
// col proprio account.

import { describe, expect, it } from 'vitest';
import { CREDENZIALI } from './credenziali-portali';

const per = (percorso: string) => CREDENZIALI.find((c) => c.percorso === percorso);

describe('accessi ai portali', () => {
  it('i portali ad accesso personale ci sono tutti, senza password', () => {
    for (const p of ['/portale/duplex', '/portale/led-office', '/portale/bergamelli', '/portale/fas-italia-orby1x', '/portale/demo-fotovoltaico', '/tools/green-go', '/tools/stilo']) {
      const c = per(p);
      expect(c, p).toBeDefined();
      expect(c!.tipo, p).toBe('personale');
      expect(c!.password, p).toBeUndefined();
    }
  });
  it('la vecchia password di STILO non compare piu', () => {
    expect(JSON.stringify(CREDENZIALI)).not.toContain('stilosrl');
  });
  it('il vecchio Duplex resta, con il nome che lo distingue dal portale nuovo', () => {
    expect(per('/tools/duplex')).toMatchObject({ nome: 'Duplex, simulatore con password unica', tipo: 'partner', password: 'duplex' });
  });
  it('Extreme Computer, portale pratiche a password, e in elenco', () => {
    expect(per('/tools/extreme-computer')).toMatchObject({ tipo: 'partner', utente: 'direzione@extremecomputer.it' });
  });
  it('ogni portale a password ha la sua password', () => {
    for (const c of CREDENZIALI.filter((x) => x.tipo !== 'personale')) expect(c.password, c.nome).toBeTruthy();
  });
});
