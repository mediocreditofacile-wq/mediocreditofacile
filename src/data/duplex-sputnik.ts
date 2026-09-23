// Coefficienti Grenke tabella SPUTNIK ++++ applicati al fornitore Duplex International,
// cioe' la tabella "tradizionale" del portale Duplex.
// Fonte: portale ReteRent, simulatore sul fornitore Duplex International (codice tabella
// SPT), letto il 23/09/2026 fascia per fascia; coincide cifra per cifra con il PDF
// "Tabella SPUTNIK ++++" del kit ReteRent.
//
// Fino al 23/09/2026 il portale usava quattro coefficienti PIATTI (2,25% a 60 mesi, da cui
// l'Ultrax a 79 euro) che non corrispondevano a nessuna tabella Grenke: erano una stima di
// maggio. Sulle macchine sotto i 2.500 euro sbagliavano di molto, perche' li' vale il
// coefficiente della prima fascia, il piu' caro: la Duplex 340 usciva a 43 euro invece di
// 51,60. Non reintrodurre una tabella senza fasce.
//
// c = coefficiente mensile in percentuale sull'imponibile (canone = importo x c / 100).

import type { FasciaGrace } from './duplex-grace';

export const SPUTNIK_FASCE: Record<number, FasciaGrace[]> = {
  24: [
    { da: 500, a: 2500, c: 5.01432 },
    { da: 2501, a: 5000, c: 5.01126 },
    { da: 5001, a: 12000, c: 4.96638 },
    { da: 12001, a: 25000, c: 4.95924 },
    { da: 25001, a: 50000, c: 4.88172 },
    { da: 50001, a: 100000, c: 4.82052 },
  ],
  36: [
    { da: 500, a: 2500, c: 3.63324 },
    { da: 2501, a: 5000, c: 3.54042 },
    { da: 5001, a: 12000, c: 3.47208 },
    { da: 12001, a: 25000, c: 3.4476 },
    { da: 25001, a: 50000, c: 3.40986 },
    { da: 50001, a: 100000, c: 3.40578 },
  ],
  48: [
    { da: 500, a: 2500, c: 3.06918 },
    { da: 2501, a: 5000, c: 2.74176 },
    { da: 5001, a: 12000, c: 2.71218 },
    { da: 12001, a: 25000, c: 2.67852 },
    { da: 25001, a: 50000, c: 2.6775 },
    { da: 50001, a: 100000, c: 2.67444 },
  ],
  60: [
    { da: 500, a: 2500, c: 2.6724 },
    { da: 2501, a: 5000, c: 2.31438 },
    { da: 5001, a: 12000, c: 2.27766 },
    { da: 12001, a: 25000, c: 2.24604 },
    { da: 25001, a: 50000, c: 2.21136 },
    { da: 50001, a: 100000, c: 2.14914 },
  ],
};

/** Coefficiente Sputnik (percentuale) per importo e durata, null se fuori tabella. */
export function coefficienteSputnik(importo: number, durata: number): number | null {
  const fasce = SPUTNIK_FASCE[durata];
  if (!fasce?.length) return null;
  const fascia = fasce.find((f) => importo >= f.da && importo < f.a + 1);
  return fascia ? fascia.c : null;
}
