export const prerender = false;

/**
 * Ricerche degli ultimi 30 giorni per la pagina iniziale di /tools/valutazione.
 * GET /api/ricerche-recenti?pagina=1  con  Authorization: Bearer <VALUTAZIONE_KEY>
 *
 * Legge solo lo store Blob, mai Openapi: l'elenco e' la cache, quindi ogni voce
 * si riapre senza spendere. Dieci voci a pagina. La logica sta in
 * src/lib/ricerche-recenti.ts.
 */

import { ricercheRecenti } from '../../lib/ricerche-recenti';

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

  const pagina = Number(new URL(request.url).searchParams.get('pagina')) || 1;
  try {
    return json(await ricercheRecenti(pagina));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'ricerche_recenti_errore', msg }));
    return json({ errore: msg }, 502);
  }
}
