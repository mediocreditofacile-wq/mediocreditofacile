export const prerender = false;

// Genera i token per l'upload client-side dei documenti pratica su Vercel Blob
// (store privato "mcf-pratiche"). Usato dai portali partner (Expo Energia, Stilo):
// i file salgono direttamente dal browser allo storage, senza passare dalla
// serverless function (che ha un limite di 4,5 MB sul body).

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getPartner, pathPrefix, ruoloDaChiave } from '../../data/portali-partner';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file

export async function POST({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;

  if (!token) {
    return new Response(JSON.stringify({ error: 'blob_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Il client manda chiave e partner nel payload
        let auth = '';
        let slug: string | undefined;
        try {
          const parsed = clientPayload ? JSON.parse(clientPayload) : {};
          auth = parsed.auth ?? '';
          slug = parsed.partner;
        } catch {
          auth = '';
        }

        const partner = getPartner(slug);
        if (!partner) throw new Error('unknown_partner');
        if (!ruoloDaChiave(auth, partner, adminKey)) throw new Error('unauthorized');
        // Ogni partner puo' scrivere solo nella propria cartella
        if (!pathname.startsWith(pathPrefix(partner.slug))) throw new Error('invalid_path');

        return {
          allowedContentTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/heic',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/pkcs7-mime', // visure firmate .p7m
            'application/octet-stream',
          ],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
      // Nessun onUploadCompleted: il client raccoglie gli URL e li manda
      // insieme al form all'endpoint submit del partner.
    });

    return new Response(JSON.stringify(jsonResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.warn(JSON.stringify({ event: 'blob_upload_rejected', error: msg }));
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === 'unauthorized' ? 401 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
