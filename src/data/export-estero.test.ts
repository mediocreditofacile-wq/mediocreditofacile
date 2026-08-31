// Test della regola di instradamento export.
//
// La regola e' una sola: sopra i 200.000 EUR di operazione si va su Econocom, che
// ha la priorita' su tutto; sotto decide l'area. Questi test tengono ferma quella
// priorita', che e' la cosa piu' facile da rompere per sbaglio quando si aggiunge
// un caso particolare.

import { describe, it, expect } from 'vitest';
import {
  valutaCanaleEstero, SOGLIA_ECONOCOM, SOGLIA_CONTROPARTE,
  valutaCerta, inAreaSchengen, nuovaCostituzione,
} from './export-estero';

const grande = { fatturato: 8_000_000, patrimonioNetto: 3_000_000 };
const piccola = { fatturato: 800_000, patrimonioNetto: 300_000 };

describe('valutaCanaleEstero', () => {
  it('sopra i 200.000 va su Econocom, con la rata indicativa', () => {
    const e = valutaCanaleEstero(piccola, 'DE', 250_000);
    expect(e.canale).toBe('econocom');
    expect(e.soglia.superata).toBe(true);
    // 250.000 nella fascia 150-300k: coefficiente 0,0202
    expect(e.rataIndicativa?.rataMensile).toBeCloseTo(5050, 2);
    expect(e.rataIndicativa?.durataMesi).toBe(60);
  });

  it('Econocom ha la priorita anche fuori area Schengen', () => {
    const e = valutaCanaleEstero(piccola, 'BR', 400_000);
    expect(e.canale).toBe('econocom');
    expect(e.area).toBe('extra');
    expect(e.avvisi.join(' ')).toContain('operi in quel paese');
  });

  it('la dimensione della controparte non instrada: piccola sopra soglia resta Econocom', () => {
    expect(valutaCanaleEstero(piccola, 'DE', 300_000).canale).toBe('econocom');
  });

  it('la dimensione della controparte non instrada: grande sotto soglia resta Grenke', () => {
    const e = valutaCanaleEstero(grande, 'DE', 90_000);
    expect(e.canale).toBe('grenke');
    // pero' lo dice, perche' e' un argomento in piu' se si sceglie di alzare il tiro
    expect(e.avvisi.join(' ')).toContain('in target Econocom');
  });

  it('sotto soglia in area Schengen si resta sul noleggio Grenke', () => {
    const e = valutaCanaleEstero(piccola, 'ES', 120_000);
    expect(e.canale).toBe('grenke');
    expect(e.soglia.superata).toBe(false);
    expect(e.rataIndicativa).toBeNull();
    expect(e.prossimiPassi.join(' ')).toContain('Grenke');
  });

  it('sotto soglia fuori area Schengen si passa dal percorso assicurato SACE', () => {
    const e = valutaCanaleEstero(piccola, 'IN', 120_000);
    expect(e.canale).toBe('sace');
    expect(e.area).toBe('extra');
    expect(e.prossimiPassi.join(' ')).toContain('societa\' di locazione');
  });

  it('la soglia e stretta: 200.000 esatti non la superano, 200.001 si', () => {
    expect(valutaCanaleEstero(piccola, 'DE', 200_000).canale).toBe('grenke');
    expect(valutaCanaleEstero(piccola, 'DE', 200_001).canale).toBe('econocom');
  });

  it('senza importo non sceglie, e dice cosa serve', () => {
    const e = valutaCanaleEstero(grande, 'DE', null);
    expect(e.canale).toBe('incerto');
    expect(e.soglia.superata).toBeNull();
    expect(e.motivo).toContain('importo');
  });

  it('fuori area euro avvisa sulla valuta ma il canale lo decide lo stesso', () => {
    const e = valutaCanaleEstero(grande, 'BR', 90_000);
    expect(e.canale).toBe('sace');
    expect(e.avvisi.join(' ')).toContain('valuta');
  });

  it('senza bilancio pubblicato lo dice, senza bloccare la scelta', () => {
    const e = valutaCanaleEstero({ fatturato: null, patrimonioNetto: null }, 'DE', 250_000);
    expect(e.canale).toBe('econocom');
    expect(e.avvisi.join(' ')).toContain('Nessun dato di bilancio');
  });

  it('la rata segue le fasce Econocom', () => {
    expect(valutaCanaleEstero(piccola, 'DE', 400_000).rataIndicativa?.rataMensile).toBeCloseTo(8000, 2);
    expect(valutaCanaleEstero(piccola, 'DE', 600_000).rataIndicativa?.rataMensile).toBeCloseTo(11940, 2);
    expect(valutaCanaleEstero(piccola, 'DE', 800_000).rataIndicativa?.rataMensile).toBeCloseTo(15760, 2);
  });

  it('soglie e liste dei paesi', () => {
    expect(SOGLIA_ECONOCOM).toBe(200_000);
    expect(SOGLIA_CONTROPARTE).toBe(2_000_000);
    expect(valutaCerta('DE')).toBe(true);
    expect(valutaCerta('BR')).toBe(false);
    expect(valutaCerta('BG')).toBe(false);
    expect(inAreaSchengen('DE')).toBe(true);
    expect(inAreaSchengen('ch')).toBe(true);
    // Irlanda: fuori Schengen ma in euro e in SEPA, quindi dentro l'area del tool
    expect(inAreaSchengen('IE')).toBe(true);
    expect(inAreaSchengen('GB')).toBe(false);
    expect(inAreaSchengen('BR')).toBe(false);
  });

  it('riconosce le societa di nuova costituzione', () => {
    const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(nuovaCostituzione(ieri)).toBe(true);
    expect(nuovaCostituzione('1990-01-01')).toBe(false);
    expect(nuovaCostituzione(null)).toBeNull();
    expect(nuovaCostituzione('non una data')).toBeNull();
  });
});
