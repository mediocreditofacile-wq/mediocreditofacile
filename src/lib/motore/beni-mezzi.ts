// I beni del settore mezzi (Bergamelli): le righe che l'agente descrive a mano,
// ricontrollate contro le categorie del fornitore. Come la distinta di Led Office
// ma senza catalogo: ogni bene e' fuori listino, con descrizione, categoria,
// quantita', prezzo e la risposta alla domanda "il mezzo e' targato?".
//
// Modulo puro: niente database, niente rete. Lo importano il server, che non si fida
// del browser, e il browser, che mostra totali e domande mentre si scrive. Per questo
// da config-mezzi si importano solo i tipi: li' dentro ci sono i listini del leasing.
//
// Il targato decide il canale: Grenke non quota un mezzo targato. Quindi una risposta
// che non c'e' non vale mai "non targato". La categoria puo' portare un default
// (Gru a torre: no); dove non lo porta (Movimento terra, Piattaforme aeree) la riga
// deve rispondere, e senza risposta l'elenco si ferma. Se la riga risponde, vale la
// riga anche contro il default: e' l'agente che conferma o corregge. Un valore che
// non e' un booleano ("si", 1) non e' una risposta.

import { testo } from './catalogo-import';
import { leggiPrezzo, leggiQuantita, MAX_RIGHE, MAX_TOTALE, totaleRighe } from './distinta';
import type { CategoriaMezzo } from './config-mezzi';

const MAX_DESCRIZIONE = 200;

export interface BeneMezzo {
  descrizione: string;
  categoria: string;
  quantita: number;
  /** Unitario, arrotondato al centesimo */
  prezzo: number;
  targato: boolean;
  /** Prezzo per quantita', arrotondato al centesimo */
  totale: number;
}

export type ErroreBeni =
  | 'beni_vuoti'
  | 'troppi_beni'
  | 'descrizione_mancante'
  | 'categoria_non_valida'
  | 'quantita_non_valida'
  | 'prezzo_non_valido'
  | 'targato_mancante'
  | 'importo_non_valido';

export type EsitoBeni =
  | {
      ok: true;
      beni: BeneMezzo[];
      totale: number;
      /** Vero se almeno un bene e' targato */
      targato: boolean;
      /** Le categorie dei beni, senza doppioni, nell'ordine in cui compaiono */
      categorie: string[];
    }
  /** `riga` e' l'indice (da zero) della riga che non regge; null se l'errore e' di tutto l'elenco */
  | { ok: false; error: ErroreBeni; riga: number | null };

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

type Letto = { ok: true; bene: BeneMezzo } | { ok: false; error: ErroreBeni };
const no = (error: ErroreBeni): Letto => ({ ok: false, error });

function leggiBene(grezza: unknown, categorie: CategoriaMezzo[]): Letto {
  const r = oggetto(grezza);

  const descrizione = typeof r.descrizione === 'string' ? testo(r.descrizione, MAX_DESCRIZIONE) : '';
  if (!descrizione) return no('descrizione_mancante');

  const categoria = typeof r.categoria === 'string' ? categorie.find((c) => c.nome === r.categoria) : undefined;
  if (!categoria) return no('categoria_non_valida');

  const quantita = leggiQuantita(r.quantita);
  if (quantita === null) return no('quantita_non_valida');

  const prezzo = leggiPrezzo(r.prezzo);
  if (prezzo === null) return no('prezzo_non_valido');

  // La risposta della riga batte il default della categoria; senza nessuno dei due non si indovina
  const targato = typeof r.targato === 'boolean' ? r.targato : categoria.targato;
  if (targato === null) return no('targato_mancante');

  return {
    ok: true,
    bene: { descrizione, categoria: categoria.nome, quantita, prezzo, targato, totale: totaleRighe([{ quantita, prezzo }]) },
  };
}

/**
 * Ricontrolla i beni che arrivano dal browser contro le categorie del fornitore. Si
 * ferma alla prima riga che non regge e dice quale. Un esito riuscito ha sempre
 * almeno un bene e quindi almeno una categoria.
 */
export function validaBeni(categorie: CategoriaMezzo[], grezze: unknown): EsitoBeni {
  const fallito = (error: ErroreBeni, riga: number | null = null): EsitoBeni => ({ ok: false, error, riga });
  if (!Array.isArray(grezze) || grezze.length === 0) return fallito('beni_vuoti');
  if (grezze.length > MAX_RIGHE) return fallito('troppi_beni');

  const beni: BeneMezzo[] = [];
  for (let i = 0; i < grezze.length; i++) {
    const letto = leggiBene(grezze[i], categorie);
    if (!letto.ok) return fallito(letto.error, i);
    if (letto.bene.totale > MAX_TOTALE) return fallito('importo_non_valido', i);
    beni.push(letto.bene);
  }

  const totale = totaleRighe(beni);
  if (totale > MAX_TOTALE) return fallito('importo_non_valido');

  return {
    ok: true,
    beni,
    totale,
    targato: beni.some((b) => b.targato),
    categorie: [...new Set(beni.map((b) => b.categoria))],
  };
}
