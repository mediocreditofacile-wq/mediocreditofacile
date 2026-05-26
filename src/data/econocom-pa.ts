/**
 * Coefficienti Econocom per noleggio operativo destinato alla Pubblica Amministrazione.
 *
 * Tabella inviata da Luca Silvestrin (Econocom) il 26 maggio 2026.
 * Modello di calcolo: rata mensile = importo_investimento × coefficiente_di_fascia.
 *
 * Per ora e' disponibile la sola durata 60 mesi: quando arriveranno altre durate
 * (Luca ha detto che oltre i 60 mesi si entra nel "su misura" per clienti di standing)
 * si aggiungeranno le tabelle qui mantenendo la stessa struttura.
 *
 * Vincoli operativi sull'operazione (NON sui coefficienti):
 *  - importo minimo 150.000 € (sotto e' fuori target Econocom).
 *  - durata standard 60 mesi.
 *  - il preventivo e' indicativo: Econocom analizza ogni operazione caso per caso.
 */

export interface FasciaEconocom {
  da: number;
  /** Limite superiore escluso. `null` = nessun limite. */
  a: number | null;
  coefficiente: number;
  label: string;
}

/** Convenzione fasce: da incluso, a escluso. La fascia "oltre 700.000" non ha limite superiore. */
export const ECONOCOM_PA_COEFFICIENTI_60M: FasciaEconocom[] = [
  { da: 150_000, a: 300_000, coefficiente: 0.0202, label: 'Da 150.000 € a 300.000 €' },
  { da: 300_000, a: 500_000, coefficiente: 0.0200, label: 'Da 300.000 € a 500.000 €' },
  { da: 500_000, a: 700_000, coefficiente: 0.0199, label: 'Da 500.000 € a 700.000 €' },
  { da: 700_000, a: null,    coefficiente: 0.0197, label: 'Oltre 700.000 €' },
];

export const ECONOCOM_PA_IMPORTO_MIN = 150_000;
export const ECONOCOM_PA_DURATA_MESI = 60;

export interface RisultatoEconocomPA {
  rataMensile: number;
  canoneComplessivo: number;
  fascia: FasciaEconocom;
  durataMesi: number;
}

/**
 * Calcola la rata mensile indicativa Econocom per un dato importo di investimento.
 * Restituisce `null` se l'importo non e' un numero valido o e' sotto la soglia minima.
 */
export function calcolaRataEconocomPA(importo: number): RisultatoEconocomPA | null {
  if (!Number.isFinite(importo) || importo < ECONOCOM_PA_IMPORTO_MIN) return null;

  const fascia = ECONOCOM_PA_COEFFICIENTI_60M.find(
    (f) => importo >= f.da && (f.a === null || importo < f.a),
  );
  if (!fascia) return null;

  const rataMensile = importo * fascia.coefficiente;
  const canoneComplessivo = rataMensile * ECONOCOM_PA_DURATA_MESI;

  return {
    rataMensile,
    canoneComplessivo,
    fascia,
    durataMesi: ECONOCOM_PA_DURATA_MESI,
  };
}
