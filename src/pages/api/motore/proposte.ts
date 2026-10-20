export const prerender = false;

// Proposte di noleggio e leasing su un pacchetto del catalogo.
// POST /api/motore/proposte { f, ricercaId, codice, prezzo, bp? }
//
// Non salva niente: e' il conto che l'agente rifa' ogni volta che cambia
// pacchetto, prezzo o durata. Il salvataggio arriva col preventivo PDF.
//
// Dal browser arrivano solo la ricerca, il pacchetto e il prezzo trattato. I
// numeri di bilancio si rileggono dalla ricerca salvata (app.ricerca_merito),
// cosi' il semaforo non si puo' truccare dal client. In uscita solo canoni,
// rate e totali: nessun coefficiente, nessuna fascia, nessun partner.
//
// Sul settore distinta (Led Office) il corpo e' un altro:
// { f, ricercaId, righe: [...], consegna: { tipo, indirizzo }, motivazioni: {...},
//   ledwallConfermato, vendita?: {...} }
// e la risposta e' distintaPerSchermo(): prefiltro, righe, totale dei beni e rate
// per durata. Canale, maggiorazione e imponibile restano sul server.

import { calcolaDistinta, distintaPerSchermo } from '../../../lib/motore/calcolo-distinta';
import { calcolaProposta, esitoPerSchermo } from '../../../lib/motore/calcolo-proposta';
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
      return json({ ok: true, ...distintaPerSchermo(d.calcolo) });
    }
    const r = await calcolaProposta(e, corpo);
    if (!r.ok) return r.risposta;
    return json({ ok: true, ...esitoPerSchermo(r.calcolo) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore';
    console.error(JSON.stringify({ evento: 'motore_proposte_errore', fornitore: e.carrozzeria.slug, msg }));
    return json({ ok: false, error: 'calcolo_non_riuscito' }, 500);
  }
}
