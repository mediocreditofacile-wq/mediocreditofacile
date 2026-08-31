export const prerender = false;

/**
 * Controparte estera per il tool Marotta.
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
 * sull'Italia, quindi si paga dal primo pezzo. Cache 30 giorni, tetto mensile
 * server-side sugli euro.
 */

import { ricercaEstera, entroIlTetto } from '../../lib/openapi';
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
  const id = (q.get('id') ?? '').trim();
  const importoGrezzo = Number(q.get('importo'));
  const importo = Number.isFinite(importoGrezzo) && importoGrezzo > 0 ? importoGrezzo : null;

  if (!/^[A-Z]{2}$/.test(paese)) return json({ found: false, error: 'Paese non valido: serve il codice ISO a due lettere' }, 400);
  // Larghi ma non aperti: gli identificativi esteri hanno formati molto diversi
  // (CNPJ brasiliano con punti e barra, CIF spagnolo con lettera, SIREN francese)
  if (!/^[A-Za-z0-9./\- ]{4,32}$/.test(id)) return json({ found: false, error: 'Identificativo non valido' }, 400);

  const tetto = await entroIlTetto('WW-advanced');
  if (!tetto.ok) {
    console.warn(JSON.stringify({ evento: 'ricerca_estera_tetto', paese, motivo: tetto.motivo }));
    return json({ found: false, error: 'Ricerche esaurite per questo mese' }, 429);
  }

  try {
    const r = await ricercaEstera(paese, id);
    if (!r.trovata) {
      console.log(JSON.stringify({ evento: 'ricerca_estera', paese, id, esito: 'non trovata' }));
      return json({ found: false, error: 'Controparte non trovata nel registro di questo paese' });
    }

    const esito = valutaCanaleEstero(
      { fatturato: r.fatturato, patrimonioNetto: r.patrimonioNetto },
      paese,
      importo,
    );

    console.log(JSON.stringify({
      evento: 'ricerca_estera', paese, id, fonte: r.fonte, anno: r.annoBilancio, canale: esito.canale,
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
    console.error(JSON.stringify({ evento: 'ricerca_estera_errore', paese, id, msg }));
    return json({ found: false, error: msg }, 502);
  }
}
