// La distinta di una proposta di vendita (settore "distinta", oggi Led Office): le
// righe che il commerciale compone, ricontrollate contro il catalogo del fornitore.
// Spec mcf_spec-ledoffice-motore_v1, paragrafo 7.
//
// Modulo puro: niente database, niente rete. Lo importano il server, che non si
// fida del browser, e il browser, che mostra righe e totali mentre si scrive.
//
// Due tipi di riga. Di listino: { codice, quantita, prezzo? }; descrizione e categoria
// vengono dalla voce del catalogo, quello che manda il browser non conta, e senza
// prezzo vale il listino. Fuori listino: { descrizione, categoria, quantita, prezzo },
// senza codice; MCF la vede marcata come tale.
//
// Il prefiltro ignora in silenzio le righe di una categoria che non conosce, quindi
// qui una categoria sconosciuta ferma la distinta (fail closed), anche quando a
// portarla e' una voce del catalogo scritta male.

import type { VoceCatalogo } from './carrozzeria';
import { numero, testo } from './catalogo-import';
import type { Categoria } from './config-distinta';

export const MAX_RIGHE = 60;
export const MAX_QUANTITA = 10_000;
/** Un totale (di riga o di distinta) oltre questo valore non passa; esattamente questo si */
export const MAX_TOTALE = 10_000_000;
const MAX_DESCRIZIONE = 200;
const FUSO = 'Europe/Rome';

export interface RigaDistinta {
  /** Null sulle righe fuori listino */
  codice: string | null;
  descrizione: string;
  categoria: string;
  quantita: number;
  /** Unitario, arrotondato al centesimo: quello trattato col cliente */
  prezzo: number;
  /** Il prezzo del catalogo, accanto a quello trattato. Null fuori listino */
  listino: number | null;
  fuoriListino: boolean;
  /** Voce con valido_fino passato: proponibile, ma "prezzo da riconfermare" */
  scaduta: boolean;
  /** Prezzo per quantita', arrotondato al centesimo */
  totale: number;
}

export interface Distinta {
  righe: RigaDistinta[];
  totale: number;
  /** Somma delle quantita' delle righe di categorie con postazione */
  postazioni: number;
  /** C'e' almeno una riga di una categoria LEDwall: serve la spunta sull'installazione */
  conLedwall: boolean;
}

export type ErroreDistinta =
  | 'distinta_vuota'
  | 'troppe_righe'
  | 'voce_non_trovata'
  | 'quantita_non_valida'
  | 'prezzo_non_valido'
  | 'categoria_non_valida'
  | 'descrizione_mancante'
  | 'importo_non_valido';

export type EsitoDistinta =
  | { ok: true; distinta: Distinta }
  /** `riga` e' l'indice (da zero) della riga che non regge; null se l'errore e' di tutta la distinta */
  | { ok: false; error: ErroreDistinta; riga: number | null };

// --- importi ----------------------------------------------------------------

// toPrecision(15) toglie il rumore dei decimali binari prima di arrotondare: senza,
// 1,005 per 100 fa 100,49999999999999 e il mezzo centesimo andrebbe per difetto.
const centesimi = (v: number) => Math.round(Number((v * 100).toPrecision(15)));

/**
 * Il totale di una distinta: prezzo per quantita' di ogni riga, arrotondato al
 * centesimo, poi la somma di quei totali. Non la somma dei prezzi esatti: il
 * cliente legge sulla proposta i totali di riga e deve ritrovare la loro somma.
 */
export function totaleRighe(righe: { quantita: number; prezzo: number }[]): number {
  return righe.reduce((somma, r) => somma + centesimi(r.prezzo * r.quantita), 0) / 100;
}

/** Il giorno AAAA-MM-GG in ora italiana: e' quello che conta per scadenze e date di nascita */
export function giornoItaliano(quando: Date): string {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(quando);
  const v = (tipo: string) => parti.find((p) => p.type === tipo)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

// --- lettura di una riga ----------------------------------------------------

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Assente: non mandato, null o testo vuoto */
const assente = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Una stringa col punto come separatore delle migliaia e nessuna virgola ("1.500",
 * "1.000"). numero() la legge all'inglese (1,5 e 1) e il valore resterebbe mille volte
 * sotto quello che chi scrive intendeva: nel dubbio la riga non passa. I numeri veri
 * (typeof number) e le stringhe con la virgola ("1.799,50") non sono ambigui.
 */
const migliaiaAmbigue = (v: unknown) =>
  typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(v.replace(/[€\s]/g, ''));

function leggiQuantita(v: unknown): number | null {
  if (migliaiaAmbigue(v)) return null;
  const n = numero(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITA ? n : null;
}

/** Il prezzo unitario al centesimo, oppure null se non si legge o non e' maggiore di zero */
function leggiPrezzo(v: unknown): number | null {
  if (migliaiaAmbigue(v)) return null;
  const n = numero(v);
  if (!Number.isFinite(n)) return null;
  const p = centesimi(n) / 100;
  return p > 0 ? p : null;
}

/**
 * Una validita' assente non scade. Una validita' che non e' una data AAAA-MM-GG si
 * tratta come scaduta: l'avviso "da riconfermare" costa poco, un prezzo vecchio no.
 * Scade il giorno dopo valido_fino, non quello stesso.
 */
function eScaduta(validoFino: unknown, oggi: string): boolean {
  if (assente(validoFino)) return false;
  if (typeof validoFino !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(validoFino)) return true;
  return validoFino < oggi;
}

type Letta = { ok: true; riga: RigaDistinta } | { ok: false; error: ErroreDistinta };
const no = (error: ErroreDistinta): Letta => ({ ok: false, error });

function leggiRiga(grezza: unknown, voci: VoceCatalogo[], categorie: Categoria[], oggi: string): Letta {
  const r = oggetto(grezza);
  // Con un codice (anche vuoto o storto) la riga e' di listino e il codice deve esistere:
  // una riga fuori listino e' quella senza codice, mai quella con un codice che non torna.
  const diListino = r.codice !== undefined && r.codice !== null;

  let codice: string | null = null;
  let descrizione: string;
  let nomeCategoria: unknown;
  let listino: number | null = null;
  let scaduta = false;

  if (diListino) {
    const cercato = typeof r.codice === 'string' ? r.codice.trim().toUpperCase() : null;
    const voce = voci.find((v) => v.attivo && v.codice === cercato);
    if (!voce) return no('voce_non_trovata');
    codice = voce.codice;
    descrizione = testo(voce.nome, MAX_DESCRIZIONE);
    nomeCategoria = voce.attributi.categoria;
    listino = voce.prezzo;
    scaduta = eScaduta(voce.attributi.valido_fino, oggi);
  } else {
    descrizione = typeof r.descrizione === 'string' ? testo(r.descrizione, MAX_DESCRIZIONE) : '';
    if (!descrizione) return no('descrizione_mancante');
    nomeCategoria = r.categoria;
  }

  const categoria = typeof nomeCategoria === 'string' ? categorie.find((c) => c.nome === nomeCategoria) : undefined;
  if (!categoria) return no('categoria_non_valida');

  const quantita = leggiQuantita(r.quantita);
  if (quantita === null) return no('quantita_non_valida');

  // Senza prezzo una riga di listino vale il listino; una riga fuori listino non ha a cosa ripiegare
  const prezzo = leggiPrezzo(diListino && assente(r.prezzo) ? listino : r.prezzo);
  if (prezzo === null) return no('prezzo_non_valido');

  return {
    ok: true,
    riga: {
      codice,
      descrizione,
      categoria: categoria.nome,
      quantita,
      prezzo,
      listino,
      fuoriListino: !diListino,
      scaduta,
      totale: centesimi(prezzo * quantita) / 100,
    },
  };
}

// --- la distinta ------------------------------------------------------------

/**
 * Ricontrolla la distinta che arriva dal browser contro il catalogo e le categorie
 * del fornitore. Si ferma alla prima riga che non regge e dice quale. Una voce
 * spenta vale come non trovata; una voce scaduta si propone, con `scaduta`.
 * `oggi` serve a decidere le scadenze (in ora italiana) e ai test.
 */
export function validaDistinta(
  voci: VoceCatalogo[],
  categorie: Categoria[],
  grezze: unknown,
  oggi: Date = new Date(),
): EsitoDistinta {
  const fallito = (error: ErroreDistinta, riga: number | null = null): EsitoDistinta => ({ ok: false, error, riga });
  if (!Array.isArray(grezze) || grezze.length === 0) return fallito('distinta_vuota');
  if (grezze.length > MAX_RIGHE) return fallito('troppe_righe');

  const giorno = giornoItaliano(oggi);
  const righe: RigaDistinta[] = [];
  for (let i = 0; i < grezze.length; i++) {
    const letta = leggiRiga(grezze[i], voci, categorie, giorno);
    if (!letta.ok) return fallito(letta.error, i);
    if (letta.riga.totale > MAX_TOTALE) return fallito('importo_non_valido', i);
    righe.push(letta.riga);
  }

  const totale = totaleRighe(righe);
  if (totale > MAX_TOTALE) return fallito('importo_non_valido');

  // Le categorie delle righe sono gia' state trovate fra quelle del fornitore
  const dellaRiga = (r: RigaDistinta) => categorie.find((c) => c.nome === r.categoria);
  const postazioni = righe.reduce((n, r) => n + (dellaRiga(r)?.postazione ? r.quantita : 0), 0);
  const conLedwall = righe.some((r) => dellaRiga(r)?.ledwall === true);
  return { ok: true, distinta: { righe, totale, postazioni, conLedwall } };
}
