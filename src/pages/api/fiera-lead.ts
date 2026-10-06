export const prerender = false;

/**
 * Modulo della pagina /fiera — POST /api/fiera-lead
 *
 * Consegna il lead con la stessa logica di /api/submit (src/lib/lead.ts) e, se
 * la mail e' partita, estende l'uso della verifica partita IVA su questo
 * dispositivo: niente account, niente mail di conferma. Il lead arriva ad
 * Alberto, il fornitore continua a usare lo strumento.
 */

import { riceviLead } from '../../lib/lead';
import { cookieDispositivo, leggiDispositivo, registra } from '../../lib/fiera-guardia';

export async function POST({ request }: { request: Request }) {
  const { response, consegnato } = await riceviLead(await request.formData());
  if (!consegnato) return response;

  const cookie = cookieDispositivo(registra(leggiDispositivo(request)));
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers });
}
