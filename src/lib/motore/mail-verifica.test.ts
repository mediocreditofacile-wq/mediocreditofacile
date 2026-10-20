// La mail ad Alberto per ogni verifica nuova: deve dire chi, cosa, con quale
// esito, e non nominare il locatore.

import { describe, expect, it } from 'vitest';
import { corpoMailVerifica, type DatiMailVerifica } from './mail-verifica';

const OGGI = new Date(2026, 9, 15);
const D: DatiMailVerifica = {
  fornitore: 'Duplex',
  agente: { nome: 'Mario Rossi', email: 'mario@example.invalid' },
  scheda: {
    piva: '01234567890', ragioneSociale: 'PULIZIE PROVA SRL', formaGiuridica: "SOCIETA' A RESPONSABILITA' LIMITATA",
    sede: 'Via Roma 1, Prato (PO)', ateco: null, attivaDal: '01/03/2010', statoAttivita: 'Attiva', fatturato: 850000,
    annoBilancio: 2025, trendFatturato: null, utile: 41000, patrimonioNetto: 310000, ebitda: null, dipendenti: null,
    rating: null, lineaCreditoConsigliata: null, unitaLocali: [],
  },
  dati: {
    fatturato: 850000, annoBilancio: 2025, patrimonioNetto: 310000, utile: 41000, inizioAttivita: '2010-03-01',
    rating: null, formaCodice: 'SR', attiva: true, cessata: false,
  },
  nuova: { scheda: true, eventi: true },
};

describe('mail della verifica', () => {
  it('oggetto e corpo', () => {
    const m = corpoMailVerifica(D, 'assenti', OGGI);
    expect(m.subject).toBe('Verifica Duplex — PULIZIE PROVA SRL — Buone basi');
    expect(m.html).toContain('01234567890');
    expect(m.html).toContain('mario@example.invalid');
    expect(m.html).toContain('assenti');
    expect(m.html).toContain('scheda nuova, eventi nuovi');
    expect(m.html).toContain('Valutazione indicativa, non è una delibera');
  });
  it('eventi presenti: rosso nell oggetto', () => {
    expect(corpoMailVerifica(D, 'presenti', OGGI).subject).toMatch(/Difficile$/);
  });
  it('aggiornamento tardivo', () => {
    expect(corpoMailVerifica({ ...D, aggiornamento: true }, 'presenti', OGGI).subject).toMatch(/^Aggiornamento verifica Duplex/);
  });
  it('mai il nome del locatore', () => {
    expect(JSON.stringify(corpoMailVerifica(D, 'assenti', OGGI))).not.toMatch(/grenke|reterent/i);
  });
});
