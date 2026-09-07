export const prerender = false;

// Simulazione rapida: solo numeri, niente scheda cliente e niente documenti.
//
// Serve all'agente che ha il fornitore o il cliente al telefono e deve dire un
// canone senza compilare tutto il prospetto. Non salva niente e non manda
// niente: quello che resta e' il prospetto vero, generato dall'altra sezione.
//
// Due direzioni, come chiedono gli agenti:
//  - dal prezzo di vendita alla griglia dei canoni su tutte le durate
//  - dal canone che il cliente regge al prezzo che ci sta dentro
//
// Il calcolo gira qui, non nel browser: i coefficienti sono dati commerciali
// riservati e in risposta esce solo il canone finale, mai il coefficiente ne'
// la fascia di importo.

import { richiediSessione } from '../../lib/portale-auth';
import { getTabella } from '../../lib/tabelle-canoni';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export async function POST({ request }: { request: Request }) {
  const esito = await richiediSessione(request, { permesso: { preventivo: ['crea'] } });
  if (!esito.ok) return esito.risposta;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const tabella = getTabella(esito.contesto.tabellaCanoni);
  const numero = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  // === Dal canone al prezzo ===
  if (corpo.verso === 'da-canone') {
    const canone = numero(corpo.canone);
    const durata = numero(corpo.durata);
    if (canone <= 0 || !tabella.durate.includes(durata)) {
      return json({ ok: false, error: 'dati_incompleti' }, 400);
    }
    const prezzo = tabella.prezzoDaCanone(canone, durata);
    if (prezzo === null) {
      // Un canone fuori scala non si arrotonda al piu' vicino: si dice che
      // non esiste, altrimenti l'agente porta al cliente un numero inventato.
      return json({
        ok: false,
        error: 'canone_fuori_range',
        min: tabella.importoMin,
        max: tabella.importoMax,
      }, 400);
    }
    return json({ ok: true, verso: 'da-canone', durata, canone, prezzo: r2(prezzo) });
  }

  // === Dal prezzo alla griglia dei canoni ===
  const importo = numero(corpo.importo);
  if (importo <= 0) return json({ ok: false, error: 'dati_incompleti' }, 400);
  if (!tabella.quotabile(importo)) {
    return json({
      ok: false,
      error: 'importo_fuori_range',
      min: tabella.importoMin,
      max: tabella.importoMax,
    }, 400);
  }

  const durate = tabella.durateDisponibili(importo);
  const canoni: Record<number, number> = {};
  const riscatti: Record<number, number> = {};
  for (const m of durate) {
    canoni[m] = r2((importo * tabella.coefficiente(importo, m)!) / 100);
    riscatti[m] = r2((importo * tabella.riscatto[m]) / 100);
  }

  return json({ ok: true, verso: 'da-prezzo', importo, durate, canoni, riscatti });
}
