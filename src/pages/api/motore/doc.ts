export const prerender = false;

// Download di un documento del motore dei portali: PDF dei preventivi e
// documenti delle pratiche, dallo store Blob privato.
// GET /api/motore/doc?f=<slug>&path=<percorso>
//
// Piu' stretto di /api/portale-doc: non basta che il file stia nella cartella
// del fornitore, deve comparire fra i documenti di un preventivo o di una
// pratica che l'utente puo' vedere. L'agente scarica i suoi, il referente e
// MCF quelli di tutta la rete. Sulle pratiche ci sono carte d'identita' e
// bilanci del cliente: un collega non li apre indovinando il percorso.
//
// La cartella riservata (preventivi/<slug>/<id>/mcf/, la proposta per il locatore di
// Led Office) e' solo dell'admin MCF: per referente e agente percorsoConsentito() la
// rifiuta prima ancora del database, e per l'admin il file deve stare nel
// `riservato.documenti` di una proposta o di una pratica del fornitore, non nei
// `documenti`.

import { get } from '@vercel/blob';
import { env, queryUna } from '../../../lib/db';
import { percorsoConsentito } from '../../../lib/motore/percorso-riservato';
import { filtroVisibilita, sessioneMotore } from '../../../lib/motore/sessione';

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const e = await sessioneMotore(request, url.searchParams.get('f'), { permesso: { documento: ['leggi-propri'] } });
  if (!e.ok) return e.risposta;
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return new Response('Archivio non configurato', { status: 503 });

  const percorso = url.searchParams.get('path') ?? '';
  const slug = e.carrozzeria.slug;
  const accesso = percorsoConsentito(percorso, slug, e.contesto.ruolo === 'admin');

  const { where, valori } = filtroVisibilita(e, 'x', 2);
  const doc = JSON.stringify([{ pathname: percorso }]);
  const trovato = accesso === 'documenti'
    ? await queryUna(
      `SELECT 1 FROM (
         SELECT organization_id, user_id, documenti FROM app.proposta
         UNION ALL
         SELECT organization_id, user_id, documenti FROM app.pratica
       ) x
       WHERE x.documenti @> $1::jsonb AND ${where}
       LIMIT 1`,
      [doc, ...valori],
    )
    : accesso === 'riservato'
      ? await queryUna(
        `SELECT 1 FROM (
           SELECT organization_id, user_id, riservato FROM app.proposta
           UNION ALL
           SELECT organization_id, user_id, riservato FROM app.pratica
         ) x
         WHERE x.riservato->'documenti' @> $1::jsonb AND ${where}
         LIMIT 1`,
        [doc, ...valori],
      )
      : null;
  if (!trovato) {
    console.warn(JSON.stringify({
      evento: 'motore_doc_rifiutato', userId: e.contesto.userId, fornitore: slug, percorso, accesso,
    }));
    return new Response('Documento non disponibile', { status: 403 });
  }

  const r = await get(percorso, { access: 'private', token });
  if (!r || !r.stream) return new Response('Documento non trovato', { status: 404 });
  const nome = percorso.split('/').pop() ?? 'documento';
  return new Response(r.stream, {
    headers: {
      'Content-Type': r.blob?.contentType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nome.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}
