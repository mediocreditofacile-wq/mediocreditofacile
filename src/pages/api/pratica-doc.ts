export const prerender = false;

// Download di un documento pratica dallo store Blob privato.
// Due modi di autenticarsi:
//  - header Authorization: Bearer <password partner | chiave admin> (dal portale)
//  - query ?k=<chiave admin> (per i link nelle mail di notifica ad Alberto)
//
// Il partner viene dedotto dal path del documento: la chiave di un partner
// apre solo i documenti della sua cartella, quella admin apre tutto.

import { get, BlobNotFoundError } from '@vercel/blob';
import { PORTALI_PARTNER, pathPrefix, pathPreventivi, ruoloDaChiave } from '../../data/portali-partner';

export async function GET({ request }: { request: Request }) {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  if (!token) return new Response('Blob non configurato', { status: 503 });

  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  const k = url.searchParams.get('k') ?? '';
  const chiave = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim() || k;

  // Niente path traversal, e il documento deve stare nella cartella di un partner
  // noto: documenti di pratica (pratiche/) o prospetti generati (preventivi/).
  if (path.includes('..')) return new Response('Percorso non valido', { status: 400 });
  const partner = Object.values(PORTALI_PARTNER).find(
    (p) => path.startsWith(pathPrefix(p.slug)) || path.startsWith(pathPreventivi(p.slug)),
  );
  if (!partner) return new Response('Percorso non valido', { status: 400 });

  if (!ruoloDaChiave(chiave, partner, adminKey)) {
    return new Response('Non autorizzato', { status: 401 });
  }

  try {
    const result = await get(path, { access: 'private', token });
    if (result.statusCode !== 200 || !result.stream) {
      return new Response('Documento non trovato', { status: 404 });
    }

    const filename = path.split('/').pop() ?? 'documento';
    const headers = new Headers();
    headers.set('Content-Type', result.blob.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(result.stream, { status: 200, headers });
  } catch (e) {
    if (e instanceof BlobNotFoundError) return new Response('Documento non trovato', { status: 404 });
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'pratica_doc_error', path, error: msg }));
    return new Response('Errore nel download', { status: 500 });
  }
}
