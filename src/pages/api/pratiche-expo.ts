export const prerender = false;

// Lista e aggiornamento stato delle pratiche dei portali partner.
// I record vivono su Vercel Blob (store privato) come JSON:
//   pratiche/<partner>/<id>/pratica.json
// GET  ?partner=<slug> → lista pratiche (bearer: password partner o chiave admin)
// POST → aggiorna lo stato di una pratica (solo chiave admin)
// Senza parametro partner risponde su Expo Energia: retrocompatibilita' con le
// pagine gia' in cache nei browser dei partner.

import { list, get, put } from '@vercel/blob';
import { getPartner, pathPrefix, ruoloDaChiave, STATI_PRATICA } from '../../data/portali-partner';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bearer(request: Request): string {
  return (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

async function readRecord(pathname: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await get(pathname, { access: 'private', token });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  if (!token) return jsonResponse({ ok: false, error: 'blob_not_configured' }, 503);

  const slug = new URL(request.url).searchParams.get('partner');
  const partner = getPartner(slug);
  if (!partner) return jsonResponse({ ok: false, error: 'unknown_partner' }, 404);

  const ruolo = ruoloDaChiave(bearer(request), partner, adminKey);
  if (!ruolo) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  try {
    const { blobs } = await list({ prefix: pathPrefix(partner.slug), limit: 500, token });
    const recordPaths = blobs
      .filter((b) => b.pathname.endsWith('/pratica.json'))
      .map((b) => b.pathname);

    const records = (await Promise.all(recordPaths.map((p) => readRecord(p, token)))).filter(Boolean);
    // Piu' recenti in alto (l'id contiene il timestamp)
    records.sort((a, b) => String(b!.id).localeCompare(String(a!.id)));

    return jsonResponse({ ok: true, ruolo, partner: partner.slug, pratiche: records });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'pratiche_list_error', partner: partner.slug, error: msg }));
    return jsonResponse({ ok: false, error: 'list_failed' }, 500);
  }
}

export async function POST({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  if (!token) return jsonResponse({ ok: false, error: 'blob_not_configured' }, 503);

  let payload: { id?: string; stato?: string; partner?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const partner = getPartner(payload.partner);
  if (!partner) return jsonResponse({ ok: false, error: 'unknown_partner' }, 404);

  // Solo l'admin cambia gli stati: il partner li vede e basta
  if (ruoloDaChiave(bearer(request), partner, adminKey) !== 'admin') {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const id = (payload.id ?? '').trim();
  const stato = (payload.stato ?? '').trim();
  // L'id e' generato dal server (es. ST-20260723-101500): niente caratteri jolly nei path
  if (!/^[A-Z]{2}-[\d-]+$/.test(id) || !STATI_PRATICA.includes(stato)) {
    return jsonResponse({ ok: false, error: 'invalid_params' }, 400);
  }

  const pathname = `${pathPrefix(partner.slug)}${id}/pratica.json`;
  const record = await readRecord(pathname, token);
  if (!record) return jsonResponse({ ok: false, error: 'not_found' }, 404);

  record.stato = stato;
  record.statoAggiornato = new Date().toISOString();

  try {
    await put(pathname, JSON.stringify(record, null, 2), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60, // minimo consentito: le letture CDN restano fresche entro 1 minuto
      token,
    });
    console.log(JSON.stringify({ event: 'pratica_stato', partner: partner.slug, id, stato }));
    return jsonResponse({ ok: true, pratica: record });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'pratica_stato_error', id, error: msg }));
    return jsonResponse({ ok: false, error: 'update_failed' }, 500);
  }
}
