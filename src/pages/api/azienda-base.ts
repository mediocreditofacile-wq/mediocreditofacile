export const prerender = false;

/**
 * Anagrafica base di un'azienda per il tool Marotta — GET /api/azienda-base?piva=...
 *
 * Sostituisce /api/cerved, fermo da inizio agosto (403 di Cerved sui prodotti).
 * Legge da Openapi IT-advanced: ragione sociale, fatturato, utile, ATECO in
 * italiano, data di inizio attivita' e indirizzo. Non tocca il patrimonio netto
 * ne' il punteggio di rischio, che stanno nella meta' a pagamento del flusso
 * (/api/azienda) e partono solo su richiesta esplicita.
 *
 * La risposta ha la stessa forma di quella di Cerved sui campi che il tool legge
 * (found, ragioneSociale, fatturato, patrimonioNetto, utile, cgs, ateco,
 * dataCostituzione, indirizzo), cosi' il tool non va riscritto. I campi che
 * Openapi non da' in questa fascia tornano null, e il tool li mostra gia' come
 * "dato non disponibile".
 *
 * Il campo cgs resta SEMPRE null: il punteggio Openapi ha una sua scala (A1-C3) e
 * spacciarlo per il CGS Cerved, che va da 1 a 9, darebbe giudizi sbagliati.
 *
 * Autenticazione: nessuna, per ora. La chiamata costa pochi centesimi e c'e' un
 * tetto mensile server-side (OPENAPI_TETTO_RICERCHE), quindi un abuso si ferma da
 * solo. L'endpoint a pagamento, quello si', nascera' autenticato.
 */

import { ricercaBase, entroIlTetto } from '../../lib/openapi';
import { headersMarotta } from '../../lib/origini-marotta';

export async function OPTIONS({ request }: { request: Request }) {
  return new Response(null, { status: 204, headers: headersMarotta(request.headers.get('origin')) });
}

/** Controllo del carattere di controllo: evita di spendere una chiamata su un refuso */
function pivaValida(p: string): boolean {
  if (!/^\d{11}$/.test(p)) return false;
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(p[i]);
    somma += i % 2 === 0 ? d : d * 2 > 9 ? d * 2 - 9 : d * 2;
  }
  return (10 - (somma % 10)) % 10 === Number(p[10]);
}

export async function GET({ request }: { request: Request }) {
  const h = headersMarotta(request.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: h });

  const piva = (new URL(request.url).searchParams.get('piva') ?? '').replace(/\D/g, '');
  if (!pivaValida(piva)) return json({ found: false, error: 'Partita IVA non valida' }, 400);

  const tetto = await entroIlTetto('IT-advanced');
  if (!tetto.ok) {
    console.warn(JSON.stringify({ evento: 'ricerca_azienda_tetto', piva, motivo: tetto.motivo }));
    return json({ found: false, error: 'Ricerche esaurite per questo mese' }, 429);
  }

  try {
    const r = await ricercaBase(piva);
    if (!r.trovata) {
      console.log(JSON.stringify({ evento: 'ricerca_azienda', piva, esito: 'non trovata' }));
      return json({ found: false });
    }

    // Senza fatturato il tool darebbe rosso su un dato che non ha: meglio
    // mandarlo sul form manuale, che e' quello che Andrea fa oggi comunque.
    // Un fatturato a zero vale come assente: il criterio prezzo/fatturato non
    // si puo' calcolare, e passarlo per buono darebbe un rosso finto.
    const candidato = r.fatturato ?? r.storico.find((s) => (s.fatturato ?? 0) > 0)?.fatturato ?? null;
    const fatturato = candidato != null && candidato > 0 ? candidato : null;
    if (fatturato == null) {
      console.log(JSON.stringify({ evento: 'ricerca_azienda', piva, esito: 'senza bilancio', fonte: r.fonte }));
      return json({ found: false, error: 'Nessun bilancio depositato', ragioneSociale: r.ragioneSociale });
    }

    console.log(JSON.stringify({ evento: 'ricerca_azienda', piva, fonte: r.fonte, anno: r.annoBilancio }));

    return json({
      found: true,
      // --- campi letti dal tool Marotta ---
      ragioneSociale: r.ragioneSociale,
      fatturato,
      patrimonioNetto: r.patrimonioNetto, // null salvo scheda completa gia' in cache
      utile: r.utile,
      cgs: null, // mai il rating Openapi: scala diversa, vedi nota in testa
      ateco: r.ateco,
      dataCostituzione: r.inizioAttivita ?? r.iscrizioneRegistro,
      indirizzo: r.indirizzo,
      // --- contorno, per quando il tool vorra' mostrarlo ---
      formaGiuridica: r.formaGiuridica,
      stato: r.stato,
      provincia: r.provincia,
      pec: r.pec,
      annoBilancio: r.annoBilancio,
      dipendenti: r.dipendenti,
      capitaleSociale: r.capitaleSociale,
      totaleAttivo: r.totaleAttivo,
      punteggio: r.punteggio,
      storico: r.storico,
      fonte: r.fonte,
      approfondibile: r.patrimonioNetto == null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'ricerca_azienda_errore', piva, msg }));
    return json({ found: false, error: msg }, 502);
  }
}
