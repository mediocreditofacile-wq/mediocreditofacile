// Simulazione del canone sul settore distinta (oggi Led Office), prima di verificare il
// cliente. Decisa da Alberto il 21/10/2026 con Maurizio Palumbo: il commerciale
// scrive l'importo e da' subito al cliente i canoni a 24, 36, 48 e 60 mesi, anche col
// preventivo in PDF, senza partita IVA, senza marca e senza modello.
//
// ATTENZIONE — FILE SERVER-ONLY: passa dall'instradamento, che legge i coefficienti.
//
// Il canale lo sceglie l'instradamento come per la distinta, ma con un cliente di cui
// non si sa niente: un dato che manca non soddisfa mai una condizione, quindi i canali
// che chiedono fatturato o forma giuridica (Econocom) saltano e quota il canale di
// chiusura, con la sua maggiorazione gia' dentro la rata. Per un cliente grande la
// rata della verifica puo' venire piu' bassa, mai piu' alta: la simulazione resta
// prudente. Verso referente e agente esce solo vistaCommerciale().
//
// Il preventivo della simulazione va nello Storico (app.proposta senza ricerca, come
// le proposte Duplex prima della verifica) e non serve per caricare una pratica, che
// vuole una proposta della ricerca. Non manda mail a MCF: non c'e' ancora un cliente.

import { logoDaBlob } from '../brand-fornitore';
import { query } from '../db';
import { salvaPdf } from '../preventivi-pv';
import type { Carrozzeria } from './carrozzeria';
import { DURATA_EVIDENZA, instrada, vistaCommerciale, type ClienteInstradamento, type Instradamento } from './instradamento';
import { nomeCanale } from './nomi-canale';
import { DESCRIZIONE_SIMULAZIONE, documentoSimulazione, type DatiSimulazione } from './pdf-ledoffice';
import { generaId, type EsitoMotore } from './sessione';

type Sessione = Extract<EsitoMotore, { ok: true }>;

/** Oltre questo importo non si simula: e' un errore di battitura, non una fornitura */
export const IMPORTO_MASSIMO_SIMULAZIONE = 1_000_000;

/** Il semaforo della riga in app.proposta: la simulazione non ha valutato nessuno */
export const SEMAFORO_SIMULAZIONE = 'simulazione';

/** Il cliente che la simulazione non conosce: nessun dato, nessuna condizione soddisfatta */
const CLIENTE_SCONOSCIUTO: ClienteInstradamento = { formaCodice: null, inizioAttivita: null, fatturato: null, atecoCodice: null };

const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Il corpo della richiesta: l'importo come numero (il browser legge "1.500" all'italiana), il resto facoltativo */
export function leggiSimulazione(corpo: Record<string, unknown>):
  | { ok: true; dati: DatiSimulazione }
  | { ok: false; error: 'importo_non_valido' } {
  const importo = typeof corpo.importo === 'number' ? Number(corpo.importo.toFixed(2)) : NaN;
  if (!Number.isFinite(importo) || importo <= 0 || importo > IMPORTO_MASSIMO_SIMULAZIONE) {
    return { ok: false, error: 'importo_non_valido' };
  }
  return { ok: true, dati: { importo, intestatario: testo(corpo.intestatario, 120), descrizione: testo(corpo.descrizione, 200) } };
}

/** Il canale e le rate per l'importo, senza cliente. Null se nessun canale lo quota */
export function simula(k: Pick<Carrozzeria, 'canali'>, importo: number, oggi: Date = new Date()): Instradamento | null {
  return k.canali && k.canali.length ? instrada(k.canali, CLIENTE_SCONOSCIUTO, importo, oggi) : null;
}

const euroIt = (v: number) => `${v.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' })} euro`;

/**
 * La risposta allo schermo: le rate per tutti, canale e importi del locatore solo per MCF.
 * La riga di MCF arriva gia' scritta: il codice della pagina, che e' lo stesso per gli
 * agenti, non deve contenere nemmeno le parole.
 */
export function simulazionePerSchermo(i: Instradamento, admin: boolean) {
  const vista = vistaCommerciale(i);
  const durataEvidenza = vista.rate.some((r) => r.durata === DURATA_EVIDENZA)
    ? DURATA_EVIDENZA
    : vista.rate.at(-1)?.durata ?? DURATA_EVIDENZA;
  return {
    ...vista,
    durataEvidenza,
    ...(admin
      ? { riservato: `Solo MCF: ${nomeCanale(i.canale) ?? i.canale}, maggiorazione ${euroIt(i.maggiorazione)}, imponibile ${euroIt(i.imponibile)}.` }
      : {}),
  };
}

/** Salva la simulazione nello Storico e genera il preventivo del canone */
export async function generaSimulazione(e: Sessione, s: DatiSimulazione, i: Instradamento) {
  const k = e.carrozzeria;
  const vista = simulazionePerSchermo(i, false);
  const descrizione = `Simulazione: ${s.descrizione || DESCRIZIONE_SIMULAZIONE}`;
  const numeri = { rate: vista.rate, durataEvidenza: vista.durataEvidenza, scelta: {
    durata: vista.durataEvidenza, canone: vista.rate.find((r) => r.durata === vista.durataEvidenza)?.canone ?? null,
  } };
  const riservato = { canale: i.canale, beni: i.beni, maggiorazione: i.maggiorazione, imponibile: i.imponibile };

  const idBase = generaId(k.prefisso, 'SIM');
  let id = '';
  for (let tentativo = 0; tentativo < 4 && !id; tentativo++) {
    const candidato = tentativo ? `${idBase}-${tentativo + 1}` : idBase;
    const righe = await query(
      `INSERT INTO app.proposta (id, fornitore_slug, organization_id, user_id, ricerca_id, piva, cliente_nome,
                                 voce_codice, descrizione, prezzo, semaforo, anticipo, markup, dati, numeri,
                                 canale, riservato)
       VALUES ($1,$2,$3,$4,NULL,'',$5,NULL,$6,$7,$8,0,0,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [candidato, k.slug, e.contesto.organizationId, e.contesto.userId, s.intestatario || 'Cliente da verificare',
       descrizione, s.importo, SEMAFORO_SIMULAZIONE, JSON.stringify({ simulazione: true, ...s }), JSON.stringify(numeri),
       i.canale, JSON.stringify(riservato)],
    );
    if (righe.length) id = candidato;
  }
  if (!id) throw new Error('id_proposta_occupato');

  let documenti: { nome: string; pathname: string }[] = [];
  try {
    const pdf = documentoSimulazione(s, i, k, id, await logoDaBlob(k.brand.logo));
    documenti = (await salvaPdf(k.slug, id, [pdf])).map((d) => ({ nome: d.nome, pathname: d.pathname }));
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_simulazione_pdf_errore', fornitore: k.slug, id, error: String(err) }));
  }
  await query(`UPDATE app.proposta SET documenti = $2, pdf_pronti = $3 WHERE id = $1`, [id, JSON.stringify(documenti), documenti.length > 0]);

  console.log(JSON.stringify({
    evento: 'motore_simulazione', fornitore: k.slug, id, userId: e.contesto.userId, beni: s.importo, canale: i.canale, pdf_ok: documenti.length > 0,
  }));
  return { id, documenti, pdfPronti: documenti.length > 0 };
}
