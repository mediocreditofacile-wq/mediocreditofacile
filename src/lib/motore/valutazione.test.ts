// Quale semaforo per quale fornitore: la credit policy del tool Marotta, che sui
// settori generico e fotovoltaico cambia i numeri, oppure i criteri del locatore,
// che non li cambiano mai. Sul settore macchine il listino e' unico.

import { describe, expect, it } from 'vitest';
import { valutaCredito } from '../credit-policy';
import type { Carrozzeria } from './carrozzeria';
import { calcolaProposte } from './proposte';
import { TESTI_PREFILTRO, valutaPrefiltro, type DatiPrefiltro, type SegnaliPrefiltro } from './prefiltro';
import { prefiltroPerSchermo, semaforoPerSchermo, valuta } from './valutazione';

const OGGI = new Date('2026-10-15T10:00:00+02:00');
const K: Carrozzeria = {
  slug: 'prova', nome: 'Prova', citta: null, prefisso: 'PR', organizationId: 'org', tabellaCanoni: 'sputnik',
  brand: { logo: null, colore: null, accento: null }, settore: 'generico', etichettaBene: 'Bene',
  partnerLeasing: 'alba', sogliaLeasing: 0, tettoMeseEuro: 30, demo: false, documentiExtra: [], attivo: true,
  tabellaAlternativa: null, regoleSemaforo: 'credit-policy', leasing: true, prezzoVerifica: null,
  canali: null, societaFornitrice: null, checklist: null, categorie: null,
};
const MACCHINE: Carrozzeria = { ...K, settore: 'macchine' };
const LOCATORE: Carrozzeria = { ...K, settore: 'macchine', regoleSemaforo: 'locatore', leasing: false };

const SOLIDA = { fatturato: 1_200_000, patrimonioNetto: 400_000, utile: 60_000, inizioAttivita: '2010-03-01' };
const PAREGGIO = { ...SOLIDA, utile: 0 }; // giallo con anticipo 10% nella credit policy
const IN_PERDITA = { ...SOLIDA, utile: -50_000 };

describe('credit policy', () => {
  it('sul generico e quella di sempre', () => {
    const v = valuta(K, PAREGGIO, 50_000, 'non-avviata', OGGI);
    const c = valutaCredito({ ...PAREGGIO, importo: 50_000, oggi: OGGI });
    expect(v.semaforo).toBe(c.semaforo);
    expect(v.anticipo).toBe(c.anticipo);
    expect(v.markup).toBe(c.markup);
    expect(v.locatore).toBeNull();
  });
  it('sul settore macchine informa ma non cambia i numeri', () => {
    const v = valuta(MACCHINE, PAREGGIO, 50_000, 'non-avviata', OGGI);
    expect(v.semaforo).toBe('giallo');
    expect(v.anticipo).toBe(0);
    expect(v.markup).toBe(0);
  });
  it('il rosso blocca sul generico, non sul settore macchine', () => {
    expect(valuta(K, IN_PERDITA, 50_000, 'non-avviata', OGGI).blocca).toBe(true);
    expect(valuta(MACCHINE, IN_PERDITA, 50_000, 'non-avviata', OGGI).blocca).toBe(false);
  });
});

describe('criteri del locatore', () => {
  const DATI = { ...SOLIDA, annoBilancio: 2025, formaCodice: 'SR', attiva: true, cessata: false };
  it('quattro colori, nessun effetto sui numeri', () => {
    const v = valuta(LOCATORE, DATI, 3500, 'assenti', OGGI);
    expect(v.semaforo).toBe('verde-scuro');
    expect(v.credito).toBeNull();
    expect(v.markup).toBe(0);
    expect(v.anticipo).toBe(0);
    expect(v.blocca).toBe(false);
  });
  it('allo schermo arrivano etichetta e righe', () => {
    const s = semaforoPerSchermo(valuta(LOCATORE, DATI, 3500, 'in-verifica', OGGI));
    expect(s.etichetta).toBe('Buone basi');
    expect(s.provvisorio).toBe(true);
    expect(s.eventi).toBe('in-verifica');
    expect(semaforoPerSchermo(valuta(K, SOLIDA, 50_000, 'non-avviata', OGGI)).etichetta).toBeNull();
  });
  it('allo schermo arriva l indicazione massima, solo sulla verifica senza importo', () => {
    expect(semaforoPerSchermo(valuta(LOCATORE, DATI, null, 'assenti', OGGI)).indicazioneMassima).toBe(180_000);
    expect(semaforoPerSchermo(valuta(LOCATORE, DATI, 3500, 'assenti', OGGI)).indicazioneMassima).toBeNull();
    // la credit policy di FAS ha il suo massimale e non questa riga
    expect(semaforoPerSchermo(valuta(K, SOLIDA, null, 'non-avviata', OGGI)).indicazioneMassima).toBeNull();
  });
});

describe('leasing spento', () => {
  it('nessuna proposta di leasing e il motivo', () => {
    const e = calcolaProposte(50_000, SOLIDA, { ...K, leasing: false }, OGGI);
    expect(e.leasing).toEqual([]);
    expect(e.motivoNoLeasing).toBe('Su questo portale si propone solo il noleggio operativo.');
    expect(e.noleggio.length).toBeGreaterThan(0);
  });
  it('con i default il leasing c e come prima', () => {
    expect(calcolaProposte(50_000, SOLIDA, K, OGGI).leasing.length).toBeGreaterThan(0);
  });
});

describe('prefiltro allo schermo', () => {
  const SANO: DatiPrefiltro = {
    formaCodice: 'SR', attiva: true, cessata: false, inizioAttivita: '2015-03-01',
    bilanciConRicavi: [2025, 2024], patrimonioNetto: 200_000, utile: 30_000,
    capitaleSociale: 50_000, dipendenti: 20, atecoCodice: '62.01.00',
  };
  const NESSUNO: SegnaliPrefiltro = { segnalato: null, praticaRecente: null };

  it('stesso formato del semaforo, coi campi del prefiltro e senza massimali', () => {
    const s = prefiltroPerSchermo(valutaPrefiltro({ ...SANO, utile: -5_000 }, NESSUNO, 'in-verifica', [], null, OGGI));
    expect(s.semaforo).toBe('giallo');
    expect(s.etichetta).toBe('Da completare');
    expect(s.provvisorio).toBe(true);
    expect(s.eventi).toBe('in-verifica');
    expect(s.massimale).toBeNull();
    expect(s.indicazioneMassima).toBeNull();
    expect(s.indicazioneBase).toBeNull();
    expect(s.motivazioniRichieste.map((m) => m.chiave)).toEqual(['perdita']);
    expect(s.ledwallMancante).toBe(false);
    expect(Object.keys(semaforoPerSchermo(valuta(LOCATORE, SOLIDA, null, 'assenti', OGGI))).every((c) => c in s)).toBe(true);
  });
  it('bloccato: solo il testo fisso, niente criteri e niente eventi', () => {
    const s = prefiltroPerSchermo(valutaPrefiltro(
      SANO, { segnalato: { motivo: 'insoluto', effetto: 'blocco' }, praticaRecente: null }, 'presenti', [], null, OGGI));
    expect(s.semaforo).toBe('bloccato');
    expect(s.righe).toEqual([TESTI_PREFILTRO.bloccato]);
    expect(s.criteri).toEqual([]);
    expect(s.eventi).toBeNull();
    expect(JSON.stringify(s)).not.toContain('insoluto');
  });
  it('la pratica recente arriva allo schermo solo come testo generico', () => {
    const s = prefiltroPerSchermo(valutaPrefiltro(SANO, {
      segnalato: null, praticaRecente: { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' },
    }, 'assenti', [], null, OGGI));
    expect(s.righe).toContain(TESTI_PREFILTRO.praticaRecente);
    expect(JSON.stringify(s)).not.toMatch(/pagarent|led-office|2026-07-28/);
  });
});
