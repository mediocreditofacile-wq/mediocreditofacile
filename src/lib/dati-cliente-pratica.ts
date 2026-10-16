// Dati del cliente che una pratica deve avere per partire: contatti del
// referente e IBAN dell'azienda. Li controllano allo stesso modo il motore dei
// portali (/api/motore/pratica) e i portali pratiche (src/lib/pratiche-partner.ts),
// nel browser per far correggere subito e sul server perche' il browser si aggira.
//
// Modulo puro e client-safe, come iban.ts. Test in dati-cliente-pratica.test.ts.
// Regola decisa da Alberto il 16/10/2026: servono tutti e due, cellulare ed
// email, e l'IBAN, senza il quale la pratica non si apre. Prima bastava un
// contatto solo e l'IBAN era una voce della checklist.
// Il controllo dei contatti e' di buon senso, non di formato: un numero con
// 8-15 cifre (E.164 non va oltre) e un indirizzo con la chiocciola e un dominio.

import { controllaIban } from './iban';

export type ErroreReferente = 'cellulare_mancante' | 'cellulare_non_valido' | 'email_mancante' | 'email_non_valida';
export type EsitoReferente =
  | { ok: true; telefono: string; email: string }
  | { ok: false; errore: ErroreReferente; messaggio: string };

const MESSAGGI: Record<ErroreReferente, string> = {
  cellulare_mancante: 'Scrivi il cellulare del referente del cliente: serve insieme all\'email.',
  cellulare_non_valido: 'Il cellulare del referente non sembra un numero: controlla le cifre.',
  email_mancante: 'Scrivi l\'email del referente del cliente: serve insieme al cellulare.',
  email_non_valida: 'L\'email del referente non sembra valida: controlla chiocciola e dominio.',
};

type Motivo = { errore: ErroreReferente; messaggio: string };
const motivo = (e: ErroreReferente): Motivo => ({ errore: e, messaggio: MESSAGGI[e] });

/** null se il cellulare va bene, altrimenti il motivo. Lo usa il browser campo per campo. */
export function controllaCellulare(valore: string): Motivo | null {
  const telefono = String(valore ?? '').trim();
  if (!telefono) return motivo('cellulare_mancante');
  // Separatori ammessi: spazi, punti, trattini, barre, parentesi; prefisso + o 00
  const cifre = telefono.replace(/[\s.\-/()]/g, '').replace(/^(\+|00)/, '');
  return /^\d{8,15}$/.test(cifre) ? null : motivo('cellulare_non_valido');
}

/** null se l'email va bene, altrimenti il motivo */
export function controllaEmail(valore: string): Motivo | null {
  const email = String(valore ?? '').trim();
  if (!email) return motivo('email_mancante');
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? null : motivo('email_non_valida');
}

export function controllaReferente(r: { telefono?: string; email?: string }): EsitoReferente {
  const no = controllaCellulare(r.telefono ?? '') ?? controllaEmail(r.email ?? '');
  if (no) return { ok: false, ...no };
  return { ok: true, telefono: String(r.telefono).trim(), email: String(r.email).trim() };
}

export type EsitoDatiCliente =
  | { ok: true; telefono: string; email: string; iban: string }
  | { ok: false; errore: ErroreReferente | 'iban_mancante' | 'iban_non_valido'; messaggio: string };

/** Cellulare, email e IBAN, nell'ordine in cui stanno nel modulo. L'IBAN esce normalizzato. */
export function controllaDatiCliente(d: { telefono?: unknown; email?: unknown; iban?: unknown }): EsitoDatiCliente {
  const testo = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const ref = controllaReferente({ telefono: testo(d.telefono), email: testo(d.email) });
  if (!ref.ok) return ref;
  const iban = controllaIban(testo(d.iban));
  if (!iban.ok) {
    return { ok: false, errore: iban.errore === 'mancante' ? 'iban_mancante' : 'iban_non_valido', messaggio: iban.messaggio };
  }
  return { ok: true, telefono: ref.telefono, email: ref.email, iban: iban.iban };
}
