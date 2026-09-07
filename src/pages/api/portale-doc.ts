export const prerender = false;

// Consegna di un documento dallo store Blob privato, per i portali con accesso
// nominale.
//
// Perche' una Function e non un URL prefirmato: un URL prefirmato, una volta
// emesso, e' un lasciapassare che vive piu' a lungo del controllo che lo ha
// generato e si puo' inoltrare. Qui ogni singolo accesso ripassa dal controllo,
// che su visure, bilanci e documenti di identita' del cliente finale e' quello
// che vogliamo.
//
// La verifica sta dentro il route handler, accanto alla get(), non in un
// middleware: e' la raccomandazione di Vercel per i blob privati, e in Astro
// statico il middleware non girerebbe comunque su tutte le rotte.

import { get, BlobNotFoundError } from '@vercel/blob';
import { env } from '../../lib/db';
import { percorsoDelFornitore, richiediSessione } from '../../lib/portale-auth';

export async function GET({ request }: { request: Request }) {
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return new Response('Archivio non configurato', { status: 503 });

  const url = new URL(request.url);
  const percorso = url.searchParams.get('path') ?? '';
  // L'admin puo' indicare il fornitore; per tutti gli altri il parametro viene
  // confrontato con la sessione e la differenza e' un rifiuto.
  const slugRichiesto = url.searchParams.get('partner');

  const esito = await richiediSessione(request, {
    slugRichiesto,
    permesso: { documento: ['leggi-propri'] },
  });
  if (!esito.ok) return esito.risposta;

  if (!percorsoDelFornitore(esito.contesto, percorso)) {
    console.warn(JSON.stringify({
      event: 'documento_fuori_perimetro',
      userId: esito.contesto.userId,
      fornitore: esito.contesto.fornitoreSlug,
      percorso,
    }));
    return new Response('Documento non disponibile', { status: 403 });
  }

  try {
    const ifNoneMatch = request.headers.get('if-none-match');
    const risultato = await get(percorso, {
      access: 'private',
      token,
      ...(ifNoneMatch ? { headers: { 'if-none-match': ifNoneMatch } } : {}),
    });
    if (!risultato) return new Response('Documento non trovato', { status: 404 });

    const headers = new Headers();
    // Mai nella cache della CDN: e' un documento privato, e la risposta cambia
    // a seconda di chi la chiede.
    headers.set('Cache-Control', 'private, no-cache');
    if (risultato.blob?.etag) headers.set('ETag', risultato.blob.etag);

    // Il documento non e' cambiato: si risparmia il trasferimento.
    if (risultato.statusCode === 304) return new Response(null, { status: 304, headers });

    const nome = percorso.split('/').pop() ?? 'documento';
    headers.set('Content-Type', risultato.blob.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${nome.replace(/"/g, '')}"`);
    return new Response(risultato.stream, { status: 200, headers });
  } catch (e) {
    if (e instanceof BlobNotFoundError) return new Response('Documento non trovato', { status: 404 });
    const msg = e instanceof Error ? e.message : 'unknown';
    console.error(JSON.stringify({ event: 'portale_doc_error', percorso, error: msg }));
    return new Response('Errore nel download', { status: 500 });
  }
}
