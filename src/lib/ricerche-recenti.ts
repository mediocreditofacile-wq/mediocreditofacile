// Ricerche degli ultimi 30 giorni per la pagina iniziale di /tools/valutazione.
// SERVER-ONLY: legge lo store Blob privato.
//
// Non c'e' un registro delle ricerche: l'elenco E' la cache. Una scheda italiana
// sta in openapi/aziende/<piva>.json e la scrive solo /api/azienda, cioe' questo
// strumento; una controparte estera sta in openapi/estero/<PAESE>-<id>.json, ma
// quella cartella la scrive anche il tool Marotta. La data di ogni voce e' quella
// del blob, quindi del giorno in cui la scheda e' stata pagata: riaprirla dalla
// cache non la riscrive e non la riporta in cima. Dopo 30 giorni il blob resta
// sullo store ma la cache lo ignora, e qui sparisce dall'elenco.
//
// Nessuna chiamata a Openapi: aprire una voce dell'elenco non costa niente.

import { list, get } from '@vercel/blob';
import { blobToken, chiaveEstera, TTL_CACHE, TTL_RICERCA } from './openapi';

export const PER_PAGINA = 10;

const RE_ITALIA = /^openapi\/aziende\/(\d{11})\.json$/;
const RE_ESTERO = /^openapi\/estero\/([A-Z]{2})-([A-Za-z0-9]+)\.json$/;

// Gli esempi cliccabili in cima al tool Marotta (setDemoEstero in
// public/tools/marotta/index.html): soggetti veri tenuti in cache apposta, che
// in un elenco di ricerche sarebbero solo rumore. Se cambiano li', vanno cambiati qui.
const DEMO_ESTERI: [string, string][] = [
  ['FR', '447635830'],           // Les Bufflonnes du Sud
  ['DE', 'DE129274202'],         // Siemens
  ['ES', 'A39000013'],           // Banco Santander
  ['BR', '33.592.510/0001-54'],  // Vale
];
const PERCORSI_DEMO = new Set(DEMO_ESTERI.map(([p, id]) => chiaveEstera(p, id)));

export interface BlobCache {
  pathname: string;
  uploadedAt: Date | string;
}

export interface RicercaRecente {
  tipo: 'italia' | 'estero';
  /** 'IT' per le italiane: e' il valore da rimettere nel menu paese */
  paese: string;
  /** P.IVA o identificativo da rimettere nel campo di ricerca */
  id: string;
  ragioneSociale: string | null;
  /** "Farra di Soligo (TV)"; null sull'estero, dove basta il paese */
  sede: string | null;
  /** Classe A1-C3; sull'estero non esiste */
  rating: string | null;
  analizzata: string;
  /** Fine della cache: oltre questa data riaprire la scheda torna a costare */
  scade: string;
}

export interface PaginaRicerche {
  totale: number;
  pagina: number;
  pagine: number;
  perPagina: number;
  voci: RicercaRecente[];
}

const ms = (d: Date | string) => new Date(d).getTime();

/**
 * Tiene i blob ancora in cache, toglie le demo, ordina dal piu' recente e
 * restituisce la pagina chiesta. Una pagina oltre l'ultima diventa l'ultima:
 * succede quando una scheda scade mentre la pagina e' aperta.
 */
export function selezionaRecenti<T extends BlobCache>(blobs: T[], ora: number, pagina: number, perPagina = PER_PAGINA) {
  const vivi = blobs
    .filter((b) => {
      if (RE_ITALIA.test(b.pathname)) return ora - ms(b.uploadedAt) <= TTL_CACHE;
      if (RE_ESTERO.test(b.pathname)) return !PERCORSI_DEMO.has(b.pathname) && ora - ms(b.uploadedAt) <= TTL_RICERCA;
      return false;
    })
    .sort((a, b) => ms(b.uploadedAt) - ms(a.uploadedAt));
  const pagine = Math.max(1, Math.ceil(vivi.length / perPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), pagine);
  return { totale: vivi.length, pagina: p, pagine, perPagina, voci: vivi.slice((p - 1) * perPagina, p * perPagina) };
}

// I comuni arrivano in maiuscolo: "FARRA DI SOLIGO" diventa "Farra di Soligo"
const MINUSCOLE = new Set(['di', 'del', 'dei', 'della', 'delle', 'dello', 'degli', 'de', 'da', 'in', 'sul', 'sulla', 'al', 'alla', 'e', 'ed']);
export function nomeComune(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (i > 0 && MINUSCOLE.has(w)) return w;
      const n = w.replace(/(^|['-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase());
      // preposizioni elise: Cassano d'Adda, Reggio nell'Emilia
      return i > 0 && /^(D|Nell|Dell|All|Sull)'/.test(n) ? n[0].toLowerCase() + n.slice(1) : n;
    })
    .join(' ');
}

/** Riga dell'elenco da una scheda italiana (la stessa che rende la pagina). */
export function sintesiItaliana(s: any, b: BlobCache): RicercaRecente {
  const F = s?.full ?? {}, A = s?.advanced ?? {};
  // stessa precedenza di rendiScheda: la provincia e' una sigla sotto registeredOffice
  // e un oggetto {code, description} nell'indirizzo piatto
  const sede = F.address?.registeredOffice ?? A.address?.registeredOffice ?? F.address ?? {};
  const prov = typeof sede.province === 'object' ? sede.province?.code : sede.province;
  const comune = sede.town ? nomeComune(String(sede.town)) : '';
  return {
    tipo: 'italia',
    paese: 'IT',
    id: String(s?.piva ?? RE_ITALIA.exec(b.pathname)?.[1] ?? ''),
    ragioneSociale: F.companyDetails?.companyName ?? A.companyName ?? null,
    sede: comune ? (prov ? `${comune} (${prov})` : comune) : null,
    rating: s?.score?.rating ?? null,
    ...finestraCache(b),
  };
}

/** Riga dell'elenco da una controparte estera: l'identificativo e' quello digitato. */
export function sintesiEstera(r: any, b: BlobCache): RicercaRecente {
  const m = RE_ESTERO.exec(b.pathname);
  return {
    tipo: 'estero',
    paese: String(r?.paese ?? m?.[1] ?? ''),
    id: String(r?.identificativo ?? m?.[2] ?? ''),
    ragioneSociale: r?.ragioneSociale ?? null,
    sede: null,
    rating: null,
    ...finestraCache(b),
  };
}

function finestraCache(b: BlobCache) {
  const t = ms(b.uploadedAt);
  const ttl = RE_ITALIA.test(b.pathname) ? TTL_CACHE : TTL_RICERCA;
  return { analizzata: new Date(t).toISOString(), scade: new Date(t + ttl).toISOString() };
}

async function elenca(prefix: string) {
  const tutti: BlobCache[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, limit: 1000, cursor, token: blobToken() });
    tutti.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return tutti;
}

async function leggi(pathname: string): Promise<any | null> {
  try {
    const b = await get(pathname, { access: 'private', token: blobToken() });
    return b?.stream ? JSON.parse(await new Response(b.stream).text()) : null;
  } catch {
    return null;
  }
}

/** Una pagina dell'elenco. Si leggono solo le schede di quella pagina. */
export async function ricercheRecenti(pagina: number, ora = Date.now()): Promise<PaginaRicerche> {
  const [it, est] = await Promise.all([elenca('openapi/aziende/'), elenca('openapi/estero/')]);
  const sel = selezionaRecenti([...it, ...est], ora, pagina);
  // una scheda illeggibile resta in elenco con i dati del percorso: si apre lo stesso
  const voci = await Promise.all(sel.voci.map(async (b) => {
    const dati = await leggi(b.pathname);
    return RE_ITALIA.test(b.pathname) ? sintesiItaliana(dati, b) : sintesiEstera(dati, b);
  }));
  return { ...sel, voci };
}
