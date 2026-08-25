export const prerender = false;

/**
 * Elenco delle credenziali dei portali partner.
 * GET /api/credenziali  con  Authorization: Bearer <VALUTAZIONE_KEY>
 *
 * Le password NON stanno nella pagina: arrivano solo da qui, e solo a chi
 * presenta la chiave. La verifica e' server-side, quindi il sorgente servito
 * al browser non contiene nessun segreto.
 */

import { CREDENZIALI } from '../../data/credenziali-portali';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET({ request }: { request: Request }) {
  const atteso = import.meta.env.VALUTAZIONE_KEY as string;
  if (!atteso || (request.headers.get('authorization') ?? '') !== `Bearer ${atteso}`) {
    return json({ errore: 'non autorizzato' }, 401);
  }
  console.log(JSON.stringify({ evento: 'credenziali_lette', voci: CREDENZIALI.length }));
  return json({ credenziali: CREDENZIALI });
}
