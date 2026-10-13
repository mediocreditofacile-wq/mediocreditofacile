// Pratiche dei portali partner ad accesso nominale: lettura, documenti, stato.
//
// ATTENZIONE — FILE SERVER-ONLY: legge lo store Blob privato.
//
// Le pratiche restano dove stavano, pratiche/<slug>/<id>/pratica.json, scritte
// da src/lib/pratiche-partner.ts come per gli altri portali. Cambia chi le
// legge: non piu' chiunque abbia la password del partner, ma la sessione, con
// le regole di src/lib/pratiche-visibilita.ts. Il fornitore lo decide
// richiediSessione() in /api/portale-pratiche, mai un parametro.

import { get, list, put } from '@vercel/blob';
import { pathPrefix, STATI_PRATICA } from '../data/portali-partner';
import { env } from './db';
import { praticaVisibile, type Lettore } from './pratiche-visibilita';

type Record_ = Record<string, unknown> & {
  id?: string;
  autore?: { userId?: string } | null;
  documenti?: { pathname?: string }[];
};

function token(): string {
  const t = env('BLOB_READ_WRITE_TOKEN');
  if (!t) throw new Error('blob_non_configurato');
  return t;
}

async function leggiRecord(pathname: string, t: string): Promise<Record_ | null> {
  try {
    const r = await get(pathname, { access: 'private', token: t });
    if (!r || !r.stream) return null;
    return JSON.parse(await new Response(r.stream).text()) as Record_;
  } catch {
    return null;
  }
}

/** Tutte le pratiche del fornitore, piu' recenti in alto (l'id contiene la data) */
export async function leggiPratiche(slug: string): Promise<Record_[]> {
  const t = token();
  const percorsi: string[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: pathPrefix(slug), limit: 1000, cursor, token: t });
    for (const b of pagina.blobs) if (b.pathname.endsWith('/pratica.json')) percorsi.push(b.pathname);
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);

  const record = (await Promise.all(percorsi.map((p) => leggiRecord(p, t)))).filter(Boolean) as Record_[];
  return record.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

export async function praticheVisibili(slug: string, lettore: Lettore): Promise<Record_[]> {
  return (await leggiPratiche(slug)).filter((p) => praticaVisibile(p, lettore));
}

/** Il file dallo store, gia' pronto da restituire al browser */
export async function rispostaDocumento(percorso: string): Promise<Response> {
  const r = await get(percorso, { access: 'private', token: token() });
  if (!r || r.statusCode !== 200 || !r.stream) return new Response('Documento non trovato', { status: 404 });
  const nome = percorso.split('/').pop() ?? 'documento';
  return new Response(r.stream, {
    headers: {
      'Content-Type': r.blob?.contentType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nome.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}

/**
 * Cambia lo stato di una pratica. Lo chiama solo l'admin MCF: il controllo del
 * ruolo sta nell'endpoint, qui si valida solo che id e stato siano sensati.
 */
export async function scriviStato(
  slug: string,
  id: string,
  stato: string,
  chi: string,
): Promise<{ ok: true; pratica: Record_ } | { ok: false; errore: string }> {
  // L'id lo genera il server (es. ST-20260723-101500): niente caratteri jolly nei percorsi
  if (!/^[A-Z]{2}-[\d-]+$/.test(id)) return { ok: false, errore: 'id_non_valido' };
  if (!STATI_PRATICA.includes(stato)) return { ok: false, errore: 'stato_non_valido' };

  const t = token();
  const pathname = `${pathPrefix(slug)}${id}/pratica.json`;
  const record = await leggiRecord(pathname, t);
  if (!record) return { ok: false, errore: 'pratica_non_trovata' };

  const adesso = new Date().toISOString();
  record.stato = stato;
  record.statoAggiornato = adesso;
  // Chi ha spostato lo stato e quando: la stessa traccia di app.pratica.storia nel motore
  const storia = Array.isArray(record.storia) ? (record.storia as unknown[]) : [];
  record.storia = [...storia, { stato, quando: adesso, chi }];

  await put(pathname, JSON.stringify(record, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60, // minimo consentito: le letture CDN restano fresche entro 1 minuto
    token: t,
  });
  return { ok: true, pratica: record };
}
