// Sessione del motore dei portali: la guardia comune piu' la carrozzeria.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Ogni API del motore passa da qui. La regola resta quella di
// src/lib/portale-auth.ts: il fornitore si ricava dalla sessione, e lo slug
// che il client manda serve solo a scegliere fra i rapporti che l'utente ha
// gia'. In piu' qui si controlla che il fornitore sia davvero sul motore.

import { richiediSessione, vedeTuttoIlFornitore, type Contesto, type OpzioniSessione } from '../portale-auth';
import { carrozzeriaDaSlug, type Carrozzeria } from './carrozzeria';

export type EsitoMotore =
  | { ok: true; contesto: Contesto; carrozzeria: Carrozzeria; vedeTutto: boolean }
  | { ok: false; risposta: Response };

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

/** Legge il corpo JSON senza esplodere: un corpo rotto e' un oggetto vuoto */
export async function corpoJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const c = await request.json();
    return c && typeof c === 'object' ? (c as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function sessioneMotore(
  request: Request,
  slug: string | null | undefined,
  opzioni: Omit<OpzioniSessione, 'slugRichiesto'> = {},
): Promise<EsitoMotore> {
  if (!slug) return { ok: false, risposta: json({ ok: false, error: 'fornitore_non_indicato' }, 400) };

  const esito = await richiediSessione(request, { ...opzioni, slugRichiesto: slug });
  if (!esito.ok) return esito;
  const { contesto } = esito;
  if (!contesto.fornitoreSlug) return { ok: false, risposta: json({ ok: false, error: 'fornitore_non_indicato' }, 400) };

  const carrozzeria = await carrozzeriaDaSlug(contesto.fornitoreSlug);
  if (!carrozzeria) return { ok: false, risposta: json({ ok: false, error: 'non_sul_motore' }, 404) };
  if (!carrozzeria.attivo && contesto.ruolo !== 'admin') {
    return { ok: false, risposta: json({ ok: false, error: 'fornitore_sospeso' }, 403) };
  }
  return { ok: true, contesto, carrozzeria, vedeTutto: vedeTuttoIlFornitore(contesto) };
}

/**
 * Filtro dello storico: l'agente vede il proprio, referente e admin tutto il
 * fornitore. Restituisce la clausola e i valori, da accodare alla query.
 */
export function filtroVisibilita(
  e: { contesto: Contesto; vedeTutto: boolean },
  alias = '',
  primoIndice = 1,
): { where: string; valori: unknown[] } {
  const p = alias ? `${alias}.` : '';
  const valori: unknown[] = [e.contesto.organizationId];
  let where = `${p}organization_id = $${primoIndice}`;
  if (!e.vedeTutto) {
    valori.push(e.contesto.userId);
    where += ` AND ${p}user_id = $${primoIndice + 1}`;
  }
  return { where, valori };
}

/** Id leggibile in ora italiana: <PREFISSO>-AAAAMMGG-HHMMSS, con un infisso facoltativo */
export function generaId(prefisso: string, infisso = ''): string {
  const rome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const giorno = `${rome.getFullYear()}${pad(rome.getMonth() + 1)}${pad(rome.getDate())}`;
  const ora = `${pad(rome.getHours())}${pad(rome.getMinutes())}${pad(rome.getSeconds())}`;
  return `${prefisso}${infisso ? `-${infisso}` : ''}-${giorno}-${ora}`;
}
