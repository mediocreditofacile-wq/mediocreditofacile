// Le ricerche salvate prima del 21/10/2026 non hanno firmatario, PEC e codice SDI:
// si prendono dalla scheda gia' pagata nella cache, senza chiamare Openapi, e si
// salvano sulla riga, cosi' la lettura dalla cache avviene una volta sola.
//
// ATTENZIONE — FILE SERVER-ONLY: il firmatario porta codice fiscale e data di nascita.

import { query } from '../db';
import { schedaSoloCache } from '../openapi';
import type { RicercaSalvata } from './calcolo-proposta';
import { fatturazioneDaScheda, firmatarioDaScheda } from './registro-vendita';

export async function completaRicerca(r: RicercaSalvata): Promise<RicercaSalvata> {
  if (r.dati_credito.firmatario !== undefined) return r;
  const cache = await schedaSoloCache(r.piva).catch(() => null);
  // Cache scaduta: firmatario e recapiti restano vuoti, e si riprova alla prossima lettura
  if (!cache) return { ...r, dati_credito: { ...r.dati_credito, firmatario: null } };

  const fatturazione = fatturazioneDaScheda(cache);
  const dati_credito = {
    ...r.dati_credito,
    scheda: { ...r.dati_credito.scheda, pec: fatturazione.pec, sdi: fatturazione.sdi },
    firmatario: firmatarioDaScheda(cache),
  };
  await query(`UPDATE app.ricerca_merito SET dati_credito = $2 WHERE id = $1`, [r.id, JSON.stringify(dati_credito)])
    .catch((err) => console.error(JSON.stringify({ evento: 'motore_registro_non_salvato', ricercaId: r.id, msg: String(err) })));
  return { ...r, dati_credito };
}
