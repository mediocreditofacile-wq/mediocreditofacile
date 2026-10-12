export const prerender = false;

// Genera il preventivo di una proposta: la salva nello storico, produce i PDF
// e avvisa MCF. POST /api/motore/preventivo con lo stesso corpo di
// /api/motore/proposte: i numeri escono dalla stessa funzione.

import { calcolaProposta } from '../../../lib/motore/calcolo-proposta';
import { generaPreventivoMotore } from '../../../lib/motore/preventivo';
import { corpoJson, json, sessioneMotore } from '../../../lib/motore/sessione';

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''), { permesso: { preventivo: ['crea'] } });
  if (!e.ok) return e.risposta;

  try {
    const r = await calcolaProposta(e, corpo);
    if (!r.ok) return r.risposta;
    const esito = await generaPreventivoMotore(e, r.calcolo, corpo);
    return json(esito, esito.ok ? 200 : 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore';
    console.error(JSON.stringify({ evento: 'motore_preventivo_errore', fornitore: e.carrozzeria.slug, msg }));
    return json({ ok: false, error: 'preventivo_non_riuscito' }, 500);
  }
}
