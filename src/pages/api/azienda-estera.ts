export const prerender = false;

/**
 * Controparte estera per il tool Marotta e per /tools/valutazione.
 * GET /api/azienda-estera?paese=DE&id=DE129274202&importo=250000
 *
 * Restituisce anagrafica e bilancio della controparte piu' il canale consigliato:
 * sopra i 2 milioni di volumi o di patrimonio netto si va su Econocom, sotto si va
 * sul percorso export con garanzia SACE. La regola vive in `src/data/export-estero.ts`,
 * non qui e non nel tool, cosi' la scheda a schermo e il PDF non possono divergere.
 *
 * `importo` e' il valore del bene da finanziare e serve solo alla rata indicativa
 * Econocom: si puo' omettere, e in quel caso il canale si decide lo stesso ma la
 * rata non esce.
 *
 * Costa 0,11 EUR a chiamata: all'estero non c'e' la franchigia mensile che c'e'
 * sull'Italia, quindi si paga dal primo pezzo. Cache 30 giorni.
 *
 * Chi paga lo dice la chiamata: il tool Marotta chiama senza credenziali e spende
 * il suo budget (OPENAPI_TETTO_MAROTTA, 30 euro al mese); /tools/valutazione manda
 * la sua chiave come bearer e la ricerca va sul tool interno, che non ha tetto.
 * Fino al 20/10/2026 erano lo stesso budget, e le schede del tool interno avevano
 * fermato la ricerca estera a tutti e due.
 */

import { ricercaEstera, entroIlTetto } from '../../lib/openapi';
import { sorgenteRicercaEstera } from '../../lib/tetto-openapi';
import { normalizzaIdEstero } from '../../lib/id-estero';
import { headersMarotta } from '../../lib/origini-marotta';
import { valutaCanaleEstero, nuovaCostituzione } from '../../data/export-estero';

export async function OPTIONS({ request }: { request: Request }) {
  return new Response(null, { status: 204, headers: headersMarotta(request.headers.get('origin')) });
}

export async function GET({ request }: { request: Request }) {
  const h = headersMarotta(request.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: h });

  const q = new URL(request.url).searchParams;
  const paese = (q.get('paese') ?? '').trim().toUpperCase();
  const grezzo = (q.get('id') ?? '').trim();
  const importoGrezzo = Number(q.get('importo'));
  const importo = Number.isFinite(importoGrezzo) && importoGrezzo > 0 ? importoGrezzo : null;

  if (!/^[A-Z]{2}$/.test(paese)) return json({ found: false, error: 'Paese non valido: serve il codice ISO a due lettere' }, 400);
  // Larghi ma non aperti: gli identificativi esteri hanno formati molto diversi
  // (CNPJ brasiliano con punti e barra, CIF spagnolo con lettera, SIREN francese)
  if (!/^[A-Za-z0-9./\- ]{4,32}$/.test(grezzo)) return json({ found: false, error: 'Identificativo non valido' }, 400);
  // Sui paesi con una regola (oggi i Paesi Bassi) il codice si ripulisce e si
  // controlla qui: un codice malformato costerebbe una chiamata a vuoto
  const norma = normalizzaIdEstero(paese, grezzo);
  if (!norma.ok) return json({ found: false, error: norma.errore }, 400);
  const id = norma.id;

  const sorgente = sorgenteRicercaEstera(request.headers.get('authorization'), import.meta.env.VALUTAZIONE_KEY as string | undefined);
  const tetto = await entroIlTetto('WW-advanced', sorgente);
  if (!tetto.ok) {
    console.warn(JSON.stringify({ evento: 'ricerca_estera_tetto', paese, sorgente, motivo: tetto.motivo }));
    return json({ found: false, error: tetto.messaggio }, 429);
  }

  try {
    const r = await ricercaEstera(paese, id, sorgente);
    if (!r.trovata) {
      console.log(JSON.stringify({ evento: 'ricerca_estera', paese, id, sorgente, esito: 'non trovata' }));
      return json({ found: false, error: 'Controparte non trovata nel registro di questo paese' });
    }

    const esito = valutaCanaleEstero(
      { fatturato: r.fatturato, patrimonioNetto: r.patrimonioNetto },
      paese,
      importo,
    );

    console.log(JSON.stringify({
      evento: 'ricerca_estera', paese, id, sorgente, fonte: r.fonte, anno: r.annoBilancio, canale: esito.canale,
    }));

    // I campi piatti hanno gli stessi nomi di /api/azienda-base: il tool li legge
    // gia' cosi', quindi anagrafica, metriche, scheda e credit policy funzionano
    // sulla controparte estera senza toccare niente a valle.
    return json({
      found: true,
      ragioneSociale: r.ragioneSociale,
      fatturato: r.fatturato,
      patrimonioNetto: r.patrimonioNetto,
      utile: r.utile,
      cgs: null, // il CGS e' un prodotto Cerved italiano: sull'estero non esiste
      ateco: r.classificazione,
      dataCostituzione: r.inizioAttivita,
      indirizzo: r.indirizzo,
      formaGiuridica: r.formaGiuridica,
      stato: r.stato,
      annoBilancio: r.annoBilancio,
      dipendenti: r.dipendenti,
      totaleAttivo: r.totaleAttivo,
      solvibile: r.solvibile,
      storico: r.storico,
      fonte: r.fonte,
      // --- specifico dell'estero ---
      paese,
      nuovaCostituzione: nuovaCostituzione(r.inizioAttivita),
      esito,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'ricerca_estera_errore', paese, id, sorgente, msg }));
    return json({ found: false, error: msg }, 502);
  }
}
