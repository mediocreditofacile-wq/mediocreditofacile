import { describe, expect, it } from 'vitest';
import { controllaIban, formattaIban, normalizzaIban } from './iban';

// IBAN di esempio pubblici (registro SWIFT, ECBS): validi, nessun conto vero dietro
const IT = 'IT60X0542811101000000123456';
const VALIDI = [
  IT,
  'SM86U0322509800000000270100', // San Marino, stessa struttura dell'italiano
  'DE89370400440532013000',
  'FR1420041010050500013M02606',
  'GB82WEST12345698765432',
  'NL91ABNA0417164300',
  'CH9300762011623852957',
];

describe('normalizzaIban', () => {
  it('toglie gli spazi, anche quelli copiati da un PDF, e mette in maiuscolo', () => {
    expect(normalizzaIban(' it60 x054 2811 1010 0000 0123 456 ')).toBe(IT);
    expect(normalizzaIban('IT60 X054​2811\t1010 0000 0123 456')).toBe(IT);
  });
});

describe('controllaIban', () => {
  it('accetta gli IBAN di esempio validi e restituisce la forma normalizzata', () => {
    for (const iban of VALIDI) expect(controllaIban(iban)).toEqual({ ok: true, iban });
    expect(controllaIban('it60 x054 2811 1010 0000 0123 456')).toEqual({ ok: true, iban: IT });
  });

  it('rifiuta il campo vuoto', () => {
    const r = controllaIban('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('mancante');
  });

  it('rifiuta un IBAN con una cifra sbagliata, in qualunque posizione', () => {
    for (let i = 2; i < IT.length; i++) {
      const c = IT[i];
      if (!/\d/.test(c)) continue;
      for (const d of '0123456789') {
        if (d === c) continue;
        const sbagliato = IT.slice(0, i) + d + IT.slice(i + 1);
        const r = controllaIban(sbagliato);
        expect(r.ok, sbagliato).toBe(false);
        if (!r.ok) expect(r.errore).toBe('controllo');
      }
    }
  });

  it('rifiuta due cifre vicine invertite', () => {
    const r = controllaIban('IT60X0542811101000000123465');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('controllo');
  });

  it('rifiuta le cifre di controllo 00, 01, 99 anche quando il resto della divisione torna', () => {
    // IT98... e' valido; IT01... ha lo stesso resto ma 01 non e' una cifra di controllo ammessa
    expect(controllaIban('IT98X0542811101000000000067').ok).toBe(true);
    const r = controllaIban('IT01X0542811101000000000067');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('controllo');
  });

  it("rifiuta un IBAN italiano con un carattere in meno o in piu', e lo dice", () => {
    const corto = controllaIban(IT.slice(0, -1));
    expect(corto.ok).toBe(false);
    if (!corto.ok) {
      expect(corto.errore).toBe('lunghezza');
      expect(corto.messaggio).toContain('27');
      expect(corto.messaggio).toContain('26');
    }
    const lungo = controllaIban(IT + '7');
    expect(lungo.ok).toBe(false);
    if (!lungo.ok) expect(lungo.errore).toBe('lunghezza');
  });

  it('controlla la lunghezza del paese giusto: un tedesco ha 22 caratteri', () => {
    const r = controllaIban('DE8937040044053201300');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errore).toBe('lunghezza');
      expect(r.messaggio).toContain('22');
    }
  });

  it('rifiuta caratteri che in un IBAN non ci stanno', () => {
    const r = controllaIban('IT60-X054-2811-1010-0000-0123-456');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe('caratteri');
  });

  it('rifiuta un IBAN che non inizia con la sigla di un paese', () => {
    for (const s of ['6060X0542811101000000123456', 'XX60X0542811101000000123456']) {
      const r = controllaIban(s);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.errore).toBe('paese');
    }
  });

  it('ha un messaggio in italiano per ogni errore', () => {
    for (const s of ['', 'IT60-X', 'XX60X0542811101000000123456', IT.slice(0, -1), 'IT60X0542811101000000123457']) {
      const r = controllaIban(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.messaggio.length).toBeGreaterThan(20);
    }
  });
});

describe('formattaIban', () => {
  it('scrive a gruppi di quattro, come sui documenti della banca', () => {
    expect(formattaIban(IT)).toBe('IT60 X054 2811 1010 0000 0123 456');
    expect(formattaIban('it60x0542811101000000123456')).toBe('IT60 X054 2811 1010 0000 0123 456');
  });
});
