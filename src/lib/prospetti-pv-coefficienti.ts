// Parametri dei prospetti fotovoltaico (portale InnovaLux).
//
// ATTENZIONE — FILE SERVER-ONLY. Vive in src/lib/ e non deve MAI essere importato
// da un componente .tsx montato come isola.
//
// CANALE: PagaRent, noleggio operativo (indicazione Alberto, 07/08/2026).
// I coefficienti NON sono duplicati qui: arrivano da src/data/pagarent.ts, che
// li ha rilevati dal calcolatore ufficiale ed e' gia' la fonte di verita' per il
// portale UNIDIMA. Aggiornarli in quel file aggiorna anche i prospetti.
//
// STORICO: fino al 07/08/2026 si usava la griglia Rete Rent-Grenke a quattro
// fasce (36/48/60/72 mesi, a 60 mesi 2,012%). E' quella che ha prodotto i
// prospetti consegnati a B Service il 09/07/2026 e a Giaccio Cesare il
// 03/08/2026: quei due documenti non sono piu' riproducibili dal portale, i
// canoni PagaRent sono piu' alti di circa il 15 per cento.

import { PAGARENT_MAX, PAGARENT_MIN, getPagarentCoeff } from '../data/pagarent';

/** Durate esposte nei prospetti. PagaRent quota 24-60: i 72 mesi non esistono. */
export const DURATE: number[] = [24, 36, 48, 60];

/** Importi entro cui PagaRent e' stato verificato sul calcolatore */
export const IMPORTO_MIN = PAGARENT_MIN;
export const IMPORTO_MAX = PAGARENT_MAX;

/**
 * Coefficiente della durata per un dato importo: canone = importo x c / 100.
 * Null se l'importo cade fuori dal range quotabile.
 */
export function coefficiente(importo: number, durata: number): number | null {
  return getPagarentCoeff(importo, durata);
}

/**
 * Riscatto finale, in % dell'imponibile. Valori medi indicativi: il prezzo
 * effettivo si definisce a fine contratto sullo stato del bene.
 *
 * ATTENZIONE: sono i valori della vecchia griglia Grenke, tenuti su indicazione
 * di Alberto in mancanza dei riscatti PagaRent. Il 24 mesi non esisteva e riusa
 * il valore del 36: e' l'unico numero di questo file senza una fonte, da
 * correggere appena PagaRent comunica i suoi.
 */
export const RISCATTO: Record<number, number> = { 24: 6, 36: 6, 48: 4, 60: 3 };

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
