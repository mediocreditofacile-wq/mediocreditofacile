export const prerender = false;

/**
 * Verifica partita IVA della pagina /fiera — GET /api/fiera-verifica?piva=...
 * GET /api/fiera-verifica?stato=1 dice solo se il servizio e' attivo, senza cercare.
 *
 * Fratello pubblico di /api/azienda-base (tool Marotta): stessa ricercaBase(),
 * stessa cache, ma chiamate marcate 'fiera' nel registro spesa e protette dai
 * quattro anelli di src/lib/fiera-guardia.ts. Restituisce i dati anagrafici e i
 * numeri di bilancio: il semaforo lo calcola la pagina con src/lib/credit-policy.ts.
 *
 * La partita IVA cercata e' di un cliente del fornitore: non si salva da nessuna
 * parte qui (la cache Openapi resta quella condivisa del sito).
 */

import { ricercaBase, ricercaSoloCache, fatturatoDaRicerca, type RicercaBase } from '../../lib/openapi';
import { pivaValida, pulisciPiva } from '../../lib/piva';
import {
  annota, cookieDispositivo, impronta, inFiera, ipDellaRichiesta, leggiDispositivo,
  restanti, serveRegistrazione, statoServizio, troppeRichieste, type StatoDispositivo,
} from '../../lib/fiera-guardia';

function json(body: unknown, status = 200, dispositivo?: StatoDispositivo): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
  const c = dispositivo ? cookieDispositivo(dispositivo) : null;
  if (c) headers['Set-Cookie'] = c;
  return new Response(JSON.stringify(body), { status, headers });
}

/** Solo quello che serve alla pagina: niente PEC, soci, codici interni */
function scheda(r: RicercaBase) {
  return {
    trovata: true,
    ragioneSociale: r.ragioneSociale,
    indirizzo: r.indirizzo,
    stato: r.stato,
    formaGiuridica: r.formaGiuridica,
    inizioAttivita: r.inizioAttivita ?? r.iscrizioneRegistro,
    annoBilancio: r.annoBilancio,
    fatturato: fatturatoDaRicerca(r),
    utile: r.utile,
    patrimonioNetto: r.patrimonioNetto,
  };
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const dispositivo = leggiDispositivo(request);

  if (url.searchParams.get('stato')) {
    const s = await statoServizio();
    return json({
      attivo: s.attivo,
      inFiera: inFiera(),
      registrazione: serveRegistrazione(dispositivo),
      restanti: restanti(dispositivo),
    });
  }

  const piva = pulisciPiva(url.searchParams.get('piva') ?? '');
  if (!pivaValida(piva)) return json({ errore: 'piva' }, 400);

  const ipHash = impronta(ipDellaRichiesta(request));
  const log = (esito: string, fonte?: string | null) =>
    annota({ ipHash, dispositivo: dispositivo.d, esito, fonte });

  // Anello 2: frequenza per indirizzo
  if (await troppeRichieste(ipHash)) {
    await log('frequenza');
    return json({ errore: 'frequenza' }, 429);
  }

  // Anello 1: dopo la fiera serve la registrazione
  if (serveRegistrazione(dispositivo)) {
    await log('registrazione');
    return json({ registrazione: true, restanti: 0 }, 403, dispositivo);
  }

  try {
    // La cache non costa: passa senza toccare i tetti 3 e 4
    let r = await ricercaSoloCache(piva);
    if (!r) {
      const s = await statoServizio();
      if (!s.attivo) {
        await log(s.motivo ?? 'tetto_spesa');
        console.warn(JSON.stringify({ evento: 'fiera_verifica_tetto', motivo: s.motivo, spesa: s.spesaFiera, oggi: s.ricercheOggi }));
        return json({ disattivata: true }, 503);
      }
      r = await ricercaBase(piva, { sorgente: 'fiera' });
    }

    const aggiornato = { ...dispositivo, n: dispositivo.n + 1 };
    await log(r.trovata ? 'trovata' : 'non_trovata', r.fonte);
    console.log(JSON.stringify({ evento: 'fiera_verifica', fonte: r.fonte, trovata: r.trovata }));
    if (!r.trovata) return json({ trovata: false, restanti: restanti(aggiornato) }, 200, aggiornato);
    return json({ ...scheda(r), restanti: restanti(aggiornato) }, 200, aggiornato);
  } catch (err) {
    await log('errore');
    console.error(JSON.stringify({ evento: 'fiera_verifica_errore', msg: err instanceof Error ? err.message : String(err) }));
    return json({ errore: 'servizio' }, 502);
  }
}
