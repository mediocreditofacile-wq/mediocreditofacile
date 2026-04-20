// --- Coefficienti Grenke reali (tabella Sputnik++++, pagamento trimestrale) ---
// Fonte: Grenke Italia SpA — Rete Rent
// Struttura: per ogni durata, array di fasce { da, a, c } ordinate per importo crescente

export const GRENKE_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
  24: [
    { da: 500, a: 2500, c: 5.014 },
    { da: 2501, a: 5000, c: 5.011 },
    { da: 5001, a: 12000, c: 4.967 },
    { da: 12001, a: 25000, c: 4.959 },
    { da: 25001, a: 50000, c: 4.882 },
    { da: 50001, a: 500000, c: 4.82 },
  ],
  30: [
    { da: 500, a: 2500, c: 4.049 },
    { da: 2501, a: 5000, c: 4.03 },
    { da: 5001, a: 12000, c: 3.998 },
    { da: 12001, a: 25000, c: 3.973 },
    { da: 25001, a: 50000, c: 3.955 },
    { da: 50001, a: 500000, c: 3.911 },
  ],
  36: [
    { da: 500, a: 2500, c: 3.634 },
    { da: 2501, a: 5000, c: 3.541 },
    { da: 5001, a: 12000, c: 3.472 },
    { da: 12001, a: 25000, c: 3.448 },
    { da: 25001, a: 50000, c: 3.41 },
    { da: 50001, a: 500000, c: 3.406 },
  ],
  48: [
    { da: 500, a: 2500, c: 3.069 },
    { da: 2501, a: 5000, c: 2.742 },
    { da: 5001, a: 12000, c: 2.712 },
    { da: 12001, a: 25000, c: 2.679 },
    { da: 25001, a: 50000, c: 2.677 },
    { da: 50001, a: 500000, c: 2.674 },
  ],
  60: [
    { da: 500, a: 2500, c: 2.672 },
    { da: 2501, a: 5000, c: 2.315 },
    { da: 5001, a: 12000, c: 2.277 },
    { da: 12001, a: 25000, c: 2.246 },
    { da: 25001, a: 50000, c: 2.212 },
    { da: 50001, a: 500000, c: 2.149 },
  ],
};

// --- Tabella riscatti per tipologia bene (fonte: tariffario ufficiale) ---
export const RISCATTI: Record<string, Record<number, number | null>> = {
  'PC e Workstation': { 24: 10, 30: 7, 36: 7, 48: 4, 60: 3, 72: null, 84: null },
  'PC e Workstation Apple': { 24: 12, 30: 10, 36: 10, 48: 6, 60: 4, 72: null, 84: null },
  Notebook: { 24: 12, 30: 8, 36: 8, 48: 5, 60: 4, 72: null, 84: null },
  'Notebook Apple': { 24: 15, 30: 10, 36: 10, 48: 7, 60: 5, 72: null, 84: null },
  'Tablet / Smartphone': { 24: 12, 30: 8, 36: 8, 48: 5, 60: 4, 72: null, 84: null },
  Multifunzione: { 24: 6, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  Server: { 24: 7, 30: 5, 36: 5, 48: 3, 60: 2, 72: null, 84: null },
  'Monitor / TV': { 24: 8, 30: 6, 36: 6, 48: 4, 60: 3, 72: null, 84: null },
  'Stampanti / Plotter / Fax': { 24: 6, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  Fotocamere: { 24: 15, 30: 10, 36: 10, 48: 6, 60: 5, 72: null, 84: null },
  'Videosorveglianza / Allarme': { 24: 7, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  'Impianti Telefonici': { 24: 7, 30: 4, 36: 4, 48: 3, 60: 2, 72: null, 84: null },
  'Strumenti di Misurazione': { 24: 8, 30: 6, 36: 6, 48: 4, 60: 2, 72: null, 84: null },
  'Bilance Elettroniche': { 24: 8, 30: 5, 36: 5, 48: 4, 60: 2, 72: null, 84: null },
  'Sistemi di Cassa': { 24: 8, 30: 5, 36: 5, 48: 4, 60: 2, 72: null, 84: null },
  'Strumenti Elettromedicali': { 24: 9, 30: 6, 36: 6, 48: 4, 60: 3, 72: null, 84: null },
  'Arredamento per Ufficio': { 24: 6, 30: 5, 36: 5, 48: 3, 60: 2, 72: null, 84: null },
  'Software Gestionali / CAD': { 24: 0, 30: 0, 36: 0, 48: 0, 60: 0, 72: null, 84: null },
  'Altri Beni Strumentali': { 24: 10, 30: 6, 36: 6, 48: 4, 60: 3, 72: null, 84: null },
  Fotovoltaico: { 24: 10, 30: 6, 36: 6, 48: 4, 60: 3, 72: 3, 84: 3 },
};

// Durate disponibili
export const DURATE_BASE = [24, 30, 36, 48, 60];
export const DURATE_FOTOVOLTAICO = [24, 30, 36, 48, 60, 72, 84];

// --- Coefficienti Grenke Pioneer++++ (Software Gestionali / CAD — riscatto 0%) ---
// Fonte: Tabella PIONEER ++++.pdf — Kit collaboratore Grenke / ReteRent
// Fascia max 100.000 (non 500.000 come Sputnik)
export const PIONEER_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
  24: [
    { da: 500, a: 2500, c: 4.936 },
    { da: 2501, a: 5000, c: 4.933 },
    { da: 5001, a: 12000, c: 4.889 },
    { da: 12001, a: 25000, c: 4.881 },
    { da: 25001, a: 50000, c: 4.804 },
    { da: 50001, a: 100000, c: 4.743 },
  ],
  30: [
    { da: 500, a: 2500, c: 3.967 },
    { da: 2501, a: 5000, c: 3.948 },
    { da: 5001, a: 12000, c: 3.917 },
    { da: 12001, a: 25000, c: 3.892 },
    { da: 25001, a: 50000, c: 3.874 },
    { da: 50001, a: 100000, c: 3.830 },
  ],
  36: [
    { da: 500, a: 2500, c: 3.548 },
    { da: 2501, a: 5000, c: 3.455 },
    { da: 5001, a: 12000, c: 3.387 },
    { da: 12001, a: 25000, c: 3.363 },
    { da: 25001, a: 50000, c: 3.326 },
    { da: 50001, a: 100000, c: 3.322 },
  ],
  48: [
    { da: 500, a: 2500, c: 2.976 },
    { da: 2501, a: 5000, c: 2.652 },
    { da: 5001, a: 12000, c: 2.623 },
    { da: 12001, a: 25000, c: 2.590 },
    { da: 25001, a: 50000, c: 2.588 },
    { da: 50001, a: 100000, c: 2.586 },
  ],
  60: [
    { da: 500, a: 2500, c: 2.573 },
    { da: 2501, a: 5000, c: 2.221 },
    { da: 5001, a: 12000, c: 2.184 },
    { da: 12001, a: 25000, c: 2.154 },
    { da: 25001, a: 50000, c: 2.120 },
    { da: 50001, a: 100000, c: 2.059 },
  ],
};

// Trova il coefficiente Pioneer per un valore e una durata
export function getPioneerCoeff(valore: number, durata: number): number | null {
  const fasce = PIONEER_COEFFS[durata];
  if (!fasce) return null;
  const fascia = fasce.find((f) => valore >= f.da && valore <= f.a);
  return fascia ? fascia.c : null;
}

// Trova il coefficiente Grenke per un valore e una durata (solo durate standard 24-60)
export function getCoeff(valore: number, durata: number): number | null {
  const fasce = GRENKE_COEFFS[durata];
  if (!fasce) return null;
  const fascia = fasce.find((f) => valore >= f.da && valore <= f.a);
  return fascia ? fascia.c : null;
}

// Coefficiente con aggiustamento per durate 72/84 mesi (solo fotovoltaico)
// Per 72 e 84 mesi non esistono coefficienti Grenke standard:
// si usa il coefficiente della durata 60 con una riduzione proporzionale
export function getAdjustedCoeff(valore: number, durata: number): number | null {
  if (durata === 72) {
    const c = getCoeff(valore, 60);
    return c ? c * 0.88 : null;
  }
  if (durata === 84) {
    const c = getCoeff(valore, 60);
    return c ? c * 0.79 : null;
  }
  return getCoeff(valore, durata);
}

// Formattazione euro (locale italiano)
export function eur(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}
