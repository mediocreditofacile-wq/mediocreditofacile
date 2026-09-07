// Collegamento al Postgres Neon che regge gli utenti dei portali.
//
// ATTENZIONE — FILE SERVER-ONLY: dentro passa la stringa di connessione.
// Non importarlo mai da un'isola client.
//
// Perche' Postgres e non un JSON su Blob, come le pratiche: un file JSON si
// scrive tutto intero, quindi due modifiche in contemporanea (il referente che
// disattiva un agente mentre un altro accetta un invito) si perdono a vicenda
// senza dare errore. Gli utenti hanno scritture concorrenti, le pratiche no.

import pg from 'pg';

/** Env leggibile sia da Astro (import.meta.env) sia dai comandi node (process.env) */
export function env(nome: string): string | undefined {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return meta?.[nome] ?? process.env[nome];
}

let pool: pg.Pool | null = null;

/**
 * Pool condiviso. Su Vercel le istanze delle funzioni vengono riusate, quindi
 * il pool sopravvive tra una richiesta e l'altra: crearne uno nuovo a ogni
 * chiamata aprirebbe connessioni che nessuno chiude.
 */
export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = env('DATABASE_URL');
  if (!connectionString) throw new Error('DATABASE_URL non configurata');
  pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

/** Query parametrica. I valori passano sempre come parametri, mai concatenati. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  testo: string,
  valori: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(testo, valori);
  return res.rows;
}

/** Prima riga o null: comodo per le letture puntuali. */
export async function queryUna<T extends pg.QueryResultRow = pg.QueryResultRow>(
  testo: string,
  valori: unknown[] = [],
): Promise<T | null> {
  const righe = await query<T>(testo, valori);
  return righe[0] ?? null;
}
