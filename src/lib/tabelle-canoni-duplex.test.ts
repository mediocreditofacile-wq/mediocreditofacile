// I listini Duplex sul motore devono dare gli stessi canoni di /tools/duplex,
// al centesimo, su tutte le macchine e tutte le durate.

import { describe, expect, it } from 'vitest';
import listino from '../data/duplex-listino.json';
import { canoneDaCoefficiente, RISCATTO_PERC } from '../data/duplex-costi';
import { coefficienteGrace } from '../data/duplex-grace';
import { coefficienteSputnik } from '../data/duplex-sputnik';
import {
  getTabella,
  tabellaSeEsiste,
  TABELLA_GRACE_DUPLEX,
  TABELLA_SPUTNIK_DUPLEX,
  type TabellaCanoni,
} from './tabelle-canoni';

const canone = (t: TabellaCanoni, prezzo: number, durata: number) =>
  canoneDaCoefficiente(prezzo, t.coefficiente(prezzo, durata)!);

describe('listini Duplex sul motore', () => {
  it('si trovano per id', () => {
    expect(getTabella('sputnik-duplex')).toBe(TABELLA_SPUTNIK_DUPLEX);
    expect(getTabella('grace-duplex')).toBe(TABELLA_GRACE_DUPLEX);
    expect(tabellaSeEsiste('grace-duplex')).toBe(TABELLA_GRACE_DUPLEX);
    expect(tabellaSeEsiste('boh')).toBeNull();
    expect(tabellaSeEsiste(null)).toBeNull();
  });

  it('quattro durate e i riscatti di duplex-costi', () => {
    expect(TABELLA_SPUTNIK_DUPLEX.durate).toEqual([24, 36, 48, 60]);
    expect(TABELLA_GRACE_DUPLEX.durate).toEqual([24, 36, 48, 60]);
    expect(TABELLA_SPUTNIK_DUPLEX.riscatto).toEqual(RISCATTO_PERC);
    expect(TABELLA_GRACE_DUPLEX.riscatto).toEqual(RISCATTO_PERC);
  });

  it('stesso canone di /tools/duplex su tutto il listino', () => {
    for (const m of listino.macchine as { prezzo: number }[]) {
      for (const d of [24, 36, 48, 60]) {
        expect(canone(TABELLA_SPUTNIK_DUPLEX, m.prezzo, d)).toBe(canoneDaCoefficiente(m.prezzo, coefficienteSputnik(m.prezzo, d)!));
        expect(canone(TABELLA_GRACE_DUPLEX, m.prezzo, d)).toBe(canoneDaCoefficiente(m.prezzo, coefficienteGrace(m.prezzo, d)!));
      }
    }
  });

  it('i canoni letti su ReteRent', () => {
    expect(canone(TABELLA_SPUTNIK_DUPLEX, 3500, 60)).toBe(81);
    expect(canone(TABELLA_GRACE_DUPLEX, 3500, 60)).toBe(80.05);
    expect(canone(TABELLA_SPUTNIK_DUPLEX, 1931, 60)).toBe(51.6);
    expect(canone(TABELLA_GRACE_DUPLEX, 1931, 60)).toBe(51.15);
    expect(canone(TABELLA_SPUTNIK_DUPLEX, 2259, 60)).toBe(60.37);
  });

  it('fuori dai limiti non quota', () => {
    expect(TABELLA_SPUTNIK_DUPLEX.coefficiente(499, 60)).toBeNull();
    expect(TABELLA_SPUTNIK_DUPLEX.coefficiente(100_001, 60)).toBeNull();
    expect(TABELLA_GRACE_DUPLEX.coefficiente(100_001, 60)).not.toBeNull();
    expect(TABELLA_SPUTNIK_DUPLEX.quotabile(120_000)).toBe(false);
    expect(TABELLA_GRACE_DUPLEX.quotabile(120_000)).toBe(true);
    expect(TABELLA_SPUTNIK_DUPLEX.durateDisponibili(3500)).toEqual([24, 36, 48, 60]);
  });

  it('dal canone al prezzo dentro la fascia giusta', () => {
    expect(Math.round(TABELLA_SPUTNIK_DUPLEX.prezzoDaCanone(81, 60)!)).toBe(3500);
    expect(TABELLA_SPUTNIK_DUPLEX.prezzoDaCanone(0, 60)).toBeNull();
  });
});
