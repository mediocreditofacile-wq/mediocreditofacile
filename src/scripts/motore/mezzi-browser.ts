// I mezzi nel browser (settore "mezzi", Bergamelli): le regole pure della scheda
// Proposte. Chi vende i beni di una categoria, la risposta di partenza sul targato,
// il corpo per il server, l'anticipo del leasing e la colonna che va nel PDF.
// Spec mcf_spec-bergamelli-motore_v2, sezioni 4 e 5.
//
// Niente DOM, niente rete: si testa da solo. Il server ricontrolla tutto. Dai moduli
// del server si importano solo i tipi: config-mezzi porta gli spread dei partner,
// calcolo-mezzi i listini e il database, e nessuno dei due entra nel bundle.

import type { MezziSchermo } from '../../lib/motore/calcolo-mezzi';
import type { CategoriaMezzo, MezziBrowser } from '../../lib/motore/config-mezzi';

/** Una riga dei beni come sta nelle caselle: quantita' e prezzo come li ha scritti l'agente */
export interface RigaInPagina {
  descrizione: string;
  categoria: string;
  quantita: string;
  prezzo: string;
  /** Null = l'agente non ha risposto: il server usa il default della categoria, se c'e' */
  targato: boolean | null;
}

export type ColonnaLeasing = MezziSchermo['leasing'][number];

/** Lo stesso tetto del server (ANTICIPO_MAX_MEZZI in config-mezzi.ts): un test li confronta */
const ANTICIPO_MAX = 30;

/** La durata messa in evidenza, come DURATA_EVIDENZA sul server */
const DURATA_EVIDENZA = 60;

/**
 * Il venditore che firma i beni di quella categoria: quello che la elenca, altrimenti
 * il venditore di tutto il resto (categorie vuote). Null se non c'e' nessuno dei due.
 */
export function venditoreSuggerito(cfg: MezziBrowser, categoria: string): string | null {
  const v = cfg.venditori.find((x) => x.categorie.includes(categoria)) ?? cfg.venditori.find((x) => x.categorie.length === 0);
  return v?.codice ?? null;
}

/** La risposta di partenza a "il mezzo e' targato?": il default della categoria, null se non lo porta */
export function targatoIniziale(categorie: CategoriaMezzo[], nome: string): boolean | null {
  return categorie.find((c) => c.nome === nome)?.targato ?? null;
}

/**
 * Il corpo di /api/motore/proposte (e, con leasingPdf, del preventivo). Quantita' e
 * prezzo vanno come li ha scritti l'agente: "48.500,00" lo legge il server, che sa
 * dire quale riga non regge. Il targato va com'e', true, false o null, mai una stringa:
 * per il server un valore presente e non booleano e' una risposta che manca.
 */
export function corpoProposte(
  slug: string,
  ricercaId: string,
  righe: RigaInPagina[],
  venditore: string,
  anticipoPerc: number,
): Record<string, unknown> {
  return {
    f: slug,
    ricercaId,
    beni: righe.map((r) => ({
      descrizione: r.descrizione,
      categoria: r.categoria,
      quantita: r.quantita,
      prezzo: r.prezzo,
      targato: r.targato,
    })),
    venditore,
    anticipoPerc,
  };
}

/**
 * L'anticipo del leasing scritto nella casella: un intero da 0 a 30, come lo vuole il
 * server. Tutto il resto ("", "20%", "1.000", 45, 20,5) e' null e la pagina lo dice:
 * mai il default al posto di un valore che non si legge.
 */
export function leggiAnticipo(v: string): number | null {
  const s = String(v ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= ANTICIPO_MAX ? n : null;
}

/** Una riga appena aggiunta, ancora da scrivere: la quantita' di partenza non conta */
export function rigaVuota(r: RigaInPagina): boolean {
  return !r.descrizione.trim() && !r.categoria && !r.prezzo.trim();
}

const CAMPO_ERRORE: Record<string, keyof RigaInPagina> = {
  descrizione_mancante: 'descrizione',
  categoria_non_valida: 'categoria',
  quantita_non_valida: 'quantita',
  prezzo_non_valido: 'prezzo',
  // Il totale della riga oltre il tetto: si corregge il prezzo (o la quantita')
  importo_non_valido: 'prezzo',
  targato_mancante: 'targato',
};

/** La casella da segnare per un errore di riga; null per gli errori di tutto il preventivo */
export const campoDiErrore = (errore: string): keyof RigaInPagina | null => CAMPO_ERRORE[errore] ?? null;

/** Lo stesso test del server (migliaiaAmbigue in distinta.ts): "61.000" senza virgola */
const SOLO_PUNTO_MIGLIAIA = /^\d{1,3}(\.\d{3})+$/;
const senzaSimboli = (v: string) => v.replace(/[€\s]/g, '');

/**
 * Il messaggio di una riga quando quello generico non aiuta. "61.000" il server non lo
 * legge, perche' non sa se sono migliaia o decimali: la pagina dice come scriverlo.
 * Null per tutti gli altri casi, che hanno il messaggio di sempre.
 */
export function messaggioRiga(errore: string, riga: RigaInPagina | undefined): string | null {
  if (!riga) return null;
  if (errore === 'prezzo_non_valido') {
    const v = senzaSimboli(riga.prezzo);
    if (SOLO_PUNTO_MIGLIAIA.test(v)) {
      return `Scrivi ${v.replace(/\./g, '')} oppure ${v},00: con il solo punto non si capisce se sono migliaia o decimali.`;
    }
  }
  if (errore === 'quantita_non_valida') {
    const v = senzaSimboli(riga.quantita);
    if (SOLO_PUNTO_MIGLIAIA.test(v)) return `Scrivi la quantità senza punti: ${v.replace(/\./g, '')}.`;
  }
  return null;
}

// --- il leasing a schermo ---------------------------------------------------------

/** L'intestazione di una colonna: il nome del partner quando si mostra, altrimenti "Soluzione A" */
export const etichettaColonna = (c: Pick<ColonnaLeasing, 'chiave' | 'nome'>) => c.nome ?? `Soluzione ${c.chiave}`;

/** Le durate di tutte le colonne, una volta sola e in ordine: sono le righe della tabella */
export function durateLeasing(leasing: Pick<ColonnaLeasing, 'righe'>[]): number[] {
  return [...new Set(leasing.flatMap((c) => c.righe.map((r) => r.durata)))].sort((a, b) => a - b);
}

/** Le colonne che quotano: una colonna senza righe ha solo il motivo */
export const colonneConRighe = <T extends Pick<ColonnaLeasing, 'righe'>>(leasing: T[]) => leasing.filter((c) => c.righe.length > 0);

/**
 * La colonna del leasing che va nel PDF. La scelta dell'agente, finche' quella colonna
 * ha righe; altrimenti la regola del server (chiavePerPdf in preventivo-mezzi.ts): la
 * rata piu' bassa a 60 mesi se tutte le colonne li hanno, se no alla durata piu' lunga
 * in comune, se no la prima colonna con righe. A parita' resta la prima. Null se nessuna
 * colonna quota: nel PDF il leasing non c'e'.
 */
export function chiavePdf(leasing: ColonnaLeasing[], scelta: string | null): string | null {
  const colonne = colonneConRighe(leasing);
  if (colonne.length === 0) return null;
  if (scelta && colonne.some((c) => c.chiave === scelta)) return scelta;

  const comuni = colonne[0].righe
    .map((r) => r.durata)
    .filter((d) => colonne.every((c) => c.righe.some((r) => r.durata === d)));
  if (comuni.length === 0) return colonne[0].chiave;
  const durata = comuni.includes(DURATA_EVIDENZA) ? DURATA_EVIDENZA : Math.max(...comuni);

  const rata = (c: ColonnaLeasing) => c.righe.find((r) => r.durata === durata)!.rata;
  let migliore = colonne[0];
  for (const c of colonne.slice(1)) if (rata(c) < rata(migliore)) migliore = c;
  return migliore.chiave;
}
