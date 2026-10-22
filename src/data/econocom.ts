/**
 * Coefficienti Econocom per il noleggio operativo.
 *
 * Fonte: coefficienti aggiornati mandati da Luca Silvestrin (Econocom) ad Alberto,
 * riportati da Alberto il 22/10/2026. Sostituiscono ovunque la tabella del
 * 26/05/2026 (solo 60 mesi, quattro fasce da 0,0202 a 0,0197) e i 24, 36 e 48 mesi
 * che il tool Marotta ricavava da quel 60.
 *
 * Modello di calcolo: rata mensile = importo x coefficiente della durata.
 *
 * Regole decise da Alberto il 22/10/2026:
 *  - un coefficiente per durata, senza fasce di importo;
 *  - importo minimo 150.000 euro, l'unico paletto che Econocom aveva messo per
 *    iscritto con la tabella di maggio;
 *  - niente 24 mesi: nessuna tabella Econocom li riporta;
 *  - valgono per la Pubblica Amministrazione (/tools/econocom-pa) e per i privati
 *    con oltre 5 milioni di fatturato (motore dei portali, tool Marotta, export);
 *  - solo noleggio operativo.
 *
 * La rata e' indicativa: Econocom quota ogni operazione caso per caso.
 */

/** Coefficiente per durata in mesi, come frazione dell'importo (0,02076 = 2,076%) */
export const ECONOCOM_COEFFICIENTI: Record<number, number> = {
  36: 0.03152,
  48: 0.02473,
  60: 0.02076,
};

/** Durate quotabili, in ordine crescente */
export const ECONOCOM_DURATE: number[] = [36, 48, 60];

export const ECONOCOM_IMPORTO_MIN = 150_000;

export interface RisultatoEconocom {
  rataMensile: number;
  canoneComplessivo: number;
  /** Frazione dell'importo */
  coefficiente: number;
  durataMesi: number;
}

/**
 * Rata mensile indicativa Econocom per importo e durata.
 * Null se l'importo non e' un numero valido, e' sotto il minimo o la durata non c'e'.
 */
export function calcolaRataEconocom(importo: number, durata: number): RisultatoEconocom | null {
  if (!Number.isFinite(importo) || importo < ECONOCOM_IMPORTO_MIN) return null;
  const coefficiente = ECONOCOM_COEFFICIENTI[durata];
  if (coefficiente === undefined) return null;

  const rataMensile = importo * coefficiente;
  return {
    rataMensile,
    canoneComplessivo: rataMensile * durata,
    coefficiente,
    durataMesi: durata,
  };
}
