export const prerender = false;

// Token per caricare i documenti di una pratica dal browser direttamente sullo
// store Blob privato (il corpo delle funzioni ha un limite di 4,5 MB).
//
// Come /api/blob-upload, ma il permesso viene dalla sessione dell'agente e non
// da una password nel payload, e la cartella e' quella della bozza:
// pratiche/<slug>/bozze/<uuid>/. Il fornitore esce dalla sessione.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { env } from '../../../lib/db';
import { bozzaValida, cartellaBozza } from '../../../lib/motore/pratica';
import { json, sessioneMotore } from '../../../lib/motore/sessione';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function POST({ request }: { request: Request }) {
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return json({ error: 'blob_non_configurato' }, 503);

  let body: HandleUploadBody;
  try {
    body = (await request.clone().json()) as HandleUploadBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    const risposta = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let slug = '';
        let bozza = '';
        try {
          const p = clientPayload ? JSON.parse(clientPayload) : {};
          slug = String(p.f ?? '');
          bozza = String(p.bozza ?? '');
        } catch { /* payload rotto: si rifiuta sotto */ }

        const e = await sessioneMotore(request, slug, { permesso: { preventivo: ['crea'] } });
        if (!e.ok) throw new Error('non_autorizzato');
        if (!bozzaValida(bozza)) throw new Error('bozza_non_valida');
        if (!pathname.startsWith(cartellaBozza(e.carrozzeria.slug, bozza)) || pathname.includes('..')) {
          throw new Error('percorso_non_valido');
        }
        return {
          allowedContentTypes: [
            'application/pdf', 'image/jpeg', 'image/png', 'image/heic',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/pkcs7-mime', 'application/octet-stream',
          ],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return json(risposta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore';
    console.warn(JSON.stringify({ evento: 'motore_upload_rifiutato', msg }));
    return json({ error: msg }, msg === 'non_autorizzato' ? 401 : 400);
  }
}
