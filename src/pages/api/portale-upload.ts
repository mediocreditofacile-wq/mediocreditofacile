export const prerender = false;

// Token per caricare i documenti di una pratica dal browser direttamente sullo
// store Blob privato, sui portali partner ad accesso nominale (oggi STILO).
//
// Come /api/blob-upload, ma il permesso viene dalla sessione e non da una
// password nel payload, e la cartella e' quella della persona:
// pratiche/<slug>/docs/<userId>/. All'invio /api/submit-<slug> accetta solo
// documenti di quella cartella.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getPartner } from '../../data/portali-partner';
import { env } from '../../lib/db';
import { richiediSessione } from '../../lib/portale-auth';
import { cartellaDocumenti } from '../../lib/pratiche-visibilita';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST({ request }: { request: Request }) {
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return json({ error: 'blob_non_configurato' }, 503);

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
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
        try {
          slug = String((clientPayload ? JSON.parse(clientPayload) : {}).partner ?? '');
        } catch { /* payload rotto: si rifiuta sotto */ }

        const partner = getPartner(slug);
        if (!partner?.accessoNominale) throw new Error('fornitore_sconosciuto');
        const e = await richiediSessione(request, { slugRichiesto: partner.slug, permesso: { preventivo: ['crea'] } });
        if (!e.ok) throw new Error('non_autorizzato');
        if (pathname.includes('..') || !pathname.startsWith(cartellaDocumenti(partner.slug, e.contesto.userId))) {
          throw new Error('percorso_non_valido');
        }

        return {
          allowedContentTypes: [
            'application/pdf', 'image/jpeg', 'image/png', 'image/heic',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/pkcs7-mime', // visure firmate .p7m
            'application/octet-stream',
          ],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return json(risposta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore';
    console.warn(JSON.stringify({ event: 'portale_upload_rifiutato', msg }));
    return json({ error: msg }, msg === 'non_autorizzato' ? 401 : 400);
  }
}
