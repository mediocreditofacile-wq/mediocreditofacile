import { describe, expect, it } from 'vitest';
import { controllaCellulare, controllaDatiCliente, controllaEmail, controllaReferente } from './dati-cliente-pratica';

describe('controllaReferente', () => {
  it('accetta cellulare ed email del referente', () => {
    expect(controllaReferente({ telefono: ' +39 333 123 4567 ', email: ' mario.rossi@esempio.it ' }))
      .toEqual({ ok: true, telefono: '+39 333 123 4567', email: 'mario.rossi@esempio.it' });
    expect(controllaReferente({ telefono: '333.1234567', email: 'a@b.it' }).ok).toBe(true);
    expect(controllaReferente({ telefono: '0039 (333) 123-4567', email: 'a@b.it' }).ok).toBe(true);
  });

  it("senza cellulare non passa, anche se c'e' l'email", () => {
    const r = controllaReferente({ telefono: '', email: 'mario.rossi@esempio.it' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('cellulare_mancante');
  });

  it("senza email non passa, anche se c'e' il cellulare", () => {
    const r = controllaReferente({ telefono: '3331234567', email: '  ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('email_mancante');
  });

  it('rifiuta un cellulare che non e\' un numero di telefono', () => {
    for (const t of ['333', 'chiamare Mario', '3331234567890123456', '+39 333 abc 4567']) {
      const r = controllaReferente({ telefono: t, email: 'a@b.it' });
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.errore).toBe('cellulare_non_valido');
    }
  });

  it('rifiuta una email senza chiocciola o senza dominio', () => {
    for (const e of ['mario.rossi', 'mario@', 'mario@esempio', 'mario rossi@esempio.it']) {
      const r = controllaReferente({ telefono: '3331234567', email: e });
      expect(r.ok, e).toBe(false);
      if (!r.ok) expect(r.errore).toBe('email_non_valida');
    }
  });

  it('ha un messaggio in italiano per ogni errore', () => {
    for (const c of [{ telefono: '', email: '' }, { telefono: '3', email: 'a@b.it' }, { telefono: '3331234567', email: 'x' }]) {
      const r = controllaReferente(c);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.messaggio.length).toBeGreaterThan(20);
    }
  });
});

describe('controllaDatiCliente', () => {
  const buoni = { telefono: '333 123 4567', email: 'mario@esempio.it', iban: 'it60 x054 2811 1010 0000 0123 456' };

  it('restituisce contatti ripuliti e IBAN normalizzato', () => {
    expect(controllaDatiCliente(buoni)).toEqual({
      ok: true, telefono: '333 123 4567', email: 'mario@esempio.it', iban: 'IT60X0542811101000000123456',
    });
  });

  it("senza IBAN la pratica non passa, anche con i contatti a posto", () => {
    const r = controllaDatiCliente({ ...buoni, iban: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('iban_mancante');
  });

  it('un IBAN sbagliato di una cifra non passa, e il messaggio dice perché', () => {
    const r = controllaDatiCliente({ ...buoni, iban: 'IT60X0542811101000000123457' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errore).toBe('iban_non_valido');
      expect(r.messaggio).toContain('non torna');
    }
  });

  it('senza email o senza cellulare non passa', () => {
    const a = controllaDatiCliente({ ...buoni, email: '' });
    const b = controllaDatiCliente({ ...buoni, telefono: '' });
    expect(a.ok || b.ok).toBe(false);
    if (!a.ok) expect(a.errore).toBe('email_mancante');
    if (!b.ok) expect(b.errore).toBe('cellulare_mancante');
  });

  it('regge valori che non sono stringhe, come arrivano da un JSON manomesso', () => {
    const r = controllaDatiCliente({ telefono: 3331234567 as unknown as string, email: null as unknown as string, iban: {} as unknown as string });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('email_mancante');
  });
});

describe('controllaCellulare e controllaEmail, campo per campo', () => {
  it('danno null se il campo va bene', () => {
    expect(controllaCellulare('+39 333 123 4567')).toBeNull();
    expect(controllaEmail('mario@esempio.it')).toBeNull();
  });

  it('danno il motivo se il campo manca o non va', () => {
    expect(controllaCellulare('')?.errore).toBe('cellulare_mancante');
    expect(controllaCellulare('12')?.errore).toBe('cellulare_non_valido');
    expect(controllaEmail(' ')?.errore).toBe('email_mancante');
    expect(controllaEmail('mario@')?.errore).toBe('email_non_valida');
    expect(controllaEmail('mario@')?.messaggio).toContain('email');
  });
});
