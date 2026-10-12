export const prerender = false;

// Esito della verifica eventi negativi di una pratica: solo MCF.
// GET /api/motore/negativita?f=<slug>&id=<pratica>
// Se Openapi ha finito, l'esito si salva sulla pratica e nel registro verifiche.

import { aggiornaNegativita } from '../../../lib/motore/pratica';
import { json, sessioneMotore } from '../../../lib/motore/sessione';

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const e = await sessioneMotore(request, url.searchParams.get('f'));
  if (!e.ok) return e.risposta;
  if (e.contesto.ruolo !== 'admin') return json({ ok: false, error: 'permesso_negato' }, 403);
  const n = await aggiornaNegativita(e, url.searchParams.get('id') ?? '');
  if (!n) return json({ ok: false, error: 'pratica_non_trovata' }, 404);
  return json({ ok: true, negativita: n });
}
