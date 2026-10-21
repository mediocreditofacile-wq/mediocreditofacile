export const prerender = false;

/**
 * Elenco delle credenziali dei portali partner.
 * GET /api/credenziali  con  Authorization: Bearer <VALUTAZIONE_KEY>
 *
 * Risponde con le sezioni della plancia, nell'ordine dell'indice Portali
 * Clienti (src/lib/plancia.ts).
 *
 * Le password NON stanno nella pagina: arrivano solo da qui, e solo a chi
 * presenta la chiave. La verifica e' server-side, quindi il sorgente servito
 * al browser non contiene nessun segreto.
 */

import { CREDENZIALI } from '../../data/credenziali-portali';
import { AREE_PARTNER, PORTALI_PRATICHE } from '../../data/portali-clienti';
import { componiPlancia } from '../../lib/plancia';

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
  const { sezioni, senzaCredenziali } = componiPlancia(CREDENZIALI, PORTALI_PRATICHE, AREE_PARTNER);
  console.log(JSON.stringify({ evento: 'credenziali_lette', voci: CREDENZIALI.length, senza_credenziali: senzaCredenziali }));
  // credenziali resta per una pagina rimasta in cache col vecchio script
  return json({ sezioni, credenziali: CREDENZIALI });
}
