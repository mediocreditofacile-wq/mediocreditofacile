export const prerender = false;

// Ricerca di merito sul cliente finale.
//
// POST /api/motore/merito  { f, piva }   ricerca nuova: scheda completa Openapi
// GET  /api/motore/merito?f=&id=          riapre una ricerca dallo storico
//
// La scheda completa costa 0,81 euro (IT-full + punteggio) e si addebita alla
// carrozzeria, col suo tetto mensile. La cache dura 30 giorni ed e' condivisa
// con /tools/valutazione: un cliente gia' analizzato non si paga due volte.
// Sui fornitori con la credit policy la verifica eventi negativi qui NON parte:
// parte all'invio della pratica. Sui fornitori col semaforo del locatore (Duplex)
// parte qui: la risposta esce subito con gli eventi "in verifica", il server segue
// l'esito in background per circa 90 secondi (waitUntil), lo salva sulla riga
// della ricerca e manda una mail ad Alberto se scheda o verifica sono nuove.
//
// I numeri di bilancio si salvano in app.ricerca_merito e la proposta li rilegge
// da li': il browser non puo' mandare un fatturato suo per farsi verde.

import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { valutaCredito } from '../../../lib/credit-policy';
import { queryUna, query } from '../../../lib/db';
import { avviaEventi, riprendiEventi, salvaEventi, seguiEventi } from '../../../lib/motore/eventi-merito';
import { bersaglioEventi, eventiNonAvviati, serveControllo, type EventiRicerca } from '../../../lib/motore/eventi-stato';
import { datiLocatore, leggiScheda, type DatiCreditoMotore, type SchedaRidotta } from '../../../lib/motore/merito';
import { valutaLocatore } from '../../../lib/motore/semaforo-locatore';
import { semaforoPerSchermo, valuta } from '../../../lib/motore/valutazione';
import { corpoJson, filtroVisibilita, json, sessioneMotore } from '../../../lib/motore/sessione';
import { entroIlTetto, schedaAzienda, schedaSoloCache, sorgenteCarrozzeria } from '../../../lib/openapi';
import { pivaValida, pulisciPiva } from '../../../lib/piva';

/** Semaforo senza importo: utile e anni di attivita'. Quello vero arriva col prezzo. */
const creditoBase = (d: DatiCreditoMotore) => valutaCredito({ ...d, importo: null });

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''), { permesso: { preventivo: ['crea'] } });
  if (!e.ok) return e.risposta;
  const { contesto, carrozzeria } = e;

  const piva = pulisciPiva(String(corpo.piva ?? ''));
  if (!pivaValida(piva)) return json({ ok: false, error: 'piva_non_valida' }, 400);

  let scheda;
  try {
    scheda = await schedaSoloCache(piva);
    if (!scheda) {
      const sorgente = sorgenteCarrozzeria(carrozzeria.slug);
      const tetto = await entroIlTetto('IT-full', sorgente, carrozzeria.tettoMeseEuro);
      if (!tetto.ok) {
        console.warn(JSON.stringify({ evento: 'motore_merito_tetto', fornitore: carrozzeria.slug, motivo: tetto.motivo }));
        return json({ ok: false, error: 'tetto_raggiunto' }, 429);
      }
      scheda = await schedaAzienda(piva, { sorgente });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'motore_merito_errore', fornitore: carrozzeria.slug, msg }));
    return json({ ok: false, error: 'servizio_non_disponibile' }, 502);
  }
  if (!scheda.trovata) return json({ ok: false, error: 'piva_non_trovata' }, 404);

  const { dati, scheda: ridotta, info } = leggiScheda(scheda);
  const id = randomUUID();
  await query(
    `INSERT INTO app.ricerca_merito (id, fornitore_slug, organization_id, user_id, piva, ragione_sociale, dati_credito, da_cache)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, carrozzeria.slug, contesto.organizationId, contesto.userId, piva, ridotta.ragioneSociale,
     JSON.stringify({ dati, scheda: ridotta }), Boolean(scheda.daCache)],
  );
  console.log(JSON.stringify({ evento: 'motore_merito', fornitore: carrozzeria.slug, daCache: Boolean(scheda.daCache) }));

  let eventi: EventiRicerca | null = null;
  if (carrozzeria.regoleSemaforo === 'locatore') {
    // Gia' rosso sui dati di anagrafica e bilancio: la verifica non si paga
    const giaRosso = valutaLocatore(datiLocatore(dati), null, 'non-avviata').semaforo === 'rosso';
    eventi = giaRosso
      ? eventiNonAvviati(piva)
      : await avviaEventi(carrozzeria, bersaglioEventi(piva, dati.formaCodice ?? null, scheda.advanced?.taxCode));
    const nuova = { scheda: !scheda.daCache, eventi: Boolean(eventi.id) && !eventi.daRegistro };
    eventi.mail = nuova.scheda || nuova.eventi ? 'da-mandare' : 'non-serve';
    await salvaEventi(id, eventi);
    const mail = eventi.mail === 'da-mandare'
      ? { fornitore: carrozzeria.nome, agente: { nome: contesto.nome ?? '', email: contesto.email }, scheda: ridotta, dati, nuova }
      : null;
    // La risposta parte subito; esito e mail li segue il server per circa 90 secondi
    waitUntil(seguiEventi(carrozzeria, id, eventi, mail).catch((err) =>
      console.error(JSON.stringify({ evento: 'motore_eventi_errore', fornitore: carrozzeria.slug, msg: String(err) }))));
  }
  const credito = carrozzeria.regoleSemaforo === 'locatore'
    ? semaforoPerSchermo(valuta(carrozzeria, dati, null, eventi?.stato ?? 'non-avviata'))
    : creditoBase(dati);

  return json({ ok: true, ricercaId: id, scheda: ridotta, info, credito, eventi: eventi?.stato ?? null, daCache: Boolean(scheda.daCache) });
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const e = await sessioneMotore(request, url.searchParams.get('f'));
  if (!e.ok) return e.risposta;

  const { where, valori } = filtroVisibilita(e, '', 2);
  const riga = await queryUna<{
    id: string; piva: string;
    dati_credito: { dati: DatiCreditoMotore; scheda: SchedaRidotta };
    eventi: EventiRicerca | null;
  }>(
    `SELECT id, piva, dati_credito, eventi FROM app.ricerca_merito WHERE id = $1 AND ${where}`,
    [url.searchParams.get('id') ?? '', ...valori],
  );
  if (!riga) return json({ ok: false, error: 'ricerca_non_trovata' }, 404);

  const { carrozzeria, contesto } = e;
  const locatore = carrozzeria.regoleSemaforo === 'locatore';
  let ev = riga.eventi;
  if (locatore && ev && serveControllo(ev)) {
    const mail = {
      fornitore: carrozzeria.nome, agente: { nome: contesto.nome ?? '', email: contesto.email },
      scheda: riga.dati_credito.scheda, dati: riga.dati_credito.dati, nuova: { scheda: false, eventi: !ev.daRegistro },
    };
    ev = await riprendiEventi(carrozzeria, riga.id, ev, mail).catch(() => ev);
  }
  const credito = locatore
    ? semaforoPerSchermo(valuta(carrozzeria, riga.dati_credito.dati, null, ev?.stato ?? 'non-avviata'))
    : creditoBase(riga.dati_credito.dati);

  // Attesa degli eventi dalla pagina: solo semaforo e stato, niente scheda
  if (url.searchParams.get('eventi') === '1') return json({ ok: true, eventi: ev?.stato ?? null, credito });

  // Le info aggiuntive vengono dalla cache, senza spendere. Scaduta la cache
  // (30 giorni) restano la scheda ridotta e i numeri salvati con la ricerca.
  const cache = await schedaSoloCache(riga.piva);
  return json({
    ok: true,
    ricercaId: riga.id,
    scheda: riga.dati_credito.scheda,
    info: cache ? leggiScheda(cache).info : null,
    credito,
    eventi: ev?.stato ?? null,
  });
}
