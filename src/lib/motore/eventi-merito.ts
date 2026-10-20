// Eventi negativi alla ricerca del cliente, per i fornitori col semaforo del locatore
// (Duplex) e col prefiltro (Led Office): stesso giro per tutti e due (regoleConEventi
// di segnali-prefiltro.ts). La mail la decide il DatiMailVerifica che arriva dall'API:
// sul prefiltro porta anche i segnali, qui passa cosi' com'e'.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// La ricerca risponde subito con gli eventi "in verifica"; in background
// (waitUntil, nell'API) si segue l'esito per circa 90 secondi, si scrive sulla
// riga della ricerca e nel registro condiviso, poi parte la mail ad Alberto.
// L'esito che conta e' quello in Postgres (app.ricerca_merito.eventi): il registro
// su Blob rilegge i file sovrascritti dalla cache (CLAUDE.md, Documenti ufficiali)
// e serve soprattutto a non ripagare la verifica all'invio della pratica.

import { query } from '../db';
import {
  avviaNegativita,
  entroIlTetto,
  esitoNegativita,
  leggiVerifica,
  scriviVerifica,
  sorgenteCarrozzeria,
} from '../openapi';
import { decidiVerifica, riduciNegativita } from '../verifiche-cache';
import type { Carrozzeria } from './carrozzeria';
import { ATTESA_EVENTI_MS, PASSO_EVENTI_MS, eventiNonAvviati, statoDaEsito, type EventiRicerca } from './eventi-stato';
import { mandaMailVerifica, type DatiMailVerifica } from './mail-verifica';

export async function salvaEventi(ricercaId: string, ev: EventiRicerca): Promise<void> {
  await query(`UPDATE app.ricerca_merito SET eventi = $2 WHERE id = $1`, [ricercaId, JSON.stringify(ev)]);
}

/** Avvio: dal registro se c'e' (gratis), altrimenti a pagamento dentro il tetto del fornitore */
export async function avviaEventi(k: Carrozzeria, codice: string): Promise<EventiRicerca> {
  try {
    const d = decidiVerifica(await leggiVerifica(codice), 'negativita');
    if (d.azione === 'registro') {
      return {
        stato: d.pronto ? statoDaEsito(d.dati) : 'in-verifica',
        id: d.id, avviata: d.avviata, chiusa: d.pronto ? d.avviata : null,
        codice, daRegistro: true, mail: 'non-serve',
      };
    }
    const sorgente = sorgenteCarrozzeria(k.slug);
    const tetto = await entroIlTetto('IT-negativita', sorgente, k.tettoMeseEuro);
    if (!tetto.ok) return eventiNonAvviati(codice);
    const id = await avviaNegativita(codice, sorgente);
    if (!id) return eventiNonAvviati(codice);
    const avviata = new Date().toISOString();
    await scriviVerifica(codice, 'negativita', { id, avviata, pronto: false }).catch(() => {});
    return { stato: 'in-verifica', id, avviata, chiusa: null, codice, daRegistro: false, mail: 'non-serve' };
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_eventi_errore', fornitore: k.slug, msg: String(err) }));
    return eventiNonAvviati(codice);
  }
}

/** Una lettura su Openapi: se l'esito e' pronto lo scrive nel registro e sulla ricerca */
export async function controllaEventi(k: Carrozzeria, ricercaId: string, ev: EventiRicerca): Promise<EventiRicerca> {
  if (!ev.id) return ev;
  const r = await esitoNegativita(ev.id, sorgenteCarrozzeria(k.slug));
  if (!r.pronto) return ev;
  const chiusa = new Date().toISOString();
  const nuovo: EventiRicerca = { ...ev, stato: statoDaEsito(r.dati), chiusa };
  await scriviVerifica(ev.codice, 'negativita', {
    id: ev.id, avviata: ev.avviata ?? chiusa, pronto: true, dati: riduciNegativita(r.dati), concluso: chiusa,
  }).catch(() => {});
  await salvaEventi(ricercaId, nuovo);
  return nuovo;
}

async function chiudiMail(ricercaId: string, ev: EventiRicerca, mail: DatiMailVerifica): Promise<EventiRicerca> {
  const esito = await mandaMailVerifica(mail, ev.stato);
  if (!esito.ok) {
    console.error(JSON.stringify({
      evento: 'motore_mail_verifica_persa', ricercaId, piva: mail.scheda.piva,
      ragioneSociale: mail.scheda.ragioneSociale, eventi: ev.stato, err: esito.err,
    }));
    return ev;
  }
  const chiuso: EventiRicerca = { ...ev, mail: 'mandata' };
  await salvaEventi(ricercaId, chiuso);
  return chiuso;
}

/** In background dopo la ricerca: segue l'esito fino a 90 secondi, chiude, manda la mail se serve */
export async function seguiEventi(
  k: Carrozzeria,
  ricercaId: string,
  ev: EventiRicerca,
  mail: DatiMailVerifica | null,
): Promise<void> {
  let corrente = ev;
  const fine = Date.now() + ATTESA_EVENTI_MS;
  while (corrente.stato === 'in-verifica' && Date.now() < fine) {
    await new Promise((r) => setTimeout(r, PASSO_EVENTI_MS));
    corrente = await controllaEventi(k, ricercaId, corrente).catch(() => corrente);
  }
  if (corrente.stato === 'in-verifica') {
    corrente = { ...corrente, stato: 'non-pervenuti' };
    await salvaEventi(ricercaId, corrente);
  }
  if (mail && corrente.mail === 'da-mandare') await chiudiMail(ricercaId, corrente, mail);
}

/**
 * Ricerca riaperta dopo il giro in background (serveControllo): una lettura. Se
 * l'esito arriva adesso e la mail non era partita, parte; se era partita e
 * l'esito tardivo porta eventi presenti, parte un aggiornamento.
 */
export async function riprendiEventi(
  k: Carrozzeria,
  ricercaId: string,
  ev: EventiRicerca,
  mail: DatiMailVerifica,
): Promise<EventiRicerca> {
  const prima = ev.stato;
  const ora = await controllaEventi(k, ricercaId, ev);
  if (ora.stato === prima) return ora;
  if (ora.mail === 'da-mandare') return chiudiMail(ricercaId, ora, mail);
  if (ora.mail === 'mandata' && ora.stato === 'presenti') {
    await mandaMailVerifica({ ...mail, aggiornamento: true }, ora.stato);
  }
  return ora;
}
