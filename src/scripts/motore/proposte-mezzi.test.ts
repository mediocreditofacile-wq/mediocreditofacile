// Il riquadro del noleggio della scheda Proposte (e della Simulazione) sul settore mezzi:
// la frase fissa "da confermare" compare una volta sola, con la stessa regola del PDF.
// Sul canale Econocom la nota del listino lo dice gia', e scritto due volte nello stesso
// riquadro sembrava una svista.

import { describe, expect, it } from 'vitest';
import { TABELLE } from '../../lib/tabelle-canoni';
import { serveFraseDaConfermare } from '../../lib/motore/nota-canone';
import { riquadroNoleggio } from './proposte-mezzi';

const rate = [{ durata: 36, canone: 6_304 }, { durata: 48, canone: 4_946 }, { durata: 60, canone: 4_152 }];
const riquadro = (daConfermare: boolean, nota: string | null) =>
  riquadroNoleggio({ noleggio: { rate, durataEvidenza: 60, nota, daConfermare }, motivoNoNoleggio: null });
const quante = (html: string) => (html.match(/da confermare/gi) ?? []).length;

describe('riquadroNoleggio: "da confermare" una volta sola', () => {
  it('Econocom, con la nota vera del listino: la dice la nota, la frase fissa non si aggiunge', () => {
    const nota = TABELLE['econocom-pa'].nota;
    expect(nota).toMatch(/da confermare/i);
    const html = riquadro(true, nota);
    expect(quante(html)).toBe(1);
    expect(html).toContain(nota);
    expect(html).not.toContain('Rata indicativa, da confermare.');
  });

  it('una rata da confermare con una nota che non lo dice: la frase fissa resta', () => {
    const html = riquadro(true, 'Fatturazione trimestrale anticipata.');
    expect(html).toContain('Rata indicativa, da confermare.');
    expect(quante(html)).toBe(1);
  });

  it('Grenke, rata non da confermare: nessuna frase', () => {
    expect(quante(riquadro(false, TABELLE.sputnik.nota))).toBe(0);
    expect(quante(riquadro(false, null))).toBe(0);
  });

  it('senza noleggio resta il motivo', () => {
    expect(riquadroNoleggio({ noleggio: null, motivoNoNoleggio: 'Mezzo targato.' })).toContain('Mezzo targato.');
  });
});

describe('serveFraseDaConfermare: la regola di schermo e PDF', () => {
  it('solo sulla rata da confermare e solo se la nota non lo dice gia\'', () => {
    expect(serveFraseDaConfermare(true, null)).toBe(true);
    expect(serveFraseDaConfermare(true, 'Fatturazione trimestrale.')).toBe(true);
    expect(serveFraseDaConfermare(true, 'Canone indicativo, DA CONFERMARE.')).toBe(false);
    expect(serveFraseDaConfermare(false, null)).toBe(false);
    expect(serveFraseDaConfermare(false, 'da confermare')).toBe(false);
  });
});
