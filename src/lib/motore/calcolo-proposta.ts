// Il calcolo di una proposta, condiviso fra lo schermo (/api/motore/proposte)
// e il salvataggio del preventivo: schermo e PDF escono dalla stessa funzione.
//
// ATTENZIONE — FILE SERVER-ONLY.

import { queryUna } from '../db';
import { businessPlan, bpPerSchermo, type InputBp } from './bp-fotovoltaico';
import { voceCatalogo, type Carrozzeria, type VoceCatalogo } from './carrozzeria';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { calcolaProposte, type EsitoProposte } from './proposte';
import { filtroVisibilita, json, type EsitoMotore } from './sessione';
import type { FormaGiuridica } from '../prospetti-pv';

/** Tetto di buon senso sul prezzo trattato: oltre e' un errore di battitura */
const PREZZO_MAX = 10_000_000;

/** Numero dal corpo: il portale manda numeri, ma una stringa italiana si legge */
const numero = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim();
  const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
};

export interface RicercaSalvata {
  id: string;
  piva: string;
  ragione_sociale: string | null;
  dati_credito: { dati: DatiCreditoMotore; scheda: SchedaRidotta };
}

/** La ricerca, se l'utente la puo' vedere */
export async function ricercaVisibile(
  e: Extract<EsitoMotore, { ok: true }>,
  id: string,
): Promise<RicercaSalvata | null> {
  const { where, valori } = filtroVisibilita(e, '', 2);
  return queryUna<RicercaSalvata>(
    `SELECT id, piva, ragione_sociale, dati_credito FROM app.ricerca_merito WHERE id = $1 AND ${where}`,
    [id, ...valori],
  );
}

/** La forma giuridica nel vocabolario del motore dei prospetti */
export function formaPerProspetto(forma: string | null): FormaGiuridica {
  return /individuale|persona fisica/i.test(forma ?? '') ? 'ditta-individuale' : 'societa-capitali';
}

export interface CalcoloProposta {
  ricerca: RicercaSalvata;
  voce: VoceCatalogo;
  prezzo: number;
  esito: EsitoProposte;
  bp: ReturnType<typeof businessPlan>;
  inputBp: InputBp;
}

/**
 * Il calcolo completo di una proposta, condiviso con il salvataggio del
 * preventivo: lo schermo e il PDF escono dalla stessa funzione.
 */
export async function calcolaProposta(
  e: Extract<EsitoMotore, { ok: true }>,
  corpo: Record<string, unknown>,
): Promise<{ ok: true; calcolo: CalcoloProposta } | { ok: false; risposta: Response }> {
  const carrozzeria: Carrozzeria = e.carrozzeria;
  const ricerca = await ricercaVisibile(e, String(corpo.ricercaId ?? ''));
  if (!ricerca) return { ok: false, risposta: json({ ok: false, error: 'ricerca_non_trovata' }, 404) };

  const voce = await voceCatalogo(carrozzeria.slug, String(corpo.codice ?? ''));
  if (!voce || !voce.attivo) return { ok: false, risposta: json({ ok: false, error: 'voce_non_trovata' }, 404) };

  const prezzo = Math.round((numero(corpo.prezzo) || voce.prezzo) * 100) / 100;
  if (prezzo <= 0 || prezzo > PREZZO_MAX) return { ok: false, risposta: json({ ok: false, error: 'prezzo_non_valido' }, 400) };

  const esito = calcolaProposte(prezzo, ricerca.dati_credito.dati, carrozzeria);

  const b = (corpo.bp ?? {}) as Record<string, unknown>;
  const inputBp: InputBp = {
    provincia: String(b.provincia ?? ''),
    comune: String(b.comune ?? ''),
    consumoAnnuo: numero(b.consumoAnnuo) || null,
    prezzoKwh: numero(b.prezzoKwh) || null,
    profilo: b.profilo === 'h24' ? 'h24' : 'diurno',
    durata: numero(b.durata) || null,
    includiSabatini: b.includiSabatini !== false,
    includiIper: b.includiIper !== false,
  };
  const bp = carrozzeria.settore === 'fotovoltaico'
    ? businessPlan(
        carrozzeria,
        voce,
        prezzo,
        {
          nome: ricerca.dati_credito.scheda.ragioneSociale || 'Cliente',
          formaGiuridica: formaPerProspetto(ricerca.dati_credito.scheda.formaGiuridica),
        },
        inputBp,
        esito,
      )
    : null;

  return { ok: true, calcolo: { ricerca, voce, prezzo, esito, bp, inputBp } };
}

/** Quello che dell'esito va allo schermo */
export function esitoPerSchermo(c: CalcoloProposta) {
  const { esito } = c;
  const sem = esito.locatore
    ? { etichetta: esito.locatore.etichetta as string | null, righe: esito.locatore.righe, criteri: esito.locatore.criteri as unknown[],
        massimale: null as number | null, provvisorio: esito.locatore.provvisorio, eventi: esito.locatore.eventi as string | null }
    : { etichetta: null as string | null, righe: [] as string[], criteri: (esito.credito?.criteri ?? []) as unknown[],
        massimale: esito.credito?.massimale ?? null, provvisorio: false, eventi: null as string | null };
  return {
    importo: c.prezzo,
    listino: c.voce.prezzo,
    semaforo: esito.semaforo,
    ...sem,
    anticipoRichiesto: esito.anticipoRichiesto,
    markup: esito.markup,
    bloccate: esito.bloccate,
    noleggio: esito.noleggio,
    leasing: esito.leasing,
    motivoNoLeasing: esito.motivoNoLeasing,
    motivoNoNoleggio: esito.motivoNoNoleggio,
    notaNoleggio: esito.notaNoleggio,
    avvisi: esito.avvisi,
    bp: c.bp ? bpPerSchermo(c.bp) : null,
  };
}

