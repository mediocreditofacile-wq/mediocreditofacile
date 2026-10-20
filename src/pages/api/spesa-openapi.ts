export const prerender = false;

/**
 * Spesa Openapi del mese per /tools/valutazione — GET /api/spesa-openapi
 *
 * Quanto ha speso il tool interno e quanto vale il conto del mese, con il resto
 * diviso fra gli altri strumenti. Legge il registro su Blob e le transazioni del
 * wallet (gratuite), mai i servizi a pagamento. Il calcolo e' quello del tetto
 * (spesaDelMese, cache di un minuto), cosi' la pagina e il tetto non possono
 * dire due cifre diverse.
 *
 * Autenticazione: bearer con VALUTAZIONE_KEY, come le altre API della pagina.
 */

import { spesaDelMese } from '../../lib/openapi';
import { riepilogoSpesa } from '../../lib/tetto-openapi';

function autorizzato(request: Request): boolean {
  const atteso = import.meta.env.VALUTAZIONE_KEY as string;
  if (!atteso) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${atteso}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);
  try {
    return json(riepilogoSpesa(await spesaDelMese()));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'spesa_openapi_errore', msg }));
    return json({ errore: msg }, 502);
  }
}
