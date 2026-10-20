// I nomi dei canali nelle mail a MCF e nel Pannello: una mappa sola, e nessun id del
// database ("reterent") nel testo che legge Alberto.

import { describe, expect, it } from 'vitest';
import { CANALI_ESTERNI, NOMI_CANALE, nomeCanale } from './nomi-canale';

describe('nomeCanale', () => {
  it('i canali del motore e quelli delle pratiche esterne col loro nome', () => {
    expect(nomeCanale('pagarent')).toBe('Pagarent');
    expect(nomeCanale('grenke')).toBe('Grenke');
    expect(nomeCanale('econocom')).toBe('Econocom');
    expect(nomeCanale('reterent')).toBe('Rete Rent');
    expect(nomeCanale('ifis')).toBe('Ifis');
  });

  it('un id che non conosciamo resta com\'e\', l\'assenza resta assenza', () => {
    expect(nomeCanale('nuovo-canale')).toBe('nuovo-canale');
    expect(nomeCanale(null)).toBeNull();
    expect(nomeCanale(undefined)).toBeNull();
    expect(nomeCanale('')).toBeNull();
  });

  it('ogni canale delle pratiche esterne ha un nome', () => {
    for (const c of CANALI_ESTERNI) expect(NOMI_CANALE[c]).toBeTruthy();
  });
});
