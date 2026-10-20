// La proposta di distinta, sul settore "distinta" (oggi Led Office): la distinta del
// commerciale, il prefiltro e l'instradamento fra i canali, in un calcolo solo.
// Spec mcf_spec-ledoffice-motore_v1, paragrafi 6 e 7.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database e, tramite l'instradamento, i
// coefficienti dei locatori.
//
// Lo usano lo schermo (/api/motore/proposte) e, dopo, il preventivo e la pratica:
// rate, PDF e pratica escono dallo stesso calcolo. Il CalcoloDistinta contiene anche
// canale, beni, maggiorazione e imponibile dell'instradamento, che sono solo di MCF:
// verso referente e agente esce soltanto distintaPerSchermo(), che li fa passare da
// vistaCommerciale().
//
// Dal browser arrivano la ricerca, le righe, la consegna, le motivazioni, la spunta
// del LEDwall e, facoltativi, i dati per la proposta di vendita. Il server ricontrolla
// tutto: le righe sul catalogo e sulle categorie della carrozzeria, la consegna sugli
// indirizzi della scheda, i numeri del cliente sulla ricerca salvata. Il browser si
// aggira.

import { catalogo, type Carrozzeria, type VoceCatalogo } from './carrozzeria';
import type { Categoria } from './config-distinta';
import { ricercaVisibile, type RicercaSalvata } from './calcolo-proposta';
import { leggiDatiVendita, type DatiVendita } from './dati-vendita';
import { validaDistinta, type Distinta, type ErroreDistinta, type RigaDistinta } from './distinta';
import { DURATA_EVIDENZA, instrada, vistaCommerciale, type Instradamento, type RataDurata } from './instradamento';
import type { SchedaRidotta } from './merito';
import {
  datiPrefiltro,
  valutaPrefiltro,
  type DistintaPrefiltro,
  type EsitoPrefiltro,
  type SegnaliPrefiltro,
} from './prefiltro';
import { json, type EsitoMotore } from './sessione';
import { prefiltroPerSchermo } from './valutazione';

type Sessione = Extract<EsitoMotore, { ok: true }>;

export interface Consegna {
  tipo: 'sede' | 'unita' | 'altro';
  indirizzo: string;
}

export interface CalcoloDistinta {
  ricerca: RicercaSalvata;
  distinta: Distinta;
  consegna: Consegna;
  /** Le sole motivazioni che il prefiltro chiede, come le ha scritte il commerciale */
  motivazioni: Record<string, string>;
  ledwallConfermato: boolean;
  prefiltro: EsitoPrefiltro;
  /** Null se il prefiltro blocca la proposta o se nessun canale regge. Canale e importi: solo MCF */
  instradamento: Instradamento | null;
  /** Null finche' i dati per la proposta di vendita non sono completi */
  datiVendita: DatiVendita | null;
  /** Le chiavi di leggiDatiVendita che mancano per le due proposte. Vuoto se completi */
  venditaMancanti: string[];
}

/** Perche' la rata non esce, nell'ordine in cui lo si dice al commerciale */
export type MotivoBlocco = 'bloccato' | 'rosso' | 'motivazioni' | 'ledwall' | 'nessun_canale';

const MAX_INDIRIZZO = 200;
const MAX_MOTIVAZIONE = 1000;
/** Le chiavi delle motivazioni del prefiltro: le altre non si leggono nemmeno */
const CHIAVE_MOTIVAZIONE = /^(perdita|addetti|riga-\d{1,3})$/;

const SENZA_SEGNALI: SegnaliPrefiltro = { segnalato: null, praticaRecente: null };

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Spazi ripuliti, cosi' come si scrive l'indirizzo */
const spazi = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Per il confronto: spazi ripuliti e maiuscole */
const confrontabile = (s: string) => spazi(s).toUpperCase();

/**
 * Dove si consegna. Decide l'indirizzo, non il tipo che dichiara il browser: e' sede
 * se coincide con la sede legale della scheda, unita' se coincide con una delle unita'
 * locali, altrimenti e' un altro indirizzo (regola 8 del prefiltro). Il confronto non
 * guarda maiuscole e spazi; sede e unita' tornano scritte come nella scheda. Le
 * ricerche salvate prima del 20/10/2026 non hanno le unita' locali: lista vuota.
 */
export function consegnaDa(scheda: Pick<SchedaRidotta, 'sede' | 'unitaLocali'>, grezza: unknown): Consegna {
  const o = oggetto(grezza);
  const indirizzo = typeof o.indirizzo === 'string' ? spazi(o.indirizzo).slice(0, MAX_INDIRIZZO) : '';
  if (!indirizzo) return { tipo: 'altro', indirizzo: '' };
  const cercato = confrontabile(indirizzo);
  if (scheda.sede && confrontabile(scheda.sede) === cercato) return { tipo: 'sede', indirizzo: scheda.sede };
  const unita = (scheda.unitaLocali ?? []).find((u) => confrontabile(u) === cercato);
  if (unita) return { tipo: 'unita', indirizzo: unita };
  return { tipo: 'altro', indirizzo };
}

/** Le motivazioni scritte, solo sulle chiavi del prefiltro e solo se sono testo non vuoto */
function leggiMotivazioni(v: unknown): Record<string, string> {
  const lette: Record<string, string> = {};
  for (const [chiave, testo] of Object.entries(oggetto(v))) {
    if (!CHIAVE_MOTIVAZIONE.test(chiave) || typeof testo !== 'string') continue;
    const pulito = testo.trim().slice(0, MAX_MOTIVAZIONE);
    if (pulito) lette[chiave] = pulito;
  }
  return lette;
}

export type EsitoComposizione =
  | { ok: true; calcolo: CalcoloDistinta }
  | { ok: false; error: ErroreDistinta; riga: number | null };

/**
 * Il calcolo senza database: ricerca gia' letta e visibile, voci del catalogo,
 * categorie e canali della carrozzeria. `oggi` decide scadenze, anni di attivita' e
 * data di nascita, e serve ai test.
 */
export function componiCalcolo(
  ricerca: RicercaSalvata,
  k: Pick<Carrozzeria, 'categorie' | 'canali'>,
  voci: VoceCatalogo[],
  corpo: Record<string, unknown>,
  oggi: Date = new Date(),
): EsitoComposizione {
  const categorie = k.categorie ?? [];
  const v = validaDistinta(voci, categorie, corpo.righe, oggi);
  if (!v.ok) return { ok: false, error: v.error, riga: v.riga };
  const { distinta } = v;

  const { dati, scheda } = ricerca.dati_credito;
  const consegna = consegnaDa(scheda, corpo.consegna);
  const scritte = leggiMotivazioni(corpo.motivazioni);
  const ledwallConfermato = corpo.ledwallConfermato === true;

  // Eventi e segnali sono quelli salvati sulla ricerca: li aggiornano la verifica e
  // la sua riapertura (/api/motore/merito), non il conto della proposta
  const perPrefiltro: DistintaPrefiltro = {
    righe: distinta.righe.map((r) => ({ categoria: r.categoria, quantita: r.quantita })),
    consegna: consegna.tipo,
    ledwallConfermato,
    motivazioni: scritte,
  };
  const prefiltro = valutaPrefiltro(
    datiPrefiltro(dati),
    ricerca.segnali ?? SENZA_SEGNALI,
    ricerca.eventi?.stato ?? 'non-avviata',
    categorie,
    perPrefiltro,
    oggi,
  );

  // Il canale si cerca solo se la proposta puo' uscire, e solo fra i canali della
  // carrozzeria: senza canali non c'e' rata, mai un ripiego sul listino di sempre
  const instradamento = !prefiltro.bloccaProposta && k.canali && k.canali.length > 0
    ? instrada(
        k.canali,
        {
          formaCodice: dati.formaCodice ?? null,
          inizioAttivita: dati.inizioAttivita ?? null,
          fatturato: dati.fatturato ?? null,
          atecoCodice: dati.atecoCodice ?? null,
        },
        distinta.totale,
        oggi,
      )
    : null;

  // Si tengono solo le motivazioni che il prefiltro chiede: le altre non vanno ne'
  // nel preventivo ne' nella mail a MCF
  const motivazioni: Record<string, string> = {};
  for (const m of prefiltro.motivazioniRichieste) if (scritte[m.chiave]) motivazioni[m.chiave] = scritte[m.chiave];

  const vendita = leggiDatiVendita(corpo.vendita, oggi);

  return {
    ok: true,
    calcolo: {
      ricerca,
      distinta,
      consegna,
      motivazioni,
      ledwallConfermato,
      prefiltro,
      instradamento,
      datiVendita: vendita.ok ? vendita.dati : null,
      venditaMancanti: vendita.ok ? [] : vendita.mancanti,
    },
  };
}

/**
 * Il prefiltro della stessa distinta con altri segnali: stessi dati del cliente, stessi
 * eventi, stesse righe, consegna, spunta e motivazioni del calcolo; cambia solo cio' che
 * MCF ha scritto nel frattempo. Lo usa il preventivo, che rilegge il cliente segnalato
 * prima di generare i PDF.
 */
export function prefiltroConSegnali(
  c: CalcoloDistinta,
  categorie: Categoria[],
  segnali: SegnaliPrefiltro,
  oggi: Date = new Date(),
): EsitoPrefiltro {
  return valutaPrefiltro(
    datiPrefiltro(c.ricerca.dati_credito.dati),
    segnali,
    c.ricerca.eventi?.stato ?? 'non-avviata',
    categorie,
    {
      righe: c.distinta.righe.map((r) => ({ categoria: r.categoria, quantita: r.quantita })),
      consegna: c.consegna.tipo,
      ledwallConfermato: c.ledwallConfermato,
      motivazioni: c.motivazioni,
    },
    oggi,
  );
}

/**
 * Il calcolo completo della proposta di distinta, condiviso con preventivo e pratica.
 * Ricerca non visibile all'utente: 404 ricerca_non_trovata, come sugli altri settori.
 * Distinta che non regge: 400 con l'errore e l'indice della riga.
 */
export async function calcolaDistinta(
  e: Sessione,
  corpo: Record<string, unknown>,
  oggi: Date = new Date(),
): Promise<{ ok: true; calcolo: CalcoloDistinta } | { ok: false; risposta: Response }> {
  const ricerca = await ricercaVisibile(e, String(corpo.ricercaId ?? ''));
  if (!ricerca) return { ok: false, risposta: json({ ok: false, error: 'ricerca_non_trovata' }, 404) };

  const voci = await catalogo(e.carrozzeria.slug);
  const esito = componiCalcolo(ricerca, e.carrozzeria, voci, corpo, oggi);
  if (!esito.ok) return { ok: false, risposta: json({ ok: false, error: esito.error, riga: esito.riga }, 400) };
  return esito;
}

/** Il motivo per cui la rata non esce, oppure null se esce */
function motivoBlocco(c: CalcoloDistinta): MotivoBlocco | null {
  const p = c.prefiltro;
  if (p.semaforo === 'bloccato') return 'bloccato';
  if (p.semaforo === 'rosso') return 'rosso';
  if (p.motivazioniMancanti.length > 0) return 'motivazioni';
  if (p.ledwallMancante) return 'ledwall';
  if (!c.instradamento) return 'nessun_canale';
  return null;
}

/** Una riga come la vede il commerciale: e' la sua distinta, col listino accanto al prezzo trattato */
const rigaPerSchermo = (r: RigaDistinta) => ({
  codice: r.codice,
  descrizione: r.descrizione,
  categoria: r.categoria,
  quantita: r.quantita,
  prezzo: r.prezzo,
  listino: r.listino,
  fuoriListino: r.fuoriListino,
  scaduta: r.scaduta,
  totale: r.totale,
});

export interface DistintaSchermo {
  semaforo: string;
  /** Lo stesso blocco della verifica (prefiltroPerSchermo), con le motivazioni ancora da scrivere */
  prefiltro: ReturnType<typeof prefiltroPerSchermo> & { motivazioniMancanti: string[] };
  bloccata: boolean;
  motivoBlocco: MotivoBlocco | null;
  // Assenti sul cliente bloccato: la scheda dice solo di sentire MCF
  righe?: ReturnType<typeof rigaPerSchermo>[];
  /** Il totale dei beni del commerciale: e' la sua distinta, non l'importo del locatore */
  totaleBeni?: number;
  consegna?: Consegna;
  rate?: RataDurata[];
  durataEvidenza?: number | null;
  daConfermare?: boolean;
  nota?: string | null;
  richiedeProvvisorio?: boolean;
  venditaMancanti?: string[];
}

/**
 * Quello che della proposta di distinta va a schermo, per ogni ruolo. Dell'instradamento
 * passa solo vistaCommerciale(): rate, nota e i due avvisi. Mai canale, maggiorazione,
 * imponibile ne' il nome di un locatore; mai i dati per la proposta di vendita, che il
 * commerciale ha appena scritto e restano sul server.
 */
export function distintaPerSchermo(c: CalcoloDistinta): DistintaSchermo {
  const prefiltro = { ...prefiltroPerSchermo(c.prefiltro), motivazioniMancanti: [...c.prefiltro.motivazioniMancanti] };
  const motivo = motivoBlocco(c);

  // Cliente bloccato: solo il testo fisso, niente distinta, niente rata, niente eventi
  if (motivo === 'bloccato') return { semaforo: c.prefiltro.semaforo, prefiltro, bloccata: true, motivoBlocco: motivo };

  const vista = motivo === null && c.instradamento ? vistaCommerciale(c.instradamento) : null;
  const rate = vista?.rate ?? [];
  const durataEvidenza = rate.some((r) => r.durata === DURATA_EVIDENZA)
    ? DURATA_EVIDENZA
    : rate.length > 0 ? rate[rate.length - 1].durata : null;

  return {
    semaforo: c.prefiltro.semaforo,
    prefiltro,
    bloccata: motivo !== null,
    motivoBlocco: motivo,
    righe: c.distinta.righe.map(rigaPerSchermo),
    totaleBeni: c.distinta.totale,
    consegna: { tipo: c.consegna.tipo, indirizzo: c.consegna.indirizzo },
    rate,
    durataEvidenza,
    daConfermare: vista?.daConfermare ?? false,
    nota: vista?.nota ?? null,
    richiedeProvvisorio: vista?.richiedeProvvisorio ?? false,
    venditaMancanti: [...c.venditaMancanti],
  };
}
