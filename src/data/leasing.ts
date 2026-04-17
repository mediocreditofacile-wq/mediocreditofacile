// --- Calcolo rata leasing finanziario (ammortamento alla francese) ---
// Fonte: preventivo l4b (tasso leasing 6,24%, Euribor 3M)

// Default dal preventivo di riferimento
export const LEASING_DEFAULTS = {
  tan: 6.24,           // TAN % annuo (base Euribor 3M al 17/04/2026)
  anticipoPerc: 20,    // Anticipo / maxicanone (% del costo)
  riscattoPerc: 1,     // Riscatto finale (%)
  speseIstruttoria: 800, // Euro, solo informativo
};

// Durate disponibili per leasing FV (no 24 mesi)
export const DURATE_LEASING = [36, 48, 60, 72, 84];

// Opzioni anticipo selezionabili
export const ANTICIPO_OPTIONS = [0, 10, 15, 20];

/**
 * Calcola la rata mensile con ammortamento alla francese.
 * Il primo mese corrisponde all'anticipo, le rate successive sono n-1.
 */
export function calcolaRataLeasing(
  costoImpianto: number,
  durataMesi: number,
  tanPerc: number,
  anticipoPerc: number,
  riscattoPerc: number,
): { rataMensile: number; anticipo: number; riscatto: number; capitaleFin: number; numRate: number } {
  const anticipo = costoImpianto * (anticipoPerc / 100);
  const riscatto = costoImpianto * (riscattoPerc / 100);
  const numRate = durataMesi - 1; // primo mese = anticipo

  if (tanPerc <= 0 || numRate <= 0) {
    const capitaleFin = costoImpianto - anticipo;
    return { rataMensile: capitaleFin / Math.max(numRate, 1), anticipo, riscatto, capitaleFin, numRate };
  }

  const r = tanPerc / 100 / 12; // tasso mensile
  // Sottrarre il valore attuale del riscatto dal capitale (come nella prassi leasing)
  const pvRiscatto = riscatto / Math.pow(1 + r, numRate);
  const capitaleFin = costoImpianto - anticipo - pvRiscatto;
  const rataMensile = capitaleFin * (r * Math.pow(1 + r, numRate)) / (Math.pow(1 + r, numRate) - 1);

  return { rataMensile, anticipo, riscatto, capitaleFin, numRate };
}


// --- Iperammortamento 4.0 (L. 199/2025) ---
// Validita': 1 gennaio 2026 — 30 settembre 2028
// Requisiti: beni nuovi con caratteristiche 4.0, perizia asseverata sopra €300k

const IPER_FASCE = [
  { fino: 2_500_000, maggiorazionePerc: 180 },  // costo ammortizzabile 280%
  { fino: 10_000_000, maggiorazionePerc: 100 },  // 200%
  { fino: 20_000_000, maggiorazionePerc: 50 },   // 150%
];

const ALIQUOTA_IRES = 0.24;
const ANNI_AMMORTAMENTO_FV = 9; // coefficiente 11,11% — impianti FER

export function calcolaIperammortamento(costoImpianto: number): {
  maggiorazionePerc: number;
  maggiorazione: number;
  costoAmmortizzabileTotale: number;
  beneficioFiscaleTotale: number;
  beneficioAnnuo: number;
  beneficioMensile: number;
} {
  const fascia = IPER_FASCE.find(f => costoImpianto <= f.fino);
  const maggiorazionePerc = fascia?.maggiorazionePerc ?? 0;
  const maggiorazione = costoImpianto * (maggiorazionePerc / 100);

  // Beneficio fiscale = (ammortamento ordinario + maggiorazione) × IRES
  // L'ammortamento ordinario (100%) genera gia' un risparmio fiscale di suo,
  // ma qui calcoliamo SOLO il beneficio AGGIUNTIVO della maggiorazione
  // perche' l'ammortamento ordinario si avrebbe comunque
  const costoAmmortizzabileTotale = costoImpianto + maggiorazione;
  const beneficioFiscaleTotale = maggiorazione * ALIQUOTA_IRES;
  const beneficioAnnuo = beneficioFiscaleTotale / ANNI_AMMORTAMENTO_FV;
  const beneficioMensile = beneficioAnnuo / 12;

  return {
    maggiorazionePerc,
    maggiorazione,
    costoAmmortizzabileTotale,
    beneficioFiscaleTotale,
    beneficioAnnuo,
    beneficioMensile,
  };
}


// --- Contributo Sabatini 4.0 ---
// Contributo MISE in 6 quote annuali per investimenti 4.0 in leasing/acquisto.
// Dal preventivo l4b: €12.110,40 su €120.000 = ~10,09%
// Calcolo semplificato: percentuale fissa sull'investimento (modificabile dall'utente)

export const SABATINI_DEFAULT_PERC = 10; // % dell'investimento

export function calcolaSabatini(costoImpianto: number, percContributo: number): {
  contributoTotale: number;
  contributoAnnuo: number;
  contributoMensile: number;
} {
  const contributoTotale = costoImpianto * (percContributo / 100);
  const contributoAnnuo = contributoTotale / 6; // 6 quote annuali
  const contributoMensile = contributoAnnuo / 12;

  return { contributoTotale, contributoAnnuo, contributoMensile };
}
