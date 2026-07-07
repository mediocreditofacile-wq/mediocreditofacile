export const prerender = false;

// Genera i token per l'upload client-side dei documenti pratica su Vercel Blob
// (store privato "mcf-pratiche"). Usato dal portale partner Expo Energia:
// i file salgono direttamente dal browser allo storage, senza passare dalla
// serverless function (che ha un limite di 4,5 MB sul body).

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

const PARTNER_KEY = 'arcaenergia'; // stessa password del gate della pagina
const PATH_PREFIX = 'pratiche/expo-energia/';
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
        // Autorizzazione: il client manda la chiave nel payload
        let auth = '';
        try {
          auth = clientPayload ? (JSON.parse(clientPayload).auth ?? '') : '';
        } catch {
          auth = '';
        }
        const authorized = auth === PARTNER_KEY || (adminKey && auth === adminKey);
        if (!authorized) throw new Error('unauthorized');
        if (!pathname.startsWith(PATH_PREFIX)) throw new Error('invalid_path');

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
      // insieme al form a /api/submit-expo-energia.
    });

    return new Response(JSON.stringify(jsonResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    console.warn(JSON.stringify({ event: 'blob_upload_rejected', fonte: 'expo-energia', error: msg }));
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === 'unauthorized' ? 401 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
