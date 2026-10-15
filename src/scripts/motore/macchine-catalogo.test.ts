// Il catalogo del settore macchine nel browser: famiglie, contatori, listino.
// Il controllo vero lo rifa' il server.

import { describe, expect, it } from 'vitest';
import { vociDuplex } from '../../lib/motore/catalogo-duplex';
import { cambiaQuantita, famiglie, listinoConfigurazione } from './macchine-catalogo';

const CATALOGO = vociDuplex();

describe('famiglie', () => {
  const f = famiglie(CATALOGO);
  it('cinque famiglie nell ordine del catalogo', () => {
    expect(f.map((x) => x.nome)).toEqual(['Ultrax 45', 'Duplex 340', 'Duplex 420', 'Duplex 620', 'Duplex Escalator']);
  });
  it('varianti, prezzo da e accessori della famiglia', () => {
    const d340 = f.find((x) => x.nome === 'Duplex 340')!;
    expect(d340.varianti).toHaveLength(3);
    expect(d340.da).toBe(1931);
    expect(d340.accessori).toHaveLength(3);
    expect(f.find((x) => x.nome === 'Duplex Escalator')!.accessori).toEqual([]);
  });
});

describe('contatori', () => {
  it('a passi e dentro il massimo', () => {
    expect(cambiaQuantita(0, 1, 2, 4)).toBe(2);
    expect(cambiaQuantita(4, 1, 2, 4)).toBe(4);
    expect(cambiaQuantita(2, -1, 2, 4)).toBe(0);
    expect(cambiaQuantita(0, -1)).toBe(0);
    expect(cambiaQuantita(0, 1)).toBe(1);
  });
});

describe('listino della configurazione', () => {
  it('Ultrax 45 con due spazzole in microfibra', () => {
    const ux = famiglie(CATALOGO)[0];
    expect(listinoConfigurazione(ux.varianti[0], ux.accessori, { 'UX-MICROFIBRA': 2 })).toBe(3738);
    expect(listinoConfigurazione(ux.varianti[0], ux.accessori, {})).toBe(3500);
  });
});
