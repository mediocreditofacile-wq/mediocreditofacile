// L'anno dei documenti reddituali si calcola sulla data: dal 1° agosto la
// situazione provvisoria dell'anno in corso, prima l'anno appena chiuso.

import { describe, expect, it } from 'vitest';
import { annoReddituale, buildChecklist, documentoAnno, fraseDocumentoAnno } from './checklist-pratica';
import { annoBilancioAtteso } from './motore/semaforo-locatore';

const ottobre2026 = new Date(2026, 9, 23);
const luglio2027 = new Date(2027, 6, 31);
const agosto2027 = new Date(2027, 7, 1);

describe('anno del documento reddituale', () => {
  it('da agosto e l anno in corso, prima l anno appena chiuso', () => {
    expect(annoReddituale(ottobre2026)).toBe(2026);
    expect(annoReddituale(luglio2027)).toBe(2026);
    expect(annoReddituale(agosto2027)).toBe(2027);
  });

  it('segue la regola del semaforo, un anno dopo il bilancio atteso, mese per mese', () => {
    for (let mese = 0; mese < 12; mese++) {
      const giorno = new Date(2027, mese, 15);
      expect(annoReddituale(giorno), `mese ${mese + 1}`).toBe(annoBilancioAtteso(giorno) + 1);
    }
  });

  it('da agosto a dicembre chiede la situazione provvisoria dell anno, a societa e ditte', () => {
    expect(documentoAnno('societa', ottobre2026)).toBe('Situazione contabile provvisoria 2026');
    expect(documentoAnno('ditta', ottobre2026)).toBe('Situazione contabile provvisoria 2026');
    expect(fraseDocumentoAnno('societa', ottobre2026)).toBe('la situazione contabile provvisoria 2026');
  });

  it('da gennaio a luglio chiede l anno appena chiuso, come diceva il testo di inizio 2026', () => {
    expect(documentoAnno('societa', luglio2027)).toBe('Bilancio definitivo 2026 (anche pre-deposito)');
    expect(documentoAnno('ditta', luglio2027)).toBe('Situazione contabile aggiornata 2026');
    expect(fraseDocumentoAnno('societa', luglio2027)).toBe('il bilancio definitivo 2026');
    expect(fraseDocumentoAnno('ditta', luglio2027)).toBe('la situazione contabile 2026');
  });

  it('la checklist sopra 10.000 euro usa il documento dell anno giusto', () => {
    expect(buildChecklist('SRL', 20_000, [], ottobre2026)).toContain('Situazione contabile provvisoria 2026');
    expect(buildChecklist('Ditta individuale', 20_000, [], luglio2027)).toContain('Situazione contabile aggiornata 2026');
    expect(buildChecklist('SRL', 20_000, [], ottobre2026).join(' ')).not.toContain('2025');
    expect(buildChecklist('SRL', 8_000, [], ottobre2026).join(' ')).not.toMatch(/situazione|bilanc/i);
  });
});
