// I listini su cui si calcola il canone del noleggio operativo fotovoltaico.
//
// ATTENZIONE — FILE SERVER-ONLY. I coefficienti sono dati commerciali riservati:
// non devono finire nel bundle del browser ne' essere deducibili per differenza
// dai valori esposti. In output esce solo il canone finale, mai la sigla della
// tabella, mai il coefficiente, mai la fascia di importo.
//
// Perche' una tabella per portale e non una sola: PagaRent e Grenke sono due
// operatori diversi con due listini diversi, e la scelta e' commerciale.
// InnovaLux quota su PagaRent dal 07/08/2026; Green-Go quota su Grenke ESG++++.
// Tenerle separate evita l'errore piu' facile, cioe' allinearle credendole
// la stessa cosa: sullo stesso impianto danno canoni diversi.

import { ESG_MAX, ESG_MIN, esgPrezzoDaCanone, getEsgCoeff } from '../data/esg';
import { pagarentPrezzoDaRata } from '../data/pagarent';
import {
  DURATE as DURATE_PAGARENT,
  IMPORTO_MAX as PAGARENT_MAX,
  IMPORTO_MIN as PAGARENT_MIN,
  RISCATTO as RISCATTO_PAGARENT,
  coefficiente as coeffPagarent,
} from './prospetti-pv-coefficienti';

export type IdTabella = 'pagarent' | 'esg';

export interface TabellaCanoni {
  id: IdTabella;
  /** Durate esposte al fornitore, in ordine crescente */
  durate: number[];
  /** Riscatto finale in % dell'imponibile, per durata */
  riscatto: Record<number, number>;
  importoMin: number;
  importoMax: number;
  /** canone = importo x coefficiente / 100. Null se la durata non e' quotabile. */
  coefficiente(importo: number, durata: number): number | null;
  /**
   * Calcolo inverso: dal canone che il cliente puo' sostenere all'imponibile.
   * Serve alla simulazione rapida, dove l'agente parte dalla rata e non dal
   * prezzo. Null se nessuna fascia regge quel canone su quella durata.
   */
  prezzoDaCanone(canone: number, durata: number): number | null;
  /** Le durate effettivamente quotabili per quell'importo */
  durateDisponibili(importo: number): number[];
  /** L'importo si puo' quotare su questa tabella? */
  quotabile(importo: number): boolean;
}

/**
 * PagaRent. E' la tabella storica del portale InnovaLux: qui non cambia niente,
 * comprese le durate 24-60 e il fatto che si quota solo quando tutte le durate
 * sono disponibili.
 */
export const TABELLA_PAGARENT: TabellaCanoni = {
  id: 'pagarent',
  durate: DURATE_PAGARENT,
  riscatto: RISCATTO_PAGARENT,
  importoMin: PAGARENT_MIN,
  importoMax: PAGARENT_MAX,
  coefficiente: coeffPagarent,
  prezzoDaCanone: (canone, durata) => pagarentPrezzoDaRata(canone, durata),
  durateDisponibili(importo) {
    return DURATE_PAGARENT.filter((m) => coeffPagarent(importo, m) !== null);
  },
  quotabile(importo) {
    return (
      importo >= PAGARENT_MIN &&
      importo <= PAGARENT_MAX &&
      DURATE_PAGARENT.every((m) => coeffPagarent(importo, m) !== null)
    );
  },
};

/**
 * Grenke ESG++++, la tabella dedicata al fotovoltaico (fonte: Tabella ESG
 * ++++.pdf, kit collaboratore Grenke/ReteRent), gia' in src/data/esg.ts.
 *
 * Le durate lunghe non esistono su tutti gli importi: i 72 mesi partono da
 * 8.001 euro e gli 84 da 40.001. Su Green-Go, che lavora tra 15.000 e 60.000,
 * i 72 ci sono sempre e gli 84 compaiono sopra i 40.000: e' voluto, non e' un
 * buco. I 24 mesi restano fuori: su un impianto fotovoltaico non hanno senso
 * commerciale, il canone non e' mai coperto dal risparmio in bolletta.
 */
const DURATE_ESG = [36, 48, 60, 72, 84];

/**
 * Riscatti Grenke, in % dell'imponibile. Valori medi indicativi: il prezzo
 * effettivo si definisce a fine contratto sullo stato del bene.
 *
 * ATTENZIONE: 36, 48, 60 e 72 sono i valori Grenke gia' usati nei prospetti
 * emessi fino al 07/08/2026. Gli 84 mesi non erano in quella griglia e qui
 * riusano il valore dei 72, come gia' fatto altrove in mancanza di fonte:
 * e' l'unico numero di questo file senza un documento dietro, da correggere
 * appena Grenke lo comunica.
 */
const RISCATTO_ESG: Record<number, number> = { 36: 6, 48: 4, 60: 3, 72: 3, 84: 3 };

export const TABELLA_ESG: TabellaCanoni = {
  id: 'esg',
  durate: DURATE_ESG,
  riscatto: RISCATTO_ESG,
  importoMin: ESG_MIN,
  importoMax: ESG_MAX,
  coefficiente: (importo, durata) => getEsgCoeff(importo, durata),
  prezzoDaCanone: (canone, durata) => esgPrezzoDaCanone(canone, durata),
  durateDisponibili(importo) {
    return DURATE_ESG.filter((m) => getEsgCoeff(importo, m) !== null);
  },
  quotabile(importo) {
    // Basta una durata quotabile: qui il ventaglio si stringe con l'importo,
    // e pretenderle tutte escluderebbe gli impianti sotto i 40.000 euro.
    return (
      importo >= ESG_MIN && importo <= ESG_MAX && DURATE_ESG.some((m) => getEsgCoeff(importo, m) !== null)
    );
  },
};

export const TABELLE: Record<IdTabella, TabellaCanoni> = {
  pagarent: TABELLA_PAGARENT,
  esg: TABELLA_ESG,
};

/** Tabella di default: PagaRent, cosi' chi non passa niente non cambia comportamento */
export const TABELLA_DEFAULT = TABELLA_PAGARENT;

export function getTabella(id: string | null | undefined): TabellaCanoni {
  return TABELLE[(id ?? '') as IdTabella] ?? TABELLA_DEFAULT;
}
