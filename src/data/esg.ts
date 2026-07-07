// --- Coefficienti GRENKE ESG++++ (fonte: Tabella ESG ++++.pdf — Kit collaboratore Grenke / ReteRent) ---
// Tabella dedicata al fotovoltaico: il coefficiente restituisce direttamente il CANONE MENSILE.
// Struttura: per ogni durata, array di fasce { da, a, c } ordinate per importo crescente.
// Le durate lunghe sono disponibili solo dalle fasce alte: 72 mesi da 8.001 €, 84 mesi da 40.001 €.

export const ESG_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
  24: [
    { da: 800, a: 4000, c: 4.520 },
    { da: 4001, a: 8000, c: 4.480 },
    { da: 8001, a: 12000, c: 4.440 },
    { da: 12001, a: 20000, c: 4.400 },
    { da: 20001, a: 40000, c: 4.360 },
    { da: 40001, a: 80000, c: 4.320 },
    { da: 80001, a: 160000, c: 4.280 },
    { da: 160001, a: 240000, c: 4.240 },
  ],
  36: [
    { da: 800, a: 4000, c: 3.124 },
    { da: 4001, a: 8000, c: 3.095 },
    { da: 8001, a: 12000, c: 3.066 },
    { da: 12001, a: 20000, c: 3.038 },
    { da: 20001, a: 40000, c: 3.167 },
    { da: 40001, a: 80000, c: 3.140 },
    { da: 80001, a: 160000, c: 3.113 },
    { da: 160001, a: 240000, c: 3.085 },
  ],
  48: [
    { da: 800, a: 4000, c: 2.428 },
    { da: 4001, a: 8000, c: 2.405 },
    { da: 8001, a: 12000, c: 2.382 },
    { da: 12001, a: 20000, c: 2.359 },
    { da: 20001, a: 40000, c: 2.455 },
    { da: 40001, a: 80000, c: 2.433 },
    { da: 80001, a: 160000, c: 2.411 },
    { da: 160001, a: 240000, c: 2.389 },
  ],
  60: [
    { da: 800, a: 4000, c: 2.015 },
    { da: 4001, a: 8000, c: 1.996 },
    { da: 8001, a: 12000, c: 1.977 },
    { da: 12001, a: 20000, c: 1.958 },
    { da: 20001, a: 40000, c: 2.032 },
    { da: 40001, a: 80000, c: 2.014 },
    { da: 80001, a: 160000, c: 1.996 },
    { da: 160001, a: 240000, c: 1.978 },
  ],
  72: [
    { da: 8001, a: 12000, c: 1.710 },
    { da: 12001, a: 20000, c: 1.693 },
    { da: 20001, a: 40000, c: 1.754 },
    { da: 40001, a: 80000, c: 1.737 },
    { da: 80001, a: 160000, c: 1.720 },
    { da: 160001, a: 240000, c: 1.703 },
  ],
  84: [
    { da: 40001, a: 80000, c: 1.535 },
    { da: 80001, a: 160000, c: 1.520 },
    { da: 160001, a: 240000, c: 1.505 },
  ],
};

export const ESG_DURATE = [24, 36, 48, 60, 72, 84];
export const ESG_MIN = 800;
export const ESG_MAX = 240000;

// Trova il coefficiente ESG per un importo e una durata (null se fascia/durata non disponibile)
export function getEsgCoeff(importo: number, durata: number): number | null {
  const fasce = ESG_COEFFS[durata];
  if (!fasce) return null;
  const fascia = fasce.find((f) => importo >= f.da && importo <= f.a);
  return fascia ? fascia.c : null;
}

// Calcolo inverso: dal canone mensile desiderato al prezzo di vendita.
// Il coefficiente dipende dalla fascia del prezzo, quindi si prova ogni fascia
// e si tiene quella in cui il prezzo ricavato ricade davvero.
export function esgPrezzoDaCanone(canone: number, durata: number): number | null {
  const fasce = ESG_COEFFS[durata];
  if (!fasce || canone <= 0) return null;
  for (const f of fasce) {
    const prezzo = (canone / f.c) * 100;
    if (prezzo >= f.da && prezzo <= f.a) return prezzo;
  }
  return null;
}
