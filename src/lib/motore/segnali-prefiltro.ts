// I segnali che il server legge prima del prefiltro (spec mcf_spec-ledoffice-motore_v1,
// paragrafo 5, regole 3, 9 e 11): il cliente segnalato da MCF e la pratica recente,
// cioe' la stessa partita IVA passata da MCF negli ultimi sei mesi su qualunque
// portale o nello storico importato.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database e lo store Blob privato.
//
// Quello che esce da qui (motivo della segnalazione, data, canale e fornitore della
// pratica) lo vede solo MCF, nella mail della verifica: al commerciale il prefiltro
// passa solo i testi generici. Una fonte che non risponde non ferma la verifica:
// vale come vuota e lascia una riga nei log.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { query } from '../db';
import { pulisciPiva } from '../piva';
import { leggiPratiche } from '../pratiche-nominali';
import type { Carrozzeria } from './carrozzeria';
import type { PraticaTrovata, SegnaliPrefiltro } from './prefiltro';

/** La finestra della regola 9 */
export const MESI_PRATICA_RECENTE = 6;
/** Quanto resta in memoria l'indice delle pratiche dei portali su Blob */
export const VITA_INDICE_PORTALI_MS = 60_000;

/** Le regole che fanno partire la verifica eventi negativi gia' alla ricerca */
export function regoleConEventi(k: Pick<Carrozzeria, 'regoleSemaforo'>): boolean {
  return k.regoleSemaforo === 'locatore' || k.regoleSemaforo === 'prefiltro';
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const due = (n: number) => String(n).padStart(2, '0');

/**
 * Il primo giorno ancora dentro la finestra, sulle date di calendario: oggi meno
 * `mesi` mesi, estremo compreso. Se quel giorno non esiste (31 agosto meno sei
 * mesi) vale l'ultimo del mese, invece di sforare nel mese dopo.
 */
function limiteFinestra(oggi: Date, mesi: number): string {
  const totale = oggi.getFullYear() * 12 + oggi.getMonth() - mesi;
  const anno = Math.floor(totale / 12);
  const mese = totale - anno * 12;
  const ultimo = new Date(anno, mese + 1, 0).getDate();
  return `${anno}-${due(mese + 1)}-${due(Math.min(oggi.getDate(), ultimo))}`;
}

/** La pratica piu' recente dentro la finestra, oppure null. Le date illeggibili non contano. */
export function praticaPiuRecente(
  trovate: PraticaTrovata[],
  oggi: Date = new Date(),
  mesi: number = MESI_PRATICA_RECENTE,
): PraticaTrovata | null {
  const limite = limiteFinestra(oggi, mesi);
  let migliore: PraticaTrovata | null = null;
  for (const p of trovate) {
    if (!DATA.test(p.data) || p.data < limite) continue;
    if (!migliore || p.data > migliore.data) migliore = p;
  }
  return migliore;
}

// --- portali pratiche su Blob ---------------------------------------------------

/** La data italiana di un istante: il record su Blob ha creato in UTC */
const dataItaliana = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
});

function dataRecord(r: Record<string, unknown>): string | null {
  const creato = typeof r.creato === 'string' ? new Date(r.creato) : null;
  if (creato && !Number.isNaN(creato.getTime())) return dataItaliana.format(creato);
  // I record vecchi senza creato: l'id contiene la data (EE-AAAAMMGG-HHMMSS)
  const m = String(r.id ?? '').match(/^[A-Z]{2}-(\d{4})(\d{2})(\d{2})-/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Dai record dei portali pratiche alle pratiche trovate, per partita IVA. Il campo
 * cliente.piva e' "P.IVA / CF" scritto dal partner: un codice fiscale non da' una
 * partita IVA e si scarta. Il canale su quei portali lo sceglie Alberto dopo: ignoto.
 */
export function praticheDaRecord(
  slug: string,
  record: Record<string, unknown>[],
): { piva: string; pratica: PraticaTrovata }[] {
  const fuori: { piva: string; pratica: PraticaTrovata }[] = [];
  for (const r of record) {
    const cliente = (r.cliente ?? null) as { piva?: unknown } | null;
    const piva = pulisciPiva(String(cliente?.piva ?? ''));
    const data = dataRecord(r);
    if (!/^\d{11}$/.test(piva) || !data) continue;
    fuori.push({ piva, pratica: { data, canale: null, fornitore: slug, fonte: 'portale' } });
  }
  return fuori;
}

type IndicePortali = Map<string, PraticaTrovata[]>;
let indice: { creato: number; mappa: IndicePortali } | null = null;
let inVolo: Promise<IndicePortali> | null = null;

/** Per i test: svuota l'indice in memoria */
export function azzeraIndicePortali(): void {
  indice = null;
  inVolo = null;
}

async function costruisciIndice(): Promise<IndicePortali> {
  const slug = Object.keys(PORTALI_PARTNER);
  const letti = await Promise.allSettled(slug.map((s) => leggiPratiche(s)));
  const mappa: IndicePortali = new Map();
  const falliti: string[] = [];
  letti.forEach((esito, i) => {
    if (esito.status === 'rejected') {
      falliti.push(slug[i]);
      return;
    }
    for (const { piva, pratica } of praticheDaRecord(slug[i], esito.value)) {
      mappa.set(piva, [...(mappa.get(piva) ?? []), pratica]);
    }
  });
  if (falliti.length) {
    const msg = letti.find((e) => e.status === 'rejected') as PromiseRejectedResult;
    console.warn(JSON.stringify({ evento: 'motore_segnali_errore', fonte: 'portali', portali: falliti, msg: String(msg.reason) }));
  } else {
    // Un indice letto a meta' non si tiene: la prossima verifica riprova
    indice = { creato: Date.now(), mappa };
  }
  return mappa;
}

/** Le pratiche dei portali per partita IVA, dall'indice in memoria se ha meno di 60 secondi */
async function praticheDeiPortali(piva: string): Promise<PraticaTrovata[]> {
  if (!indice || Date.now() - indice.creato >= VITA_INDICE_PORTALI_MS) {
    // Due verifiche insieme aspettano la stessa lettura dello store
    inVolo ??= costruisciIndice().finally(() => { inVolo = null; });
    return (await inVolo).get(piva) ?? [];
  }
  return indice.mappa.get(piva) ?? [];
}

// --- database ----------------------------------------------------------------------

async function clienteSegnalato(piva: string): Promise<SegnaliPrefiltro['segnalato']> {
  try {
    // La partita IVA si confronta a sole cifre: chi l'ha scritta col prefisso IT resta trovato
    const righe = await query<{ motivo: string; effetto: 'blocco' | 'rosso' }>(
      `SELECT motivo, effetto FROM app.cliente_segnalato WHERE regexp_replace(piva, '\\D', '', 'g') = $1 LIMIT 1`,
      [piva],
    );
    const r = righe[0];
    return r ? { motivo: r.motivo, effetto: r.effetto } : null;
  } catch (err) {
    // Non ferma la verifica, ma un blocco che non si legge non deve passare in silenzio
    console.error(JSON.stringify({ evento: 'motore_segnalato_errore', piva, msg: String(err) }));
    return null;
  }
}

type RigaPratica = { data: string; canale: string | null; fornitore_slug: string | null };

/** La pratica piu' recente di una tabella, gia' con la data in AAAA-MM-GG. Errore = nessuna */
async function ultimaPratica(fonte: 'motore' | 'esterna', sql: string, piva: string): Promise<PraticaTrovata[]> {
  try {
    const righe = await query<RigaPratica>(sql, [piva]);
    return righe.map((r) => ({ data: r.data, canale: r.canale ?? null, fornitore: r.fornitore_slug ?? null, fonte }));
  } catch (err) {
    console.warn(JSON.stringify({ evento: 'motore_segnali_errore', fonte, msg: String(err) }));
    return [];
  }
}

// Le date escono gia' come testo: pg trasformerebbe un date in mezzanotte locale,
// e da li' a toISOString si perde un giorno
const SQL_PRATICA_MOTORE = `
  SELECT to_char(creato AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS data, canale, fornitore_slug
  FROM app.pratica WHERE piva = $1 ORDER BY creato DESC LIMIT 1`;
const SQL_PRATICA_ESTERNA = `
  SELECT to_char(data, 'YYYY-MM-DD') AS data, canale, fornitore_slug
  FROM app.pratica_esterna WHERE regexp_replace(piva, '\\D', '', 'g') = $1 ORDER BY data DESC LIMIT 1`;

/**
 * Cliente segnalato e pratica recente per una partita IVA. Le pratiche del motore
 * contano su ogni carrozzeria, non solo su quella che verifica.
 */
export async function segnaliPrefiltro(pivaGrezza: string): Promise<SegnaliPrefiltro> {
  const piva = pulisciPiva(pivaGrezza);
  const [segnalato, motore, esterna, portali] = await Promise.all([
    clienteSegnalato(piva),
    ultimaPratica('motore', SQL_PRATICA_MOTORE, piva),
    ultimaPratica('esterna', SQL_PRATICA_ESTERNA, piva),
    praticheDeiPortali(piva).catch((err) => {
      console.warn(JSON.stringify({ evento: 'motore_segnali_errore', fonte: 'portali', msg: String(err) }));
      return [] as PraticaTrovata[];
    }),
  ]);
  return { segnalato, praticaRecente: praticaPiuRecente([...motore, ...portali, ...esterna]) };
}

/** I segnali letti si salvano sulla ricerca: il polling degli eventi li rilegge da li' */
export async function salvaSegnali(ricercaId: string, segnali: SegnaliPrefiltro): Promise<void> {
  await query(`UPDATE app.ricerca_merito SET segnali = $2 WHERE id = $1`, [ricercaId, JSON.stringify(segnali)]);
}
