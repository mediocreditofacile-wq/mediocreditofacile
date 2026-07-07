export const prerender = false;

// Lista e aggiornamento stato delle pratiche del portale Expo Energia.
// I record vivono su Vercel Blob (store privato) come JSON:
//   pratiche/expo-energia/<id>/pratica.json
// GET  → lista pratiche (bearer: password partner o chiave admin)
// POST → aggiorna lo stato di una pratica (solo chiave admin)

import { list, get, put } from '@vercel/blob';

const PARTNER_KEY = 'expoenergia';
const PATH_PREFIX = 'pratiche/expo-energia/';

export const STATI_PRATICA = ['Ricevuta', 'In lavorazione', 'In delibera', 'Approvata', 'Declinata'];

function getAuth(request: Request): { partner: boolean; admin: boolean } {
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return {
    partner: bearer === PARTNER_KEY,
    admin: Boolean(adminKey && bearer === adminKey),
  };
}

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
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  if (!token) return jsonResponse({ ok: false, error: 'blob_not_configured' }, 503);

  const auth = getAuth(request);
  if (!auth.partner && !auth.admin) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  try {
    const { blobs } = await list({ prefix: PATH_PREFIX, limit: 500, token });
    const recordPaths = blobs
      .filter((b) => b.pathname.endsWith('/pratica.json'))
      .map((b) => b.pathname);

    const records = (await Promise.all(recordPaths.map((p) => readRecord(p, token)))).filter(Boolean);
    // Piu' recenti in alto (l'id contiene il timestamp)
    records.sort((a, b) => String(b!.id).localeCompare(String(a!.id)));

    return jsonResponse({ ok: true, ruolo: auth.admin ? 'admin' : 'partner', pratiche: records });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'pratiche_expo_list_error', error: msg }));
    return jsonResponse({ ok: false, error: 'list_failed' }, 500);
  }
}

export async function POST({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  if (!token) return jsonResponse({ ok: false, error: 'blob_not_configured' }, 503);

  const auth = getAuth(request);
  if (!auth.admin) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let payload: { id?: string; stato?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const id = (payload.id ?? '').trim();
  const stato = (payload.stato ?? '').trim();
  // L'id e' generato dal server (formato EE-data-ora): niente caratteri jolly nei path
  if (!/^EE-[\dT-]+$/.test(id) || !STATI_PRATICA.includes(stato)) {
    return jsonResponse({ ok: false, error: 'invalid_params' }, 400);
  }

  const pathname = `${PATH_PREFIX}${id}/pratica.json`;
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
    console.log(JSON.stringify({ event: 'pratica_expo_stato', id, stato }));
    return jsonResponse({ ok: true, pratica: record });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'pratica_expo_stato_error', id, error: msg }));
    return jsonResponse({ ok: false, error: 'update_failed' }, 500);
  }
}
