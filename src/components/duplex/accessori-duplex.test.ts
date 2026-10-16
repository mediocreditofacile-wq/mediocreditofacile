// Il simulatore storico /tools/duplex legge gli stessi JSON del motore: le
// batterie di scorta compaiono solo sulla versione a batteria anche li'.

import { describe, expect, it } from 'vitest';
import { accessoriVisibili, MACCHINE_DUPLEX } from './accessori-duplex';

const ids = (famiglia: string, alimentazione: string | null) =>
  accessoriVisibili(famiglia, alimentazione).map((a) => a.id);

describe('accessori del simulatore /tools/duplex', () => {
  it('le dieci macchine del listino', () => {
    expect(MACCHINE_DUPLEX).toHaveLength(10);
    expect(MACCHINE_DUPLEX[0]).toMatchObject({ id: 'ultrax-45', prezzo: 3500, alimentazione: null });
  });
  it('340 e 420 a batteria: spazzole e le due batterie di scorta', () => {
    expect(ids('Duplex 340', 'batteria')).toEqual(['d340-blu', 'd340-med', 'd340-max', 'd340-batteria-lite', 'd340-batteria-pro']);
    expect(ids('Duplex 420', 'batteria')).toEqual(['d420-blu', 'd420-med', 'd420-max', 'd420-batteria-lite', 'd420-batteria-pro']);
  });
  it('a cavo e Steam: solo le spazzole, come prima', () => {
    expect(ids('Duplex 340', 'cavo')).toEqual(['d340-blu', 'd340-med', 'd340-max']);
    expect(ids('Duplex 420', 'steam')).toEqual(['d420-blu', 'd420-med', 'd420-max']);
  });
  it('620 a batteria: il listino 2024 non ha la sua batteria', () => {
    expect(ids('Duplex 620', 'batteria')).toEqual(['d620-med', 'd620-max']);
  });
  it('Ultrax ed Escalator invariati', () => {
    expect(ids('Ultrax 45', null)).toEqual(['ux-microfibra', 'ux-squeegy']);
    expect(ids('Duplex Escalator', null)).toEqual([]);
  });
  it('prezzi e limiti delle batterie', () => {
    const b = accessoriVisibili('Duplex 340', 'batteria').filter((a) => a.id.includes('batteria'));
    expect(b.map((a) => [a.label, a.prezzo, a.step, a.max])).toEqual([
      ['Batteria di scorta LITE Li-ion 48V', 390, 1, 2],
      ['Batteria di scorta PRO Li-ion 48V', 595, 1, 2],
    ]);
  });
});
