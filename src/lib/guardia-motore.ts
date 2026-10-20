// Le API del portale Green-Go e i fornitori sul motore dei portali.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database.
//
// /api/portale-doc, /api/portale-simulazione, /api/portale-preventivo e
// /api/portale-preventivi sono del portale Green-Go: quotano il listino unico del
// fornitore e consegnano qualunque file sotto preventivi/<slug>/. Un fornitore sul
// motore (una riga in app.carrozzeria, oggi Led Office, Duplex, il demo) passa solo
// da /api/motore/*, che applica prefiltro, canali con maggiorazione e la cartella
// riservata a MCF. Da quelle quattro API un suo agente quoterebbe il listino nudo
// saltando il prefiltro e scaricherebbe la proposta per il locatore indovinandone il
// percorso. Qui la porta si chiude, per ogni ruolo: l'admin MCF ha /api/motore/*.
// Green-Go non ha una carrozzeria e passa come prima.

import { queryUna } from './db';
import type { Contesto } from './portale-auth';

const rifiuto = (status: number, error: string) =>
  new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

/**
 * Il rifiuto per una sessione il cui fornitore sta sul motore (403 portale_del_motore),
 * oppure null se la richiesta puo' proseguire. Senza fornitore (l'admin MCF che non ne
 * indica uno e non e' membro di nessuno) non c'e' carrozzeria da cercare. Se il
 * database non risponde si rifiuta: meglio un portale fermo un minuto che una porta
 * lasciata aperta.
 */
export async function rifiutoSeSulMotore(
  contesto: Pick<Contesto, 'fornitoreSlug' | 'userId' | 'ruolo'>,
  rotta: string,
): Promise<Response | null> {
  const slug = contesto.fornitoreSlug;
  if (!slug) return null;
  try {
    const carrozzeria = await queryUna(`SELECT 1 AS si FROM app.carrozzeria WHERE slug = $1`, [slug]);
    if (!carrozzeria) return null;
  } catch (err) {
    console.error(JSON.stringify({ event: 'portale_motore_verifica_errore', rotta, fornitore: slug, msg: String(err) }));
    return rifiuto(503, 'verifica_portale_non_riuscita');
  }
  console.warn(JSON.stringify({
    event: 'portale_del_motore_rifiutato',
    rotta,
    userId: contesto.userId,
    ruolo: contesto.ruolo,
    fornitore: slug,
  }));
  return rifiuto(403, 'portale_del_motore');
}
