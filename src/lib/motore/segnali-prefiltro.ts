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
// vale come vuota, lascia una riga nei log e chi rilegge tiene il valore salvato.
//
// La pratica recente conta solo se e' nata PRIMA della verifica (decisione del
// controller, Ruling 11): la pratica che il commerciale manda dopo aver verificato
// il cliente non deve accendere la regola 9 sulla sua stessa ricerca. La finestra
// dei sei mesi si conta dalla verifica, non da oggi: riaprendo la ricerca dopo due
// mesi si legge il cliente com'era quel giorno. Il cliente segnalato invece si
// rilegge sempre: MCF puo' segnarlo anche dopo.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { query } from '../db';
import { pulisciPiva } from '../piva';
import { leggiPratiche } from '../pratiche-nominali';
import type { Carrozzeria } from './carrozzeria';
import { giornoItaliano } from './distinta';
import type { PraticaTrovata, SegnaliPrefiltro } from './prefiltro';

/** La finestra della regola 9 */
export const MESI_PRATICA_RECENTE = 6;
/** Quanto resta in memoria l'indice delle pratiche dei portali su Blob */
export const VITA_INDICE_PORTALI_MS = 60_000;

/** Le regole che fanno partire la verifica eventi negativi gia' alla ricerca */
export function regoleConEventi(k: Pick<Carrozzeria, 'regoleSemaforo'>): boolean {
  return k.regoleSemaforo === 'locatore' || k.regoleSemaforo === 'prefiltro';
}

/** I segnali letti, e quali fonti non hanno risposto (valgono vuote) */
export interface LetturaSegnali {
  segnali: SegnaliPrefiltro;
  fallite: { segnalato: boolean; pratiche: boolean };
}

/** Una pratica con l'istante in cui e' nata (ISO), quando lo si conosce */
export interface PraticaDatata {
  pratica: PraticaTrovata;
  creato: string | null;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const due = (n: number) => String(n).padStart(2, '0');

/**
 * Il primo giorno ancora dentro la finestra, sul calendario italiano (le date delle
 * pratiche sono italiane, il server su Vercel gira in UTC): oggi meno `mesi` mesi,
 * estremo compreso. Se quel giorno non esiste (31 agosto meno sei mesi) vale
 * l'ultimo del mese, invece di sforare nel mese dopo.
 */
function limiteFinestra(oggi: Date, mesi: number): string {
  const [a, m, g] = giornoItaliano(oggi).split('-').map(Number);
  const totale = a * 12 + (m - 1) - mesi;
  const anno = Math.floor(totale / 12);
  const mese = totale - anno * 12;
  // Giorni del mese col calendario di Date in UTC: nessun fuso di mezzo
  const ultimo = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  return `${anno}-${due(mese + 1)}-${due(Math.min(g, ultimo))}`;
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

/**
 * Le pratiche nate prima della verifica. Con l'istante si confrontano istanti
 * (strettamente prima); senza, solo il giorno, e il giorno stesso della verifica
 * non conta: non si sa se la pratica e' venuta prima o dopo.
 */
export function natePrima(trovate: PraticaDatata[], prima: Date): PraticaTrovata[] {
  const giorno = giornoItaliano(prima);
  return trovate
    .filter(({ pratica, creato }) => {
      const t = creato ? new Date(creato).getTime() : NaN;
      return Number.isFinite(t) ? t < prima.getTime() : pratica.data < giorno;
    })
    .map(({ pratica }) => pratica);
}

/**
 * Rileggendo una ricerca: per una fonte che non ha risposto vale il valore salvato,
 * cosi' un intoppo di un attimo non cancella un blocco o una pratica recente. Sulle
 * pratiche (tre fonti) si tiene la piu' recente fra quella salvata e quella letta.
 */
export function unisciSegnali(letti: LetturaSegnali, salvati: SegnaliPrefiltro | null): SegnaliPrefiltro {
  if (!salvati) return letti.segnali;
  const segnalato = letti.fallite.segnalato ? salvati.segnalato : letti.segnali.segnalato;
  let praticaRecente = letti.segnali.praticaRecente;
  if (letti.fallite.pratiche) {
    const vecchia = salvati.praticaRecente;
    if (vecchia && (!praticaRecente || vecchia.data > praticaRecente.data)) praticaRecente = vecchia;
  }
  return { segnalato, praticaRecente };
}

// --- portali pratiche su Blob ---------------------------------------------------

function dataRecord(r: Record<string, unknown>): { data: string; creato: string | null } | null {
  const creato = typeof r.creato === 'string' ? new Date(r.creato) : null;
  if (creato && !Number.isNaN(creato.getTime())) return { data: giornoItaliano(creato), creato: creato.toISOString() };
  // I record vecchi senza creato: l'id contiene la data italiana (EE-AAAAMMGG-HHMMSS), l'istante no
  const m = String(r.id ?? '').match(/^[A-Z]{2}-(\d{4})(\d{2})(\d{2})-/);
  return m ? { data: `${m[1]}-${m[2]}-${m[3]}`, creato: null } : null;
}

/**
 * Dai record dei portali pratiche alle pratiche trovate, per partita IVA. Il campo
 * cliente.piva e' "P.IVA / CF" scritto dal partner: un codice fiscale non da' una
 * partita IVA e si scarta. Il canale su quei portali lo sceglie Alberto dopo: ignoto.
 */
export function praticheDaRecord(slug: string, record: Record<string, unknown>[]): ({ piva: string } & PraticaDatata)[] {
  const fuori: ({ piva: string } & PraticaDatata)[] = [];
  for (const r of record) {
    const cliente = (r.cliente ?? null) as { piva?: unknown } | null;
    const piva = pulisciPiva(String(cliente?.piva ?? ''));
    const quando = dataRecord(r);
    if (!/^\d{11}$/.test(piva) || !quando) continue;
    fuori.push({ piva, pratica: { data: quando.data, canale: null, fornitore: slug, fonte: 'portale' }, creato: quando.creato });
  }
  return fuori;
}

type IndicePortali = Map<string, PraticaDatata[]>;
type LetturaIndice = { mappa: IndicePortali; completa: boolean };
let indice: { creato: number; mappa: IndicePortali } | null = null;
let inVolo: Promise<LetturaIndice> | null = null;

/** Per i test: svuota l'indice in memoria */
export function azzeraIndicePortali(): void {
  indice = null;
  inVolo = null;
}

async function costruisciIndice(): Promise<LetturaIndice> {
  const slug = Object.keys(PORTALI_PARTNER);
  const letti = await Promise.allSettled(slug.map((s) => leggiPratiche(s)));
  const mappa: IndicePortali = new Map();
  const falliti: string[] = [];
  letti.forEach((esito, i) => {
    if (esito.status === 'rejected') {
      falliti.push(slug[i]);
      return;
    }
    for (const { piva, ...p } of praticheDaRecord(slug[i], esito.value)) {
      mappa.set(piva, [...(mappa.get(piva) ?? []), p]);
    }
  });
  if (falliti.length) {
    const msg = letti.find((e) => e.status === 'rejected') as PromiseRejectedResult;
    console.warn(JSON.stringify({ evento: 'motore_segnali_errore', fonte: 'portali', portali: falliti, msg: String(msg.reason) }));
  } else {
    // Un indice letto a meta' non si tiene: la prossima verifica riprova
    indice = { creato: Date.now(), mappa };
  }
  return { mappa, completa: falliti.length === 0 };
}

/** Le pratiche dei portali per partita IVA, dall'indice in memoria se ha meno di 60 secondi */
async function praticheDeiPortali(piva: string): Promise<{ trovate: PraticaDatata[]; fallita: boolean }> {
  if (indice && Date.now() - indice.creato < VITA_INDICE_PORTALI_MS) {
    return { trovate: indice.mappa.get(piva) ?? [], fallita: false };
  }
  try {
    // Due verifiche insieme aspettano la stessa lettura dello store
    inVolo ??= costruisciIndice().finally(() => { inVolo = null; });
    const { mappa, completa } = await inVolo;
    return { trovate: mappa.get(piva) ?? [], fallita: !completa };
  } catch (err) {
    console.warn(JSON.stringify({ evento: 'motore_segnali_errore', fonte: 'portali', msg: String(err) }));
    return { trovate: [], fallita: true };
  }
}

// --- database ----------------------------------------------------------------------

/**
 * Il cliente segnalato da MCF per una partita IVA gia' ripulita (pulisciPiva). Lo usa
 * la verifica e, prima di generare i PDF, il preventivo della distinta: MCF puo' segnare
 * il cliente dopo la verifica. Errore = nessuno, fallita, con una riga nei log.
 */
export async function clienteSegnalato(piva: string): Promise<{ segnalato: SegnaliPrefiltro['segnalato']; fallita: boolean }> {
  try {
    // La partita IVA si confronta a sole cifre: chi l'ha scritta col prefisso IT resta trovato
    const righe = await query<{ motivo: string; effetto: 'blocco' | 'rosso' }>(
      `SELECT motivo, effetto FROM app.cliente_segnalato WHERE regexp_replace(piva, '\\D', '', 'g') = $1 LIMIT 1`,
      [piva],
    );
    const r = righe[0];
    return { segnalato: r ? { motivo: r.motivo, effetto: r.effetto } : null, fallita: false };
  } catch (err) {
    // Non ferma la verifica, ma un blocco che non si legge non deve passare in silenzio
    console.error(JSON.stringify({ evento: 'motore_segnalato_errore', piva, msg: String(err) }));
    return { segnalato: null, fallita: true };
  }
}

type RigaPratica = { data: string; canale: string | null; fornitore_slug: string | null };

/** La pratica piu' recente di una tabella, gia' con la data in AAAA-MM-GG. Errore = nessuna, fallita */
async function ultimaPratica(
  fonte: 'motore' | 'esterna',
  sql: string,
  valori: unknown[],
): Promise<{ trovate: PraticaTrovata[]; fallita: boolean }> {
  try {
    const righe = await query<RigaPratica>(sql, valori);
    return {
      trovate: righe.map((r) => ({ data: r.data, canale: r.canale ?? null, fornitore: r.fornitore_slug ?? null, fonte })),
      fallita: false,
    };
  } catch (err) {
    console.warn(JSON.stringify({ evento: 'motore_segnali_errore', fonte, msg: String(err) }));
    return { trovate: [], fallita: true };
  }
}

// Le date escono gia' come testo: pg trasformerebbe un date in mezzanotte locale,
// e da li' a toISOString si perde un giorno.
// app.pratica ha l'istante: si confronta con l'istante della verifica, strettamente prima.
const SQL_PRATICA_MOTORE = `
  SELECT to_char(creato AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS data, canale, fornitore_slug
  FROM app.pratica WHERE piva = $1 AND creato < $2::timestamptz ORDER BY creato DESC LIMIT 1`;
// app.pratica_esterna ha solo il giorno: contano i giorni prima di quello italiano della
// verifica. Una pratica esterna datata lo stesso giorno non si sa se e' venuta prima o
// dopo, e la piu' probabile e' quella che MCF sta lavorando proprio da questa
// verifica: si lascia fuori, come la pratica del motore mandata dopo.
const SQL_PRATICA_ESTERNA = `
  SELECT to_char(data, 'YYYY-MM-DD') AS data, canale, fornitore_slug
  FROM app.pratica_esterna WHERE regexp_replace(piva, '\\D', '', 'g') = $1 AND data < $2::date
  ORDER BY data DESC LIMIT 1`;

/**
 * Cliente segnalato e pratica recente per una partita IVA, con le pratiche nate prima
 * dell'istante `prima`: la verifica appena fatta (POST) o quella riaperta (GET, il suo
 * `creato`). Le pratiche del motore contano su ogni carrozzeria, non solo su quella
 * che verifica. Dice anche quali fonti non hanno risposto.
 */
export async function segnaliPrefiltro(pivaGrezza: string, prima: Date): Promise<LetturaSegnali> {
  const piva = pulisciPiva(pivaGrezza);
  const [segnalato, motore, esterna, portali] = await Promise.all([
    clienteSegnalato(piva),
    ultimaPratica('motore', SQL_PRATICA_MOTORE, [piva, prima.toISOString()]),
    ultimaPratica('esterna', SQL_PRATICA_ESTERNA, [piva, giornoItaliano(prima)]),
    praticheDeiPortali(piva),
  ]);
  return {
    segnali: {
      segnalato: segnalato.segnalato,
      praticaRecente: praticaPiuRecente([...motore.trovate, ...natePrima(portali.trovate, prima), ...esterna.trovate], prima),
    },
    fallite: { segnalato: segnalato.fallita, pratiche: motore.fallita || esterna.fallita || portali.fallita },
  };
}

/**
 * I segnali letti si salvano sulla ricerca: il polling degli eventi li rilegge da li'.
 * Non fallisce mai: la scheda e' gia' pagata, un salvataggio mancato lascia una riga
 * nei log e la prossima riapertura li rilegge.
 */
export async function salvaSegnali(ricercaId: string, segnali: SegnaliPrefiltro): Promise<void> {
  try {
    await query(`UPDATE app.ricerca_merito SET segnali = $2 WHERE id = $1`, [ricercaId, JSON.stringify(segnali)]);
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_segnali_errore', fonte: 'salvataggio', ricercaId, msg: String(err) }));
  }
}
