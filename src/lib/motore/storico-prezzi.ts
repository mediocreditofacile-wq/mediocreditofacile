// Lo storico dei prezzi del catalogo: una riga in app.catalogo_storico a ogni cambio
// di prezzo o di validita' di una voce, dal Pannello MCF o dall'import da Excel
// (spec mcf_spec-ledoffice-motore_v1, paragrafi 4 e 10). La riga ha la stessa forma
// di quelle che scrive il seed (scripts/seed-motore-led-office.ts).
//
// ATTENZIONE — FILE SERVER-ONLY: legge e scrive il database. cambiaStorico e' pura.
//
// Il confronto si fa con l'ultima riga dello storico, non con la voce del catalogo:
// cosi' una voce che non ha ancora storico (caricata prima dello SQL 011) prende la
// sua prima riga al primo salvataggio, anche se il prezzo non cambia.

import { query, queryUna } from '../db';

export interface PrezzoStorico {
  prezzo: number;
  /** AAAA-MM-GG, null = senza scadenza */
  validoFino: string | null;
}

/** Ai centesimi: 0,1 + 0,2 non e' un prezzo diverso da 0,3 */
const centesimi = (v: number) => Math.round(v * 100);

/** Va scritta una riga di storico? Si' per una voce senza storico e a ogni cambio di prezzo o di validita'. */
export function cambiaStorico(prima: PrezzoStorico | null, dopo: PrezzoStorico): boolean {
  if (!prima) return true;
  return centesimi(prima.prezzo) !== centesimi(dopo.prezzo) || (prima.validoFino ?? null) !== (dopo.validoFino ?? null);
}

/** L'ultima riga di storico di una voce, o null se non ne ha */
export async function ultimoStorico(slug: string, codice: string): Promise<PrezzoStorico | null> {
  // La data esce come testo: pg la trasformerebbe in mezzanotte locale e si perde un giorno
  const r = await queryUna<{ prezzo: string; valido_fino: string | null }>(
    `SELECT prezzo, to_char(valido_fino, 'YYYY-MM-DD') AS valido_fino FROM app.catalogo_storico
      WHERE fornitore_slug = $1 AND codice = $2 ORDER BY registrato DESC, id DESC LIMIT 1`,
    [slug, codice],
  );
  return r ? { prezzo: Number(r.prezzo), validoFino: r.valido_fino ?? null } : null;
}

/** Scrive la riga di storico. Chi la chiama ha gia' chiesto a cambiaStorico */
export async function registraStorico(slug: string, codice: string, dopo: PrezzoStorico, utente: string): Promise<void> {
  await query(
    `INSERT INTO app.catalogo_storico (fornitore_slug, codice, prezzo, valido_fino, da_utente) VALUES ($1,$2,$3,$4,$5)`,
    [slug, codice, dopo.prezzo, dopo.validoFino, utente],
  );
}
