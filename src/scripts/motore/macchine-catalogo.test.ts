// Il catalogo del settore macchine nel browser: famiglie, contatori, listino.
// Il controllo vero lo rifa' il server.

import { describe, expect, it } from 'vitest';
import { vociDuplex } from '../../lib/motore/catalogo-duplex';
import { accessoriPer, cambiaQuantita, famiglie, listinoConfigurazione, tieniCompatibili } from './macchine-catalogo';

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
    expect(d340.accessori).toHaveLength(5);
    expect(f.find((x) => x.nome === 'Duplex Escalator')!.accessori).toEqual([]);
  });
});

describe('accessori della macchina scelta', () => {
  const d340 = famiglie(CATALOGO).find((x) => x.nome === 'Duplex 340')!;
  const variante = (allestimento: string) => d340.varianti.find((v) => v.attributi.allestimento === allestimento)!;
  const codici = (allestimento: string) => accessoriPer(d340, variante(allestimento)).map((a) => a.codice);

  it('le batterie di scorta solo sulla versione a batteria', () => {
    expect(codici('cavo')).toEqual(['D340-BLU', 'D340-MED', 'D340-MAX']);
    expect(codici('steam')).toEqual(['D340-BLU', 'D340-MED', 'D340-MAX']);
    expect(codici('batteria')).toEqual(['D340-BLU', 'D340-MED', 'D340-MAX', 'D340-BATTERIA-LITE', 'D340-BATTERIA-PRO']);
  });
  it('una famiglia senza allestimenti tiene tutti i suoi accessori', () => {
    const ux = famiglie(CATALOGO)[0];
    expect(accessoriPer(ux, ux.varianti[0]).map((a) => a.codice)).toEqual(['UX-MICROFIBRA', 'UX-SQUEEGY']);
  });
  it('passando a cavo le batterie scelte si tolgono, le spazzole restano', () => {
    const q = { 'D340-BLU': 2, 'D340-BATTERIA-LITE': 2, 'D340-BATTERIA-PRO': 1 };
    expect(tieniCompatibili(q, accessoriPer(d340, variante('cavo')))).toEqual({ 'D340-BLU': 2 });
    expect(tieniCompatibili(q, accessoriPer(d340, variante('batteria')))).toEqual(q);
  });
  it('il listino somma le batterie: 2.690 + 2 x 390', () => {
    const m = variante('batteria');
    expect(listinoConfigurazione(m, accessoriPer(d340, m), { 'D340-BATTERIA-LITE': 2 })).toBe(3470);
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
