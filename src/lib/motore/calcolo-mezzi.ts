// La proposta del settore mezzi (Bergamelli): i beni che l'agente descrive a mano,
// il venditore che firma l'offerta, il noleggio scelto dall'instradamento, il
// confronto del leasing a tre partner e il semaforo, in un calcolo solo.
// Spec mcf_spec-bergamelli-motore_v2, sezioni 4 e 5.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database e, tramite l'instradamento e il
// confronto del leasing, i coefficienti dei locatori e gli spread dei partner.
//
// Lo usano lo schermo (/api/motore/proposte), la simulazione prima della verifica
// (/api/motore/simulazione) e, dopo, preventivo e pratica: rate, PDF e pratica escono
// dallo stesso calcolo. Il CalcoloMezzi contiene canale, imponibile e nomi dei
// partner: verso il browser esce soltanto mezziPerSchermo(), che li toglie.
//
// Dal browser arrivano la ricerca, i beni, il venditore e l'anticipo. Il server
// ricontrolla tutto: i beni sulle categorie del fornitore (e il targato, mai
// indovinato), il venditore fra quelli della configurazione, l'anticipo come intero
// fra 0 e ANTICIPO_MAX_MEZZI. Un valore che non regge e' un errore, mai un ripiego:
// un venditore sbagliato intesterebbe l'offerta alla societa' sbagliata, un anticipo
// letto male ("1.000") sposterebbe le rate di migliaia di euro.

import { validaBeni, type BeneMezzo, type ErroreBeni } from './beni-mezzi';
import { ricercaVisibile, type RicercaSalvata } from './calcolo-proposta';
import type { Carrozzeria } from './carrozzeria';
import { ANTICIPO_MAX_MEZZI, venditoreDiCategoria, type Venditore } from './config-mezzi';
import { DURATA_EVIDENZA, instrada, vistaCommerciale, type Instradamento, type RataDurata } from './instradamento';
import { leasingConfronto, type LeasingDelPartner } from './leasing-confronto';
import { completaRicerca } from './registro-ricerca';
import { json, type EsitoMotore } from './sessione';
import { semaforoPerSchermo, valuta, type Valutazione } from './valutazione';

type Sessione = Extract<EsitoMotore, { ok: true }>;

/** Il testo fisso sul mezzo targato: Grenke non lo quota, il noleggio lo valuta MCF */
export const TESTO_TARGATO = 'Mezzo targato: noleggio su richiesta a Mediocredito Facile.';
/** Il testo fisso quando nessun canale regge il cliente e il bene */
export const TESTO_NOLEGGIO_NON_DISPONIBILE =
  'Noleggio non disponibile per questo cliente e questo bene: resta il leasing.';

/** La descrizione del bene unico della simulazione: l'agente non ne scrive una */
const DESCRIZIONE_SIMULAZIONE = 'Simulazione';

export interface CalcoloMezzi {
  /** Null solo in simulazione: il cliente non e' stato verificato */
  ricerca: RicercaSalvata | null;
  beni: BeneMezzo[];
  totale: number;
  venditore: Venditore;
  /** Anticipo del leasing, in percentuale: quello scelto dall'agente o quello della configurazione */
  anticipoPerc: number;
  /** Null solo in simulazione */
  valutazione: Valutazione | null;
  /** Canale e importi dell'instradamento: solo MCF. Null se nessun canale regge */
  noleggio: Instradamento | null;
  /** Null se il noleggio c'e'; TESTO_TARGATO se un bene e' targato; altrimenti TESTO_NOLEGGIO_NON_DISPONIBILE */
  motivoNoNoleggio: string | null;
  /** Una colonna per partner, nell'ordine della configurazione */
  leasing: LeasingDelPartner[];
}

export type ErroreMezzi = ErroreBeni | 'venditore_non_valido' | 'anticipo_non_valido' | 'configurazione_mancante';

export type EsitoMezzi =
  | { ok: true; calcolo: CalcoloMezzi }
  /** `riga` e' l'indice (da zero) del bene che non regge; null se l'errore non e' di una riga */
  | { ok: false; error: ErroreMezzi; riga: number | null };

const fallito = (error: ErroreMezzi, riga: number | null = null): EsitoMezzi => ({ ok: false, error, riga });

/** Il codice scritto e' quello di un venditore della configurazione, com'e' scritto: niente maiuscole, niente spazi */
function venditoreScelto(venditori: Venditore[], scelto: unknown): Venditore | null {
  return typeof scelto === 'string' ? venditori.find((v) => v.codice === scelto) ?? null : null;
}

/**
 * L'anticipo del leasing: un intero fra 0 e ANTICIPO_MAX_MEZZI, come numero o come
 * stringa di sole cifre. Assente o null = quello della configurazione. Tutto il
 * resto ("20%", "1.000", 45, -1, 20.5) e' null: l'errore lo dice il chiamante.
 */
function leggiAnticipo(v: unknown, predefinito: number): number | null {
  if (v === undefined || v === null) return predefinito;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= ANTICIPO_MAX_MEZZI ? n : null;
}

/**
 * Il calcolo senza database: ricerca gia' letta e visibile (o null in simulazione),
 * carrozzeria con la sua configurazione, corpo della richiesta. `oggi` decide gli
 * anni di attivita' e il semaforo, e serve ai test.
 *
 * Senza configurazione mezzi o senza canali la risposta e' configurazione_mancante:
 * non si ripiega mai sul listino di sempre ne' su un altro venditore.
 */
export function componiMezzi(
  ricerca: RicercaSalvata | null,
  k: Carrozzeria,
  corpo: Record<string, unknown>,
  oggi: Date = new Date(),
): EsitoMezzi {
  const mezzi = k.mezzi;
  const canali = k.canali;
  if (!mezzi || !canali) return fallito('configurazione_mancante');

  const v = validaBeni(mezzi.categorie, corpo.beni);
  if (!v.ok) return fallito(v.error, v.riga);

  // Senza venditore scelto firma quello della categoria del primo bene. La categoria
  // e' gia' validata: venditoreDiCategoria ripiega sul default solo per le sconosciute
  const senzaScelta = corpo.venditore === undefined || corpo.venditore === null;
  const venditore = senzaScelta
    ? venditoreDiCategoria(mezzi, v.beni[0].categoria)
    : venditoreScelto(mezzi.venditori, corpo.venditore);
  if (!venditore) return fallito(senzaScelta ? 'configurazione_mancante' : 'venditore_non_valido');

  const anticipoPerc = leggiAnticipo(corpo.anticipoPerc, mezzi.leasing.anticipoPerc);
  if (anticipoPerc === null) return fallito('anticipo_non_valido');

  // Il cliente come lo vede l'instradamento: dalla ricerca salvata, mai dal browser.
  // In simulazione e' sconosciuto, e un dato che manca non soddisfa mai una condizione
  const dati = ricerca?.dati_credito.dati;
  const noleggio = instrada(
    canali,
    {
      formaCodice: dati?.formaCodice ?? null,
      inizioAttivita: dati?.inizioAttivita ?? null,
      fatturato: dati?.fatturato ?? null,
      atecoCodice: dati?.atecoCodice ?? null,
    },
    v.totale,
    oggi,
    { venditore: venditore.codice, categorie: v.categorie, targato: v.targato },
  );

  // I criteri del locatore informano e non toccano i numeri: col rosso noleggio e leasing escono lo stesso
  const valutazione = ricerca
    ? valuta(k, ricerca.dati_credito.dati, v.totale, ricerca.eventi?.stato ?? 'non-avviata', oggi)
    : null;

  return {
    ok: true,
    calcolo: {
      ricerca,
      beni: v.beni,
      totale: v.totale,
      venditore,
      anticipoPerc,
      valutazione,
      noleggio,
      motivoNoNoleggio: noleggio ? null : v.targato ? TESTO_TARGATO : TESTO_NOLEGGIO_NON_DISPONIBILE,
      leasing: leasingConfronto(mezzi.leasing, v.totale, anticipoPerc),
    },
  };
}

/**
 * Il calcolo completo della proposta, condiviso con preventivo e pratica. La ricerca
 * e' obbligatoria: non visibile all'utente = 404 ricerca_non_trovata, come sugli altri
 * settori. Un corpo che non regge: 400 con l'errore e l'indice del bene.
 */
export async function calcolaMezzi(
  e: Sessione,
  corpo: Record<string, unknown>,
  oggi: Date = new Date(),
): Promise<{ ok: true; calcolo: CalcoloMezzi } | { ok: false; risposta: Response }> {
  const letta = await ricercaVisibile(e, String(corpo.ricercaId ?? ''));
  if (!letta) return { ok: false, risposta: json({ ok: false, error: 'ricerca_non_trovata' }, 404) };
  const ricerca = await completaRicerca(letta);

  const esito = componiMezzi(ricerca, e.carrozzeria, corpo, oggi);
  if (!esito.ok) return { ok: false, risposta: json({ ok: false, error: esito.error, riga: esito.riga }, 400) };
  return esito;
}

/**
 * La simulazione prima della verifica: un bene solo, descritto da importo, categoria
 * e targa, e un cliente che non si conosce. Econocom chiede un fatturato che qui non
 * c'e', quindi non regge mai; quota Grenke dove il venditore e la categoria lo
 * ammettono. Nessun semaforo, nessuna ricerca, niente da salvare.
 *
 * Il corpo e' { importo, categoria, targato, venditore? }. Gli errori sono quelli dei
 * beni, ma senza indice di riga: il bene e' uno solo e "riga 0" non direbbe niente. Un
 * importo che non si legge e' importo_non_valido, il nome del campo che l'agente ha scritto.
 */
export function simulaMezzi(k: Carrozzeria, corpo: Record<string, unknown>, oggi?: Date): EsitoMezzi {
  const esito = componiMezzi(
    null,
    k,
    {
      beni: [{
        descrizione: DESCRIZIONE_SIMULAZIONE,
        categoria: corpo.categoria,
        quantita: 1,
        prezzo: corpo.importo,
        targato: corpo.targato,
      }],
      venditore: corpo.venditore,
    },
    oggi,
  );
  if (esito.ok) return esito;
  return fallito(esito.error === 'prezzo_non_valido' ? 'importo_non_valido' : esito.error);
}

/** Le colonne del leasing hanno una lettera: A, B, C nell'ordine della configurazione */
export function chiaveColonna(i: number): string {
  return String.fromCharCode(65 + i);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface RigaLeasingSchermo {
  durata: number;
  rata: number;
  numRate: number;
  anticipo: number;
  anticipoPerc: number;
  riscatto: number;
  riscattoPerc: number;
  /** Null se i nomi dei partner sono spenti: la cifra da sola direbbe chi c'e' dietro */
  speseIstruttoria: number | null;
  /** Come speseIstruttoria: per ogni rata, null con i nomi spenti */
  speseIncassoRata: number | null;
  /** Istruttoria piu' incasso su tutte le rate: sempre presente */
  spese: number;
  totale: number;
}

export interface MezziSchermo {
  semaforo: ReturnType<typeof semaforoPerSchermo> | null;
  beni: BeneMezzo[];
  totale: number;
  venditore: { codice: string; ragioneSociale: string };
  anticipoPerc: number;
  noleggio: { rate: RataDurata[]; durataEvidenza: number | null; nota: string | null; daConfermare: boolean } | null;
  motivoNoNoleggio: string | null;
  leasing: { chiave: string; nome: string | null; motivo: string | null; righe: RigaLeasingSchermo[] }[];
}

/**
 * Quello che della proposta va a schermo, per ogni ruolo. Del noleggio passa solo
 * vistaCommerciale(): rate, nota e se la rata e' da confermare. Mai canale,
 * imponibile ne' nome di un locatore. Del venditore codice e ragione sociale, non
 * P.IVA e recapiti (stanno nei documenti). Del leasing la colonna ha sempre una
 * lettera e mai la chiave del partner; con `mostraNomi` falso non ha nome ne' le
 * spese per voce, che da sole direbbero chi c'e' dietro. Ogni campo e' copiato a mano:
 * un campo nuovo del calcolo non esce da solo.
 */
export function mezziPerSchermo(c: CalcoloMezzi, mostraNomi: boolean): MezziSchermo {
  const vista = c.noleggio ? vistaCommerciale(c.noleggio) : null;
  const durataEvidenza = vista
    ? vista.rate.some((r) => r.durata === DURATA_EVIDENZA)
      ? DURATA_EVIDENZA
      : vista.rate.at(-1)?.durata ?? null
    : null;

  return {
    semaforo: c.valutazione ? semaforoPerSchermo(c.valutazione) : null,
    beni: c.beni.map((b) => ({ ...b })),
    totale: c.totale,
    venditore: { codice: c.venditore.codice, ragioneSociale: c.venditore.ragioneSociale },
    anticipoPerc: c.anticipoPerc,
    noleggio: vista ? { rate: vista.rate, durataEvidenza, nota: vista.nota, daConfermare: vista.daConfermare } : null,
    motivoNoNoleggio: c.motivoNoNoleggio,
    leasing: c.leasing.map((colonna, i) => ({
      chiave: chiaveColonna(i),
      nome: mostraNomi ? colonna.nome : null,
      motivo: colonna.motivo,
      righe: colonna.righe.map((r) => ({
        durata: r.durata,
        rata: r.rata,
        numRate: r.numRate,
        anticipo: r.anticipo,
        anticipoPerc: r.anticipoPerc,
        riscatto: r.riscatto,
        riscattoPerc: r.riscattoPerc,
        speseIstruttoria: mostraNomi ? r.speseIstruttoria : null,
        speseIncassoRata: mostraNomi ? r.speseIncassoRata : null,
        spese: r2(r.speseIstruttoria + r.speseIncassoRata * r.numRate),
        totale: r.totale,
      })),
    })),
  };
}
