// La cartella riservata della proposta per il locatore e la regola di accesso di
// /api/motore/doc. Spec mcf_spec-ledoffice-motore_v1, paragrafo 8: la proposta per
// il locatore la scarica solo MCF, e un percorso indovinato non la consegna a
// referente e agente.

import { describe, expect, it } from 'vitest';
import { nomeNonIndovinabile, percorsoConsentito, percorsoRiservato } from './percorso-riservato';

describe('percorso riservato', () => {
  it('il percorso riservato sta sotto /mcf/', () =>
    expect(percorsoRiservato('led-office', 'LO-1', 'proposta-locatore-LO-1.pdf'))
      .toBe('preventivi/led-office/LO-1/mcf/proposta-locatore-LO-1.pdf'));

  it('il nome del file prende un pezzo casuale prima dell\'estensione', () => {
    expect(nomeNonIndovinabile('proposta-locatore-LO-1.pdf', '0123456789abcdef')).toBe('proposta-locatore-LO-1-0123456789abcdef.pdf');
    expect(nomeNonIndovinabile('senza-estensione', '0123456789abcdef')).toBe('senza-estensione-0123456789abcdef');
  });

  it('un pezzo casuale che non e\' di 16 cifre esadecimali non si accetta', () => {
    for (const c of ['', '123', 'zzzzzzzzzzzzzzzz', '0123456789abcdef0', '../../../../../x']) {
      expect(() => nomeNonIndovinabile('a.pdf', c)).toThrow();
    }
  });
});

describe('chi scarica cosa', () => {
  it('agente e referente: /mcf/ mai', () =>
    expect(percorsoConsentito('preventivi/led-office/LO-1/mcf/a.pdf', 'led-office', false)).toBeNull());
  it('admin: /mcf/ dal riservato', () =>
    expect(percorsoConsentito('preventivi/led-office/LO-1/mcf/a.pdf', 'led-office', true)).toBe('riservato'));
  it('nessuno fuori dalla cartella del fornitore', () =>
    expect(percorsoConsentito('preventivi/duplex/x.pdf', 'led-office', true)).toBeNull());

  it('i PDF del commerciale e i documenti delle pratiche passano dai documenti, per tutti', () => {
    for (const admin of [false, true]) {
      expect(percorsoConsentito('preventivi/led-office/LO-1/preventivo-canone-LO-1.pdf', 'led-office', admin)).toBe('documenti');
      expect(percorsoConsentito('pratiche/led-office/bozze/0b7c/visura.pdf', 'led-office', admin)).toBe('documenti');
    }
  });

  it('anche sotto le pratiche la cartella /mcf/ e\' solo dell\'admin', () => {
    expect(percorsoConsentito('pratiche/led-office/LO-P-1/mcf/a.pdf', 'led-office', false)).toBeNull();
    expect(percorsoConsentito('pratiche/led-office/LO-P-1/mcf/a.pdf', 'led-office', true)).toBe('riservato');
  });

  it('una cartella mcf a qualunque profondita\' e\' riservata; un file che si chiama mcf no', () => {
    expect(percorsoConsentito('preventivi/led-office/LO-1/x/mcf/a.pdf', 'led-office', false)).toBeNull();
    expect(percorsoConsentito('preventivi/led-office/LO-1/mcf', 'led-office', false)).toBe('documenti');
  });

  it('niente risalite, niente percorsi vuoti, niente fornitori dal nome simile', () => {
    expect(percorsoConsentito('preventivi/led-office/../duplex/x.pdf', 'led-office', true)).toBeNull();
    expect(percorsoConsentito('preventivi/led-office/LO-1/..%2Fmcf/a.pdf', 'led-office', false)).toBeNull();
    expect(percorsoConsentito('', 'led-office', true)).toBeNull();
    expect(percorsoConsentito('preventivi/led-office-bis/x.pdf', 'led-office', true)).toBeNull();
    expect(percorsoConsentito('preventivi/led-office/x.pdf', '', true)).toBeNull();
    expect(percorsoConsentito('brand/led-office.png', 'led-office', true)).toBeNull();
  });

  it('la cartella mcf si riconosce anche scritta in maiuscolo o con barre doppie', () => {
    expect(percorsoConsentito('preventivi/led-office/LO-1/MCF/a.pdf', 'led-office', false)).toBeNull();
    expect(percorsoConsentito('preventivi/led-office/LO-1//mcf/a.pdf', 'led-office', false)).toBeNull();
  });
});
