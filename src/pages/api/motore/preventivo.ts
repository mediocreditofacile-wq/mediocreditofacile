export const prerender = false;

// Genera il preventivo di una proposta: la salva nello storico, produce i PDF
// e avvisa MCF. POST /api/motore/preventivo con lo stesso corpo di
// /api/motore/proposte: i numeri escono dalla stessa funzione.
//
// Sul settore distinta (Led Office) tutta la richiesta passa dalla distinta, col
// prefiltro e i canali della carrozzeria: mai da calcolaProposta, che col `codice`
// di un corpo costruito a mano quoterebbe il listino di sempre senza prefiltro. Al
// commerciale tornano id, pdfPronti e i suoi PDF; la proposta per il locatore resta
// nella cartella riservata a MCF.
//
// Sul settore mezzi (Bergamelli) il corpo e' quello di /api/motore/proposte piu'
// `leasingPdf` ('A' | 'B' | 'C'), la colonna del leasing da mettere nel PDF. Il calcolo
// e' calcolaMezzi, lo stesso dello schermo. Alla mail di MCF vanno canale, nomi dei
// partner, spread e provvigione; la risposta resta { ok, id, pdfPronti, documenti }.

import { calcolaDistinta } from '../../../lib/motore/calcolo-distinta';
import { calcolaMezzi } from '../../../lib/motore/calcolo-mezzi';
import { calcolaProposta } from '../../../lib/motore/calcolo-proposta';
import { generaPreventivoMotore } from '../../../lib/motore/preventivo';
import { generaPreventivoDistinta } from '../../../lib/motore/preventivo-distinta';
import { generaPreventivoMezzi } from '../../../lib/motore/preventivo-mezzi';
import { corpoJson, json, sessioneMotore } from '../../../lib/motore/sessione';

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''), { permesso: { preventivo: ['crea'] } });
  if (!e.ok) return e.risposta;

  try {
    if (e.carrozzeria.settore === 'distinta') {
      const d = await calcolaDistinta(e, corpo);
      if (!d.ok) return d.risposta;
      const esito = await generaPreventivoDistinta(e, d.calcolo, corpo);
      return json(esito, esito.ok ? 200 : 400);
    }
    if (e.carrozzeria.settore === 'mezzi') {
      const m = await calcolaMezzi(e, corpo);
      if (!m.ok) return m.risposta;
      const esito = await generaPreventivoMezzi(e, m.calcolo, corpo);
      return json(esito, esito.ok ? 200 : 400);
    }
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
