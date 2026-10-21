// Firmatario e recapiti per la fattura elettronica dalla scheda Openapi. Le forme dei
// campi sono quelle viste sulle schede in cache il 21/10/2026: birthDate con l'ora in
// coda, sdiCode a sette caratteri o "0000000", PEC anche in maiuscolo.

import { describe, expect, it } from 'vitest';
import { fatturazioneDaScheda, firmatarioDaScheda } from './registro-vendita';

describe('fatturazioneDaScheda', () => {
  it('PEC del Registro (IT-full) prima di quella di IT-advanced, in minuscolo', () => {
    expect(fatturazioneDaScheda({
      full: { pec: 'AZIENDA@ARUBAPEC.IT' },
      advanced: { pec: 'azienda@pec.it', sdiCode: 'm5uxcr1' },
    })).toEqual({ pec: 'azienda@arubapec.it', sdi: 'M5UXCR1' });
  });

  it('senza IT-full vale la PEC di IT-advanced', () => {
    expect(fatturazioneDaScheda({ advanced: { pec: 'azienda@pec.it' } }).pec).toBe('azienda@pec.it');
  });

  it('"0000000" vuol dire nessun codice SDI', () => {
    expect(fatturazioneDaScheda({ advanced: { sdiCode: '0000000' } }).sdi).toBeNull();
  });

  it('valori che non hanno la forma giusta valgono null', () => {
    expect(fatturazioneDaScheda({ full: { pec: 'non una pec' }, advanced: { sdiCode: 'AB12' } })).toEqual({ pec: null, sdi: null });
    expect(fatturazioneDaScheda(null)).toEqual({ pec: null, sdi: null });
  });
});

describe('firmatarioDaScheda', () => {
  const managers = [
    { name: 'ANNA', surname: 'BIANCHI', taxCode: 'BNCNNA75B41F205X', birthDate: '1975-02-01T00:00:00', isLegalRepresentative: false },
    { name: 'Giulio', surname: 'Bortone', taxCode: 'brtgli70a01f839x', birthDate: '1970-01-01T00:00:00', isLegalRepresentative: true },
  ];

  it('il primo legale rappresentante: nome in maiuscolo, nascita GG/MM/AAAA, codice fiscale', () => {
    expect(firmatarioDaScheda({ full: { managers } })).toEqual({
      nome: 'GIULIO BORTONE', nascita: '01/01/1970', codiceFiscale: 'BRTGLI70A01F839X',
    });
  });

  it('una societa\' che amministra non e\' un firmatario', () => {
    expect(firmatarioDaScheda({ full: { managers: [{ companyName: 'BETA HOLDING SRL', isLegalRepresentative: true }] } })).toBeNull();
  });

  it('senza legale rappresentante: null', () => {
    expect(firmatarioDaScheda({ full: { managers: [managers[0]] } })).toBeNull();
    expect(firmatarioDaScheda({})).toBeNull();
  });

  it('data e codice fiscale illeggibili restano vuoti, il nome resta', () => {
    expect(firmatarioDaScheda({ full: { managers: [{ name: 'MARIO', surname: 'ROSSI', taxCode: '123', isLegalRepresentative: true }] } }))
      .toEqual({ nome: 'MARIO ROSSI', nascita: '', codiceFiscale: '' });
  });
});
