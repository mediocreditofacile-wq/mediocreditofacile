// --- Coefficienti GRENKE ESG++++ ---
// Fonte: PDF "Tabella ESG ++++" del kit collaboratore Grenke / ReteRent
// (~/Desktop/AREE/Mediocredito_Facile/04_Partner/ReteRent/KIT ESG- Green/, file del
// 26/03/2026), trascritto cifra per cifra il 12/10/2026. Non ancora riscontrato sul
// simulatore ReteRent: se un canone non torna, confrontarlo con quick-quotation.
//
// ATTENZIONE, storia del file: fino al 12/10/2026 qui c'erano fasce e coefficienti che
// coincidevano col PDF solo nella fascia 20.001-40.000. Sotto i 20.000 euro, a 24 mesi e
// a 84 mesi il canone usciva piu' basso del listino (a 60 mesi su 15.000 euro: 293,70
// contro 309,45). Stessa storia del caso Duplex: ogni cella va riletta sul documento.
//
// Canone mensile = prezzo d'acquisto IVA esclusa x coefficiente / 100.
// Condizioni del PDF: pagamento trimestrale anticipato; mensile anticipato solo sopra i
// 12.000 euro con maggiorazione del 5%; assicurazione obbligatoria, non inclusa.
// 72 mesi su tutte le fasce; 84 mesi "non previsto sotto 40.000 euro".
// Il PDF ha anche i 30 mesi: sono qui sotto, ma ESG_DURATE non li espone.

export const ESG_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
  24: [
    { da: 800, a: 2000, c: 4.652 },
    { da: 2001, a: 8000, c: 4.631 },
    { da: 8001, a: 20000, c: 4.61 },
    { da: 20001, a: 40000, c: 4.6 },
    { da: 40001, a: 80000, c: 4.59 },
    { da: 80001, a: 120000, c: 4.58 },
    { da: 120001, a: 160000, c: 4.569 },
    { da: 160001, a: 240000, c: 4.549 },
  ],
  30: [
    { da: 800, a: 2000, c: 3.806 },
    { da: 2001, a: 8000, c: 3.786 },
    { da: 8001, a: 20000, c: 3.765 },
    { da: 20001, a: 40000, c: 3.744 },
    { da: 40001, a: 80000, c: 3.734 },
    { da: 80001, a: 120000, c: 3.724 },
    { da: 120001, a: 160000, c: 3.714 },
    { da: 160001, a: 240000, c: 3.693 },
  ],
  36: [
    { da: 800, a: 2000, c: 3.239 },
    { da: 2001, a: 8000, c: 3.218 },
    { da: 8001, a: 20000, c: 3.188 },
    { da: 20001, a: 40000, c: 3.167 },
    { da: 40001, a: 80000, c: 3.157 },
    { da: 80001, a: 120000, c: 3.147 },
    { da: 120001, a: 160000, c: 3.136 },
    { da: 160001, a: 240000, c: 3.116 },
  ],
  48: [
    { da: 800, a: 2000, c: 2.538 },
    { da: 2001, a: 8000, c: 2.517 },
    { da: 8001, a: 20000, c: 2.486 },
    { da: 20001, a: 40000, c: 2.455 },
    { da: 40001, a: 80000, c: 2.445 },
    { da: 80001, a: 120000, c: 2.435 },
    { da: 120001, a: 160000, c: 2.425 },
    { da: 160001, a: 240000, c: 2.404 },
  ],
  60: [
    { da: 800, a: 2000, c: 2.114 },
    { da: 2001, a: 8000, c: 2.094 },
    { da: 8001, a: 20000, c: 2.063 },
    { da: 20001, a: 40000, c: 2.032 },
    { da: 40001, a: 80000, c: 2.012 },
    { da: 80001, a: 120000, c: 1.991 },
    { da: 120001, a: 160000, c: 1.981 },
    { da: 160001, a: 240000, c: 1.971 },
  ],
  72: [
    { da: 800, a: 2000, c: 1.835 },
    { da: 2001, a: 8000, c: 1.815 },
    { da: 8001, a: 20000, c: 1.784 },
    { da: 20001, a: 40000, c: 1.754 },
    { da: 40001, a: 80000, c: 1.733 },
    { da: 80001, a: 120000, c: 1.713 },
    { da: 120001, a: 160000, c: 1.702 },
    { da: 160001, a: 240000, c: 1.692 },
  ],
  84: [
    { da: 40001, a: 80000, c: 1.578 },
    { da: 80001, a: 120000, c: 1.567 },
    { da: 120001, a: 160000, c: 1.557 },
    { da: 160001, a: 240000, c: 1.547 },
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
