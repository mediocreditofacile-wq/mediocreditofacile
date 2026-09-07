export const prerender = false;

// Genera un preventivo su un portale ad accesso nominale.
// Il fornitore e il listino escono dalla sessione, mai dal corpo: il client
// puo' mandare quello che vuole, qui non viene letto.

import { generaPreventivo } from '../../lib/preventivi-nominali';
import { richiediSessione } from '../../lib/portale-auth';

export async function POST({ request }: { request: Request }) {
  const rispondi = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });

  const esito = await richiediSessione(request, { permesso: { preventivo: ['crea'] } });
  if (!esito.ok) return esito.risposta;
  if (!esito.contesto.fornitoreSlug || !esito.contesto.prefisso) {
    return rispondi({ ok: false, error: 'fornitore_non_indicato' }, 400);
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = ((await request.json()) as { input?: Record<string, unknown> }).input ?? {};
  } catch {
    return rispondi({ ok: false, error: 'invalid_json' }, 400);
  }

  const risultato = await generaPreventivo(corpo, esito.contesto, esito.contesto.prefisso);
  return rispondi(risultato, risultato.ok ? 200 : 400);
}
