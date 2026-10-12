export const prerender = false;

// Cambio di stato delle pratiche: solo MCF.
// POST /api/motore/stato { f, ids: [...], stato }
//
// Da qualunque stato a qualunque altro, anche saltando passaggi, e su piu'
// pratiche alla volta. Ogni cambio resta nella storia della pratica.

import { spostaStato, STATI, type StatoPratica } from '../../../lib/motore/pratica';
import { corpoJson, json, sessioneMotore } from '../../../lib/motore/sessione';

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''));
  if (!e.ok) return e.risposta;
  if (e.contesto.ruolo !== 'admin') return json({ ok: false, error: 'permesso_negato' }, 403);

  const stato = String(corpo.stato ?? '') as StatoPratica;
  if (!STATI.includes(stato)) return json({ ok: false, error: 'stato_non_valido' }, 400);
  const ids = Array.isArray(corpo.ids) ? corpo.ids.map(String).filter(Boolean).slice(0, 200) : [];
  if (!ids.length) return json({ ok: false, error: 'nessuna_pratica' }, 400);

  const spostate = await spostaStato(e, ids, stato);
  console.log(JSON.stringify({ evento: 'motore_stato', fornitore: e.carrozzeria.slug, stato, richieste: ids.length, spostate }));
  return json({ ok: true, spostate });
}
