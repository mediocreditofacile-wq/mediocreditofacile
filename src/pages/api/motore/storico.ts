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
// Le pratiche lavorate prima del portale (app.pratica_esterna) escono per
// referente e MCF, il canale solo per MCF (src/lib/motore/pratiche-esterne.ts).
//
// Sul settore mezzi ogni preventivo porta anche quello che la pratica puo' chiedere:
// durate del noleggio, colonne del leasing (chiave, nome come salvato, motivo, durate)
// e venditore, letti dallo schermo salvato (src/lib/motore/storico-mezzi.ts). Mai
// `dati`, che ha la mappa colonna -> partner. Gli altri settori restano come prima.

import { query } from '../../../lib/db';
import { praticheEsternePerRuolo, type RigaEsterna } from '../../../lib/motore/pratiche-esterne';
import { statiPerAdmin, statoPerRuolo, storiaPerRuolo } from '../../../lib/motore/stati-pratica';
import { meseDi, meseRichiesto, riepilogoMesi, verificheContate } from '../../../lib/motore/richieste';
import { filtroVisibilita, json, sessioneMotore } from '../../../lib/motore/sessione';
import { colonneMezziStorico } from '../../../lib/motore/storico-mezzi';

/** Le tre parti dello schermo salvato che servono alla pratica dei mezzi */
const COLONNE_MEZZI = `
              x.numeri->'noleggio' AS noleggio, x.numeri->'leasing' AS leasing,
              x.numeri->'venditore'->>'ragioneSociale' AS venditore,`;

export async function GET({ request }: { request: Request }) {
  const e = await sessioneMotore(request, new URL(request.url).searchParams.get('f'));
  if (!e.ok) return e.risposta;
  const { where, valori } = filtroVisibilita(e, 'x');
  const admin = e.contesto.ruolo === 'admin';
  const mese = meseRichiesto(new URL(request.url).searchParams.get('mese'));
  const mezzi = e.carrozzeria.settore === 'mezzi';

  const [ricerche, proposte, pratiche, esterne] = await Promise.all([
    query(
      `SELECT x.id, x.piva, x.ragione_sociale, x.creato, x.dati_credito->'dati'->>'rating' AS rating,
              u.name AS agente_nome
         FROM app.ricerca_merito x JOIN "user" u ON u.id = x.user_id
        WHERE ${where} AND x.creato >= now() - interval '13 months' ORDER BY x.creato DESC LIMIT 5000`,
      valori,
    ),
    query(
      `SELECT x.id, x.ricerca_id, x.piva, x.cliente_nome, x.descrizione, x.prezzo, x.semaforo,
              x.numeri->'scelta' AS scelta,${mezzi ? COLONNE_MEZZI : ''} x.documenti, x.pdf_pronti, x.creato, u.name AS agente_nome
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
    // Il commerciale non le vede: la query non parte nemmeno
    e.vedeTutto
      ? query<RigaEsterna>(
          `SELECT id::text AS id, piva, ragione_sociale, canale, to_char(data, 'YYYY-MM-DD') AS data, esito, importo
             FROM app.pratica_esterna WHERE fornitore_slug = $1 ORDER BY data DESC, id DESC LIMIT 500`,
          [e.carrozzeria.slug],
        )
      : Promise.resolve([] as RigaEsterna[]),
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
    // Le colonne lette per i mezzi escono ridotte: niente rate, spese o totali
    proposte: mezzi ? (proposte as Record<string, unknown>[]).map((p) => ({ ...p, ...colonneMezziStorico(p) })) : proposte,
    // Il canale su cui MCF ha caricato la pratica lo legge solo MCF: agli altri arriva "inserita"
    pratiche: (pratiche as any[]).map((p) => ({ ...p, stato: statoPerRuolo(p.stato, admin), storia: storiaPerRuolo(p.storia, admin) })),
    ...(admin ? { stati: statiPerAdmin() } : {}),
    esterne: praticheEsternePerRuolo(esterne, e.contesto.ruolo, e.vedeTutto),
  });
}
