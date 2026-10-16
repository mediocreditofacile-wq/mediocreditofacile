import { describe, expect, it } from 'vitest';
import { controllaReferente } from './referente-cliente';

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
