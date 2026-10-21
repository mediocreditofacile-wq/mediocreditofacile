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
// e col prefiltro (Led Office) parte qui: la risposta esce subito con gli eventi
// "in verifica", il server segue l'esito in background per circa 90 secondi
// (waitUntil), lo salva sulla riga della ricerca e manda una mail ad Alberto se
// scheda o verifica sono nuove.
//
// Sul prefiltro il server legge anche i segnali (cliente segnalato da MCF, pratica
// recente su qualunque portale o nello storico importato) e li salva sulla ricerca.
// Al commerciale arrivano solo i testi generici; motivo, data, canale e fornitore
// stanno nella mail ad Alberto. Un cliente gia' rosso o bloccato non paga la verifica.
//
// I numeri di bilancio si salvano in app.ricerca_merito e la proposta li rilegge
// da li': il browser non puo' mandare un fatturato suo per farsi verde.

import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { valutaCredito } from '../../../lib/credit-policy';
import { queryUna, query } from '../../../lib/db';
import { avviaEventi, riprendiEventi, salvaEventi, seguiEventi } from '../../../lib/motore/eventi-merito';
import { bersaglioEventi, eventiNonAvviati, serveControllo, type EventiRicerca } from '../../../lib/motore/eventi-stato';
import type { Carrozzeria } from '../../../lib/motore/carrozzeria';
import { datiLocatore, leggiScheda, type DatiCreditoMotore, type SchedaRidotta } from '../../../lib/motore/merito';
import { datiPrefiltro, valutaPrefiltro, type SegnaliPrefiltro } from '../../../lib/motore/prefiltro';
import { regoleConEventi, salvaSegnali, segnaliPrefiltro, unisciSegnali } from '../../../lib/motore/segnali-prefiltro';
import { valutaLocatore, type StatoEventi } from '../../../lib/motore/semaforo-locatore';
import { prefiltroPerSchermo, semaforoPerSchermo, valuta } from '../../../lib/motore/valutazione';
import { corpoJson, filtroVisibilita, json, sessioneMotore } from '../../../lib/motore/sessione';
import { entroIlTetto, schedaAzienda, schedaSoloCache, sorgenteCarrozzeria } from '../../../lib/openapi';
import { pivaValida, pulisciPiva } from '../../../lib/piva';
import { fatturazioneDaScheda, firmatarioDaScheda } from '../../../lib/motore/registro-vendita';

/** Semaforo senza importo: utile e anni di attivita'. Quello vero arriva col prezzo. */
const creditoBase = (d: DatiCreditoMotore) => valutaCredito({ ...d, importo: null });

const SENZA_SEGNALI: SegnaliPrefiltro = { segnalato: null, praticaRecente: null };

/** Il prefiltro alla verifica: solo le regole sul cliente, la distinta arriva con la proposta */
const prefiltroCliente = (k: Carrozzeria, d: DatiCreditoMotore, segnali: SegnaliPrefiltro, eventi: StatoEventi) =>
  valutaPrefiltro(datiPrefiltro(d), segnali, eventi, k.categorie ?? [], null);

/** Il semaforo della ricerca, senza importo, secondo le regole della carrozzeria */
function creditoPerSchermo(k: Carrozzeria, d: DatiCreditoMotore, segnali: SegnaliPrefiltro | null, eventi: StatoEventi) {
  // Sul prefiltro i segnali ci sono sempre: POST e GET li leggono prima di arrivare qui
  if (k.regoleSemaforo === 'prefiltro') return prefiltroPerSchermo(prefiltroCliente(k, d, segnali ?? SENZA_SEGNALI, eventi));
  if (k.regoleSemaforo === 'locatore') return semaforoPerSchermo(valuta(k, d, null, eventi));
  return creditoBase(d);
}

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
     JSON.stringify({ dati, scheda: ridotta, firmatario: firmatarioDaScheda(scheda) }), Boolean(scheda.daCache)],
  );
  console.log(JSON.stringify({ evento: 'motore_merito', fornitore: carrozzeria.slug, daCache: Boolean(scheda.daCache) }));

  // Prefiltro: cliente segnalato e pratica recente, letti adesso e salvati sulla
  // ricerca. Contano le pratiche nate prima di questo momento (Ruling 11).
  const segnali = carrozzeria.regoleSemaforo === 'prefiltro' ? (await segnaliPrefiltro(piva, new Date())).segnali : null;
  if (segnali) await salvaSegnali(id, segnali);

  let eventi: EventiRicerca | null = null;
  if (regoleConEventi(carrozzeria)) {
    // Gia' rosso (o bloccato) sui dati di anagrafica, bilancio e segnali: la verifica non si paga
    const giaRosso = segnali
      ? ['rosso', 'bloccato'].includes(prefiltroCliente(carrozzeria, dati, segnali, 'non-avviata').semaforo)
      : valutaLocatore(datiLocatore(dati), null, 'non-avviata').semaforo === 'rosso';
    eventi = giaRosso
      ? eventiNonAvviati(piva)
      : await avviaEventi(carrozzeria, bersaglioEventi(piva, dati.formaCodice ?? null, scheda.advanced?.taxCode));
    const nuova = { scheda: !scheda.daCache, eventi: Boolean(eventi.id) && !eventi.daRegistro };
    eventi.mail = nuova.scheda || nuova.eventi ? 'da-mandare' : 'non-serve';
    await salvaEventi(id, eventi);
    const mail = eventi.mail === 'da-mandare'
      ? {
        fornitore: carrozzeria.nome, agente: { nome: contesto.nome ?? '', email: contesto.email }, scheda: ridotta, dati, nuova,
        ...(segnali ? { prefiltro: { segnali } } : {}),
      }
      : null;
    // La risposta parte subito; esito e mail li segue il server per circa 90 secondi
    waitUntil(seguiEventi(carrozzeria, id, eventi, mail).catch((err) =>
      console.error(JSON.stringify({ evento: 'motore_eventi_errore', fornitore: carrozzeria.slug, msg: String(err) }))));
  }
  const credito = creditoPerSchermo(carrozzeria, dati, segnali, eventi?.stato ?? 'non-avviata');

  return json({ ok: true, ricercaId: id, scheda: ridotta, info, credito, eventi: eventi?.stato ?? null, daCache: Boolean(scheda.daCache) });
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const e = await sessioneMotore(request, url.searchParams.get('f'));
  if (!e.ok) return e.risposta;

  const { carrozzeria, contesto } = e;
  const prefiltro = carrozzeria.regoleSemaforo === 'prefiltro';
  const attesaEventi = url.searchParams.get('eventi') === '1';
  const { where, valori } = filtroVisibilita(e, '', 2);
  // La colonna segnali la legge solo il prefiltro
  const riga = await queryUna<{
    id: string; piva: string;
    dati_credito: { dati: DatiCreditoMotore; scheda: SchedaRidotta };
    eventi: EventiRicerca | null;
    segnali?: SegnaliPrefiltro | null;
    creato?: Date | string;
  }>(
    `SELECT id, piva, dati_credito, eventi${prefiltro ? ', segnali, creato' : ''} FROM app.ricerca_merito WHERE id = $1 AND ${where}`,
    [url.searchParams.get('id') ?? '', ...valori],
  );
  if (!riga) return json({ ok: false, error: 'ricerca_non_trovata' }, 404);

  // Riaprendo la ricerca i segnali si rileggono, perche' MCF puo' aver segnato il
  // cliente nel frattempo, e si salvano di nuovo; l'attesa degli eventi usa quelli
  // salvati. Le pratiche contano fino al momento della ricerca, non a oggi: quella
  // mandata dopo aver verificato il cliente non accende la regola 9 (Ruling 11).
  // Una fonte che non risponde lascia il valore salvato invece di azzerarlo.
  let segnali: SegnaliPrefiltro | null = null;
  if (prefiltro) {
    const salvati = riga.segnali ?? null;
    if (attesaEventi && salvati) segnali = salvati;
    else {
      segnali = unisciSegnali(await segnaliPrefiltro(riga.piva, new Date(riga.creato ?? Date.now())), salvati);
      await salvaSegnali(riga.id, segnali);
    }
  }

  let ev = riga.eventi;
  if (regoleConEventi(carrozzeria) && ev && serveControllo(ev)) {
    const mail = {
      fornitore: carrozzeria.nome, agente: { nome: contesto.nome ?? '', email: contesto.email },
      scheda: riga.dati_credito.scheda, dati: riga.dati_credito.dati, nuova: { scheda: false, eventi: !ev.daRegistro },
      ...(segnali ? { prefiltro: { segnali } } : {}),
    };
    ev = await riprendiEventi(carrozzeria, riga.id, ev, mail).catch(() => ev);
  }
  const credito = creditoPerSchermo(carrozzeria, riga.dati_credito.dati, segnali, ev?.stato ?? 'non-avviata');

  // Attesa degli eventi dalla pagina: solo semaforo e stato, niente scheda
  if (attesaEventi) return json({ ok: true, eventi: ev?.stato ?? null, credito });

  // Le info aggiuntive vengono dalla cache, senza spendere. Scaduta la cache
  // (30 giorni) restano la scheda ridotta e i numeri salvati con la ricerca.
  const cache = await schedaSoloCache(riga.piva);
  // Le ricerche salvate prima del 21/10/2026 non hanno PEC e codice SDI: dalla stessa cache
  const scheda = riga.dati_credito.scheda.pec === undefined && cache
    ? { ...riga.dati_credito.scheda, ...fatturazioneDaScheda(cache) }
    : riga.dati_credito.scheda;
  return json({
    ok: true,
    ricercaId: riga.id,
    scheda,
    info: cache ? leggiScheda(cache).info : null,
    credito,
    eventi: ev?.stato ?? null,
  });
}
