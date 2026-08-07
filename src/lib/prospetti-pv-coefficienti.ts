// Coefficienti e parametri dei prospetti fotovoltaico (portale InnovaLux).
//
// ATTENZIONE — FILE SERVER-ONLY. Vive in src/lib/ e non deve MAI essere importato
// da un componente .tsx montato come isola: finirebbe nel bundle pubblico. I
// coefficienti sono dati commerciali riservati, in output esce solo il canone.
// Il gemello src/data/esg.ts (tabella ESG++++ del portale Expo Energia) e' invece
// gia' client-side: sono due tabelle DIVERSE, non allinearle senza verifica.
//
// Fonte: Guida Operativa Rete Rent-Grenke, ultimo aggiornamento marzo 2026.
// E' la griglia che ha prodotto i prospetti validati a mano (B Service 09/07/2026,
// Giaccio Cesare 03/08/2026): cambiarla cambia ogni canone gia' comunicato.
//
// DA CHIARIRE (03/08/2026): Alberto ha indicato PagaRent come canale su cui
// lavorare i noleggi InnovaLux. La tabella PagaRent pero' e' un'altra cosa
// (src/data/pagarent.ts, durate 24-60, a 60 mesi 2,346% contro 2,012% di qui:
// su 24.980 euro fanno 586 euro di canone invece di 507,59) e non riprodurrebbe
// i prospetti gia' emessi. Finche' non e' chiarito si resta su questa griglia.
// Per passare a PagaRent basta sostituire COEFFICIENTI, FASCE e DURATE qui:
// il resto del motore non conosce la provenienza dei numeri.
//
// Il canale non compare mai in output, ne' qui ne' nei PDF.
//
// Per aggiornare i coefficienti: si tocca solo questo file. Il microservizio PDF
// li riceve nel payload, quindi non serve ridistribuirlo.

/** Canone mensile = importo netto x coefficiente / 100 */
export const COEFFICIENTI: Record<string, Record<number, number>> = {
  f1: { 36: 3.227, 48: 2.527, 60: 2.103, 72: 1.824 },
  f2: { 36: 3.188, 48: 2.486, 60: 2.063, 72: 1.784 },
  f3: { 36: 3.167, 48: 2.455, 60: 2.032, 72: 1.753 },
  f4: { 36: 3.147, 48: 2.434, 60: 2.012, 72: 1.733 },
};

/** Soglie delle fasce di importo (imponibile in euro) */
export const FASCE: { fino: number; fascia: string }[] = [
  { fino: 8000, fascia: 'f1' },
  { fino: 20000, fascia: 'f2' },
  { fino: 40000, fascia: 'f3' },
  { fino: Infinity, fascia: 'f4' },
];

/** Riscatto finale fotovoltaico, in % dell'imponibile. Valori medi indicativi:
 *  il prezzo effettivo si definisce a fine contratto sullo stato del bene. */
export const RISCATTO: Record<number, number> = { 36: 6, 48: 4, 60: 3, 72: 3 };

export const DURATE: number[] = [36, 48, 60, 72];

// === Fiscalita' ===
export const IRES = 0.24;
export const IRAP = 0.039;
/** Detrazione per privati senza partita IVA, in 10 quote annuali */
export const DETRAZIONE_PRIVATI = 0.5;

// === Leasing finanziario di confronto ===
export const LEASING_TASSO = 0.06;
export const LEASING_RISCATTO = 0.01;

// === Agevolazioni (solo sul ramo leasing, precluse al noleggio operativo) ===
/** Nuova Sabatini Green: contributo in % dell'investimento */
export const SABATINI_PCT = 0.1008;
export const SABATINI_COSTO_GESTIONE = 900;
/** Iperammortamento 2026 (L. 199/2025, commi 427-436): maggiorazione del costo */
export const IPER_PCT = 1.8;
export const IPER_COSTO_GESTIONE = 3000;

// === Modello energetico ===
/** Irraggiamento kWh/kWp/anno. Valore basso della fascia: stima prudente. */
export const IRRAGGIAMENTO: Record<string, number> = {
  nord: 1150,
  centro: 1300,
  sud: 1450,
};

export const ZONA_LABEL: Record<string, string> = {
  nord: 'Nord Italia',
  centro: 'Centro Italia',
  sud: 'Sud Italia e isole',
};

/** Prezzo energia di default quando manca la bolletta del cliente (euro/kWh) */
export const PREZZO_KWH_DEFAULT = 0.25;
/** Valorizzazione dell'energia ceduta in rete (euro/kWh) */
export const PREZZO_CESSIONE = 0.1;

/** Autoconsumo senza accumulo, per profilo di consumo */
export const AUTOCONSUMO_BASE: Record<string, number> = {
  diurno: 0.4, // consumi concentrati nelle ore di produzione: 35-45%
  h24: 0.55, // attivita' continua: 50-65%
};

/**
 * Autoconsumo con accumulo, per rapporto kWh accumulo su kWp installato.
 * Regola operativa in uso: 60% attorno a 0,5 kWh/kWp, 65% attorno a 1,0.
 * Interpolazione lineare tra i due punti, poi cappata da AUTOCONSUMO_MAX.
 */
export const ACCUMULO_PUNTI: { rapporto: number; quota: number }[] = [
  { rapporto: 0.5, quota: 0.6 },
  { rapporto: 1.0, quota: 0.65 },
];

/** Tetto invalicabile: e' una stima, non una promessa. */
export const AUTOCONSUMO_MAX = 0.75;

/**
 * Provincia (sigla) -> zona di irraggiamento.
 * Le province non mappate ricadono su 'centro', che e' il default meno esposto.
 */
export const PROVINCE_ZONA: Record<string, string> = {
  // Nord
  TO: 'nord', VC: 'nord', NO: 'nord', CN: 'nord', AT: 'nord', AL: 'nord', BI: 'nord', VB: 'nord',
  AO: 'nord',
  VA: 'nord', CO: 'nord', SO: 'nord', MI: 'nord', BG: 'nord', BS: 'nord', PV: 'nord', CR: 'nord',
  MN: 'nord', LC: 'nord', LO: 'nord', MB: 'nord',
  BZ: 'nord', TN: 'nord',
  VR: 'nord', VI: 'nord', BL: 'nord', TV: 'nord', VE: 'nord', PD: 'nord', RO: 'nord',
  UD: 'nord', GO: 'nord', TS: 'nord', PN: 'nord',
  IM: 'nord', SV: 'nord', GE: 'nord', SP: 'nord',
  PC: 'nord', PR: 'nord', RE: 'nord', MO: 'nord', BO: 'nord', FE: 'nord', RA: 'nord', FC: 'nord',
  RN: 'nord',
  // Centro
  MS: 'centro', LU: 'centro', PT: 'centro', FI: 'centro', LI: 'centro', PI: 'centro', AR: 'centro',
  SI: 'centro', GR: 'centro', PO: 'centro',
  PG: 'centro', TR: 'centro',
  PU: 'centro', AN: 'centro', MC: 'centro', AP: 'centro', FM: 'centro',
  VT: 'centro', RI: 'centro', RM: 'centro', LT: 'centro', FR: 'centro',
  AQ: 'centro', TE: 'centro', PE: 'centro', CH: 'centro',
  // Sud e isole
  IS: 'sud', CB: 'sud',
  CE: 'sud', BN: 'sud', NA: 'sud', AV: 'sud', SA: 'sud',
  FG: 'sud', BA: 'sud', TA: 'sud', BR: 'sud', LE: 'sud', BT: 'sud',
  PZ: 'sud', MT: 'sud',
  CS: 'sud', CZ: 'sud', RC: 'sud', KR: 'sud', VV: 'sud',
  TP: 'sud', PA: 'sud', ME: 'sud', AG: 'sud', CL: 'sud', EN: 'sud', CT: 'sud', RG: 'sud', SR: 'sud',
  SS: 'sud', NU: 'sud', CA: 'sud', OR: 'sud', SU: 'sud',
};
