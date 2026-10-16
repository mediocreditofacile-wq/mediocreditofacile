// Macchine e accessori del simulatore di /tools/duplex, dagli stessi JSON del
// motore dei portali. Gli accessori si offrono per famiglia e, se ne hanno uno,
// per allestimento: la batteria di scorta solo sulla versione a batteria.

import accessoriDB from '../../data/duplex-accessori.json';
import listino from '../../data/duplex-listino.json';
import { accessorioCompatibile } from '../../lib/allestimento-accessorio';

// 'steam' non e' un'alimentazione ma un allestimento (vapore): sta qui perche' nel
// selettore occupa lo stesso posto di cavo e batteria, come terza variante della famiglia.
export type Alimentazione = 'cavo' | 'batteria' | 'steam' | null;
export interface ModelloListino {
  id: string;
  label: string;
  prezzo: number;
  alimentazione: Alimentazione;
  highlight?: boolean;
}
// Una voce e' un add-on (spazzola, batteria di scorta, accessorio).
// step = incremento del counter (es. 2 per "in coppia"), max = limite superiore.
export interface AccessorioDuplex {
  id: string;
  label: string;
  prezzo: number;
  step: number;
  max: number;
  note?: string;
  /** Se c'e', l'accessorio si offre solo con questa versione della macchina */
  allestimento?: string;
}
interface AccessoriFamiglia {
  spazzole: AccessorioDuplex[];
  extra: AccessorioDuplex[];
}

export const MACCHINE_DUPLEX = listino.macchine as ModelloListino[];
const FAMIGLIE = accessoriDB.famiglie as Record<string, AccessoriFamiglia>;

/** Spazzole ed extra della famiglia, nell'ordine del listino, compatibili con la versione scelta */
export function accessoriVisibili(famiglia: string, alimentazione: string | null): AccessorioDuplex[] {
  const f = FAMIGLIE[famiglia] ?? { spazzole: [], extra: [] };
  return [...f.spazzole, ...f.extra].filter((a) => accessorioCompatibile(a.allestimento, alimentazione));
}
