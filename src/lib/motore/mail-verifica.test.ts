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
  it('senza prefiltro niente righe di cliente segnalato o pratica recente', () => {
    const m = corpoMailVerifica(D, 'assenti', OGGI);
    expect(m.html).not.toContain('Cliente segnalato');
    expect(m.html).not.toContain('Pratica recente');
    expect(m.html).toContain('Criteri');
  });
});

// Sul prefiltro (Led Office) la mail resta solo a MCF: porta i dettagli che il
// commerciale non vede, cioe' motivo della segnalazione e dove sta la pratica recente
describe('mail della verifica col prefiltro', () => {
  const LED: DatiMailVerifica = {
    ...D,
    fornitore: 'Led Office',
    dati: { ...D.dati, bilanciConRicavi: [2025, 2024], capitaleSociale: 50_000, dipendenti: 12, atecoCodice: '81.21.00' },
    prefiltro: { segnali: { segnalato: null, praticaRecente: null } },
  };

  it('oggetto con l etichetta del prefiltro', () => {
    expect(corpoMailVerifica(LED, 'assenti', OGGI).subject).toBe('Verifica Led Office — PULIZIE PROVA SRL — In linea con il prefiltro');
  });
  it('pratica recente: data, canale, fornitore e fonte', () => {
    const m = corpoMailVerifica({
      ...LED,
      prefiltro: { segnali: { segnalato: null, praticaRecente: { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' } } },
    }, 'assenti', OGGI);
    expect(m.subject).toMatch(/Da completare$/);
    expect(m.html).toContain('Pratica recente');
    expect(m.html).toContain('28/07/2026');
    // Il canale col suo nome, non con l'id del database
    expect(m.html).toContain('Pagarent');
    expect(m.html).toContain('led-office');
    expect(m.html).toContain('storico importato');
  });
  it('pratica recente su Rete Rent: "Rete Rent", mai l\'id reterent', () => {
    const m = corpoMailVerifica({
      ...LED,
      prefiltro: { segnali: { segnalato: null, praticaRecente: { data: '2026-07-28', canale: 'reterent', fornitore: null, fonte: 'esterna' } } },
    }, 'assenti', OGGI);
    expect(m.html).toContain('Rete Rent');
    expect(m.html).not.toContain('reterent');
    expect(m.html).toContain('fornitore non indicato');
  });
  it('cliente segnalato: motivo ed effetto', () => {
    const m = corpoMailVerifica({
      ...LED,
      prefiltro: { segnali: { segnalato: { motivo: 'insoluto', effetto: 'blocco' }, praticaRecente: null } },
    }, 'non-avviata', OGGI);
    expect(m.subject).toMatch(/Non lavorabile dal portale$/);
    expect(m.html).toContain('Cliente segnalato');
    expect(m.html).toContain('insoluto');
    expect(m.html).toContain('blocco');
    // sul bloccato il prefiltro non ha criteri: niente titolo vuoto
    expect(m.html).not.toContain('Criteri');
  });
  it('eventi presenti: rosso del prefiltro', () => {
    expect(corpoMailVerifica(LED, 'presenti', OGGI).subject).toMatch(/Non presentabile dal portale$/);
  });
  it('sempre la nota sulla valutazione indicativa', () => {
    expect(corpoMailVerifica(LED, 'assenti', OGGI).html).toContain('Valutazione indicativa, non è una delibera');
  });
});
