export const prerender = false;

// Simulazione del canone prima della verifica del cliente, settore distinta (Led Office).
// POST /api/motore/simulazione { f, importo, intestatario?, descrizione?, documento? }
//
// Senza `documento` e' il conto a schermo e non salva niente; con `documento: true`
// salva la simulazione nello Storico e genera il preventivo del canone in PDF. Rate
// per durata e condizioni del listino: nessun coefficiente, nessun nome di locatore,
// nessuna maggiorazione (canale e importi del locatore escono solo verso MCF).
// La regola sta in src/lib/motore/simulazione-distinta.ts.

import { corpoJson, json, sessioneMotore } from '../../../lib/motore/sessione';
import { generaSimulazione, leggiSimulazione, simula, simulazionePerSchermo } from '../../../lib/motore/simulazione-distinta';

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''), { permesso: { preventivo: ['crea'] } });
  if (!e.ok) return e.risposta;
  if (e.carrozzeria.settore !== 'distinta') return json({ ok: false, error: 'non_disponibile' }, 404);

  const letta = leggiSimulazione(corpo);
  if (!letta.ok) return json({ ok: false, error: letta.error }, 400);
  const i = simula(e.carrozzeria, letta.dati.importo);
  if (!i) return json({ ok: false, error: 'simulazione_fuori_tabella' }, 422);

  const admin = e.contesto.ruolo === 'admin';
  if (corpo.documento !== true) return json({ ok: true, ...simulazionePerSchermo(i, admin) });

  try {
    const r = await generaSimulazione(e, letta.dati, i);
    return json({ ok: true, ...simulazionePerSchermo(i, admin), ...r });
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_simulazione_errore', fornitore: e.carrozzeria.slug, msg: String(err) }));
    return json({ ok: false, error: 'preventivo_non_riuscito' }, 500);
  }
}
