// Protezioni della verifica partita IVA sulla pagina /fiera.
//
// SERVER-ONLY: legge il segreto del cookie e il database.
//
// La verifica e' pubblica e ogni ricerca fuori cache costa (IT-advanced oltre le
// 30 incluse al mese). Quattro anelli, dal piu' fine al piu' grosso:
//   1. cookie firmato per dispositivo: conta le ricerche. FINO A FIERA_FINE NON
//      FERMA NESSUNO (regola di Alberto: in fiera la demo non chiede mai la
//      registrazione). Dopo, serve la registrazione dalla prima ricerca, e il
//      modulo compilato estende l'uso di FIERA_RICERCHE_REGISTRATO ricerche.
//   2. frequenza per indirizzo IP: 10 al minuto. NON un tetto totale: in fiera
//      centinaia di persone stanno dietro lo stesso NAT del wifi o dietro il
//      CGNAT dell'operatore, e un tetto per IP bloccherebbe innocenti.
//   3. tetto giornaliero di ricerche a pagamento (FIERA_TETTO_GIORNO).
//   4. tetto di spesa del mese per la sola fiera (FIERA_TETTO_EURO), calcolato
//      in modo prudente: ogni chiamata al prezzo oltre franchigia, come se le 30
//      incluse non ci fossero (quelle servono al tool Marotta).
// Le ricerche servite dalla cache non passano dagli anelli 3 e 4: non costano.
//
// Se il database non risponde, gli anelli 2 e 3 si saltano e resta il 4: in
// fiera la pagina non si deve bloccare, e il tetto di spesa basta a fermare i danni.

import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env, query, queryUna } from './db';
import { spesaDelMese, LISTINO_OLTRE_FRANCHIGIA } from './openapi';

const COOKIE = 'mcf_fiera';
const DURATA_COOKIE = 30 * 24 * 60 * 60; // secondi
const PER_MINUTO = 10;

function numero(chiave: string, difetto: number): number {
  const v = Number(env(chiave));
  return Number.isFinite(v) && v > 0 ? v : difetto;
}

/** Fine del periodo gratuito. 'AAAA-MM-GG' vale fino a fine giornata, ora italiana. */
export function fineFiera(): number {
  const v = (env('FIERA_FINE') ?? '2026-10-04').trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59+02:00` : v;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export const inFiera = (ora = Date.now()) => ora <= fineFiera();

// --- anello 1: cookie firmato ---------------------------------------------------

export interface StatoDispositivo {
  /** Identificativo casuale del dispositivo, non legato a nessun dato personale */
  d: string;
  /** Ricerche fatte */
  n: number;
  /** Ricerche concesse dopo la registrazione (0 finche' non si registra) */
  a: number;
}

const segreto = () => env('FIERA_COOKIE_SECRET') ?? '';

function firma(testo: string): string {
  return createHmac('sha256', segreto()).update(testo).digest('base64url');
}

export function leggiDispositivo(request: Request): StatoDispositivo {
  const nuovo = { d: randomBytes(9).toString('base64url'), n: 0, a: 0 };
  if (!segreto()) return nuovo;
  const grezzo = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!grezzo) return nuovo;
  const [dati, sig] = grezzo.split('.');
  if (!dati || !sig) return nuovo;
  const atteso = Buffer.from(firma(dati));
  const arrivato = Buffer.from(sig);
  if (atteso.length !== arrivato.length || !timingSafeEqual(atteso, arrivato)) return nuovo;
  try {
    const s = JSON.parse(Buffer.from(dati, 'base64url').toString('utf8'));
    if (typeof s?.d !== 'string' || !Number.isFinite(s?.n) || !Number.isFinite(s?.a)) return nuovo;
    if (!Number.isFinite(s?.e) || s.e < Date.now()) return { ...nuovo, d: s.d };
    return { d: s.d, n: s.n, a: s.a };
  } catch {
    return nuovo;
  }
}

/** Header Set-Cookie. La scadenza sta anche dentro la firma, non solo nel Max-Age. */
export function cookieDispositivo(s: StatoDispositivo): string | null {
  if (!segreto()) return null;
  const dati = Buffer.from(JSON.stringify({ ...s, e: Date.now() + DURATA_COOKIE * 1000 })).toString('base64url');
  return `${COOKIE}=${dati}.${firma(dati)}; Path=/api/; Max-Age=${DURATA_COOKIE}; HttpOnly; SameSite=Lax; Secure`;
}

/** Quante ricerche restano, null se illimitate (periodo di fiera) */
export function restanti(s: StatoDispositivo): number | null {
  return inFiera() ? null : Math.max(0, s.a - s.n);
}

/** Estende l'uso dopo la registrazione: il lead e' arrivato, lo strumento continua */
export function registra(s: StatoDispositivo): StatoDispositivo {
  return { ...s, a: Math.max(s.a, s.n) + numero('FIERA_RICERCHE_REGISTRATO', 20) };
}

/** Serve la registrazione prima di cercare? Mai durante la fiera. */
export function serveRegistrazione(s: StatoDispositivo): boolean {
  if (inFiera()) return false;
  return s.n >= s.a;
}

// --- anello 2: frequenza per IP --------------------------------------------------

export function ipDellaRichiesta(request: Request): string {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'sconosciuto'
  );
}

/** L'IP non si salva in chiaro: impronta con segreto, buona solo per contare */
export const impronta = (ip: string) => createHash('sha256').update(`${segreto()}|${ip}`).digest('hex').slice(0, 32);

export async function troppeRichieste(ipHash: string): Promise<boolean> {
  try {
    const r = await queryUna<{ n: string }>(
      `SELECT count(*) AS n FROM app.fiera_ricerca WHERE ip_hash = $1 AND quando > now() - interval '1 minute'`,
      [ipHash],
    );
    return Number(r?.n ?? 0) >= PER_MINUTO;
  } catch (err) {
    console.error(JSON.stringify({ evento: 'fiera_db_errore', dove: 'frequenza', msg: String(err) }));
    return false;
  }
}

// --- anelli 3 e 4: tetti globali -------------------------------------------------

export interface StatoServizio {
  attivo: boolean;
  motivo?: 'tetto_giorno' | 'tetto_spesa';
  spesaFiera: number;
  ricercheOggi: number | null;
}

export async function statoServizio(): Promise<StatoServizio> {
  const consumo = await spesaDelMese();
  const fiera = consumo.perSorgente.fiera;
  // Prudente: ogni chiamata della fiera al prezzo oltre franchigia, piu' quello
  // che COSTI conta gia' per i servizi a pagamento pieno
  let spesaFiera = fiera.totale;
  for (const [servizio, n] of Object.entries(fiera.perServizio)) {
    spesaFiera += n * ((LISTINO_OLTRE_FRANCHIGIA as Record<string, number>)[servizio] ?? 0);
  }
  spesaFiera = Math.round(spesaFiera * 100) / 100;

  let ricercheOggi: number | null = null;
  try {
    const r = await queryUna<{ n: string }>(
      `SELECT count(*) AS n FROM app.fiera_ricerca
        WHERE fonte = 'openapi'
          AND quando >= (date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome')`,
    );
    ricercheOggi = Number(r?.n ?? 0);
  } catch (err) {
    console.error(JSON.stringify({ evento: 'fiera_db_errore', dove: 'giorno', msg: String(err) }));
  }

  if (spesaFiera >= numero('FIERA_TETTO_EURO', 15)) return { attivo: false, motivo: 'tetto_spesa', spesaFiera, ricercheOggi };
  if (ricercheOggi != null && ricercheOggi >= numero('FIERA_TETTO_GIORNO', 100)) {
    return { attivo: false, motivo: 'tetto_giorno', spesaFiera, ricercheOggi };
  }
  return { attivo: true, spesaFiera, ricercheOggi };
}

// --- registro delle ricerche ------------------------------------------------------

export async function annota(riga: { ipHash: string; dispositivo: string; esito: string; fonte?: string | null }) {
  try {
    await query(
      `INSERT INTO app.fiera_ricerca (ip_hash, dispositivo, esito, fonte) VALUES ($1, $2, $3, $4)`,
      [riga.ipHash, riga.dispositivo, riga.esito, riga.fonte ?? null],
    );
  } catch (err) {
    console.error(JSON.stringify({ evento: 'fiera_db_errore', dove: 'annota', msg: String(err) }));
  }
}
