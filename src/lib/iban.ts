// Controllo dell'IBAN dell'azienda cliente, nei moduli pratica dei portali.
//
// Modulo puro e client-safe: lo usano il browser (il commerciale corregge
// subito) e il server (che non si fida del browser). Test in iban.test.ts.
//
// Regola decisa da Alberto il 16/10/2026: senza IBAN la pratica non si apre,
// e un IBAN sbagliato blocca l'invio. Il controllo e' quello della norma
// ISO 13616: lunghezza prevista dal paese e cifre di controllo modulo 97, che
// scoprono qualunque cifra sbagliata e quasi tutte le inversioni. Dice che
// l'IBAN e' scritto bene, non che il conto esiste.

export type ErroreIban = 'mancante' | 'caratteri' | 'paese' | 'lunghezza' | 'controllo';
export type EsitoIban =
  | { ok: true; iban: string }
  | { ok: false; errore: ErroreIban; messaggio: string };

/** Lunghezza dell'IBAN per paese, dal registro IBAN di SWIFT */
export const LUNGHEZZA_IBAN: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HN: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21,
  LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28,
  NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  RU: 33, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

/** Spazi via (anche quelli invisibili che arrivano copiando da un PDF), maiuscole */
export function normalizzaIban(grezzo: string): string {
  return String(grezzo ?? '').replace(/[\s​-‍﻿]/g, '').toUpperCase();
}

/** Resto della divisione per 97 del numero che si ottiene spostando in coda le prime quattro posizioni */
function resto97(iban: string): number {
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const c of riordinato) {
    // Le lettere valgono 10 (A) ... 35 (Z); si lavora a pezzi per non uscire dagli interi
    const valore = parseInt(c, 36);
    resto = (resto * (valore > 9 ? 100 : 10) + valore) % 97;
  }
  return resto;
}

const errore = (e: ErroreIban, messaggio: string): EsitoIban => ({ ok: false, errore: e, messaggio });

export function controllaIban(grezzo: string): EsitoIban {
  const iban = normalizzaIban(grezzo);
  if (!iban) return errore('mancante', "Scrivi l'IBAN del conto aziendale del cliente: senza, la pratica non si apre.");
  if (!/^[A-Z0-9]+$/.test(iban)) {
    return errore('caratteri', "L'IBAN contiene caratteri che non c'entrano: solo lettere e cifre, gli spazi si possono lasciare.");
  }
  const paese = iban.slice(0, 2);
  const attesa = LUNGHEZZA_IBAN[paese];
  if (!attesa) {
    return errore('paese', "L'IBAN deve iniziare con la sigla del paese, per un conto italiano IT.");
  }
  if (iban.length !== attesa) {
    const chi = paese === 'IT' ? 'Un IBAN italiano' : `Un IBAN che inizia con ${paese}`;
    const scarto = iban.length < attesa ? 'ne manca qualcuno' : "ce n'è di troppo";
    return errore('lunghezza', `${chi} ha ${attesa} caratteri, qui ce ne sono ${iban.length}: ${scarto}.`);
  }
  // Cifre di controllo ammesse: da 02 a 98. 00, 01 e 99 possono dare il resto giusto per caso.
  const cifre = Number(iban.slice(2, 4));
  if (!/^\d\d$/.test(iban.slice(2, 4)) || cifre < 2 || cifre > 98 || resto97(iban) !== 1) {
    return errore('controllo', "L'IBAN non torna: c'è un carattere sbagliato o due invertiti. Ricontrollalo sul documento del cliente.");
  }
  return { ok: true, iban };
}

/** A gruppi di quattro, come lo stampa la banca */
export function formattaIban(iban: string): string {
  return normalizzaIban(iban).replace(/(.{4})(?=.)/g, '$1 ');
}
