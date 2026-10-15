export const prerender = false;

// Storico del portale: ricerche di merito, preventivi e pratiche.
// GET /api/motore/storico?f=<slug>&mese=AAAA-MM
//
// Le verifiche sono quelle del mese scelto (default il mese corrente, in ora
// italiana), ognuna segnata se conta come richiesta: un cliente al mese
// (src/lib/motore/richieste.ts). In `mesi` il totale delle richieste degli
// ultimi 13 mesi. Nessun euro: prezzo e spesa li vede solo il Pannello MCF.
//
// L'agente vede il proprio, referente e admin MCF tutto il fornitore: la
// differenza sta nella clausola WHERE (filtroVisibilita), non nell'interfaccia.
// L'esito della verifica eventi negativi esce solo per l'admin MCF.

import { query } from '../../../lib/db';
import { meseDi, meseRichiesto, riepilogoMesi, verificheContate } from '../../../lib/motore/richieste';
import { filtroVisibilita, json, sessioneMotore } from '../../../lib/motore/sessione';

export async function GET({ request }: { request: Request }) {
  const e = await sessioneMotore(request, new URL(request.url).searchParams.get('f'));
  if (!e.ok) return e.risposta;
  const { where, valori } = filtroVisibilita(e, 'x');
  const admin = e.contesto.ruolo === 'admin';
  const mese = meseRichiesto(new URL(request.url).searchParams.get('mese'));

  const [ricerche, proposte, pratiche] = await Promise.all([
    query(
      `SELECT x.id, x.piva, x.ragione_sociale, x.creato, x.dati_credito->'dati'->>'rating' AS rating,
              u.name AS agente_nome
         FROM app.ricerca_merito x JOIN "user" u ON u.id = x.user_id
        WHERE ${where} AND x.creato >= now() - interval '13 months' ORDER BY x.creato DESC LIMIT 5000`,
      valori,
    ),
    query(
      `SELECT x.id, x.ricerca_id, x.piva, x.cliente_nome, x.descrizione, x.prezzo, x.semaforo,
              x.numeri->'scelta' AS scelta, x.documenti, x.pdf_pronti, x.creato, u.name AS agente_nome
         FROM app.proposta x JOIN "user" u ON u.id = x.user_id
        WHERE ${where} ORDER BY x.creato DESC LIMIT 200`,
      valori,
    ),
    query(
      `SELECT x.id, x.proposta_id, x.piva, x.cliente_nome, x.importo, x.stato, x.documenti,
              x.dati->>'prodotto' AS prodotto, x.dati->>'durata' AS durata,
              ${admin ? 'x.negativita,' : ''} x.storia, x.creato, x.aggiornato, u.name AS agente_nome
         FROM app.pratica x JOIN "user" u ON u.id = x.user_id
        WHERE ${where} ORDER BY x.creato DESC LIMIT 500`,
      valori,
    ),
  ]);

  const tutte = ricerche as { id: string; piva: string; creato: string }[];
  const delMese = tutte.filter((r) => meseDi(r.creato) === mese);
  const contate = verificheContate(delMese);
  return json({
    ok: true, ruolo: e.contesto.ruolo, vedeTutto: e.vedeTutto,
    mese, mesi: riepilogoMesi(tutte),
    // Solo se il fornitore paga le verifiche: un si' o un no, mai il prezzo
    conteggio: e.carrozzeria.prezzoVerifica !== null,
    ricerche: delMese.map((r) => ({ ...r, conta: contate.has(r.id) })),
    proposte, pratiche,
  });
}
