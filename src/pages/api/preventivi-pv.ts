export const prerender = false;

// Storico dei preventivi generati dai portali fornitore.
// I record vivono su Vercel Blob (store privato) come JSON:
//   preventivi/<partner>/<id>/preventivo.json
// GET ?partner=<slug> → lista (bearer: password partner o chiave admin).
// La risposta include `ruolo`, usato dal gate per validare la chiave admin.

import { get, list } from '@vercel/blob';
import { getPartner, pathPreventivi, ruoloDaChiave } from '../../data/portali-partner';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readRecord(pathname: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await get(pathname, { access: 'private', token });
    if (!result) return null;
    return JSON.parse(await new Response(result.stream).text());
  } catch {
    return null;
  }
}

export async function GET({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  if (!token) return jsonResponse({ ok: false, error: 'blob_not_configured' }, 503);

  const partner = getPartner(new URL(request.url).searchParams.get('partner'));
  if (!partner) return jsonResponse({ ok: false, error: 'unknown_partner' }, 404);

  const chiave = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const ruolo = ruoloDaChiave(chiave, partner, adminKey);
  if (!ruolo) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  try {
    const { blobs } = await list({ prefix: pathPreventivi(partner.slug), limit: 500, token });
    const paths = blobs.filter((b) => b.pathname.endsWith('/preventivo.json')).map((b) => b.pathname);
    const records = (await Promise.all(paths.map((p) => readRecord(p, token)))).filter(Boolean);
    // Piu' recenti in alto: l'id porta il timestamp
    records.sort((a, b) => String(b!.id).localeCompare(String(a!.id)));

    return jsonResponse({ ok: true, ruolo, partner: partner.slug, preventivi: records });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'preventivi_list_error', partner: partner.slug, error: msg }));
    return jsonResponse({ ok: false, error: 'list_failed' }, 500);
  }
}
