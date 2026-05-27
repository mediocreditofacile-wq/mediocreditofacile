/**
 * Modello energetico fotovoltaico — riutilizzabile tra i simulatori MCF.
 *
 * Estratto da `src/components/tools/SimulatoreFotovoltaico.tsx` per essere
 * condiviso con `SimulatoreEconocomPA.tsx` (e in futuro altri tool che
 * vogliano calcolare il bilancio energetico di un impianto FV senza
 * replicare costanti e formule).
 *
 * Niente UI qui, niente React: solo costanti energetiche + funzioni pure.
 */

// === Costanti energetiche ===

/** Prezzo medio kWh PMI Italia (aprile 2026, conservativo). */
export const ENERGY_PRICE_DEFAULT = 0.28;

/** Valore di immissione in rete (ritiro dedicato GSE). */
export const FEED_IN_PRICE = 0.13;

/** Irraggiamento medio per zona (kWh/kWp/anno — fonte PVGIS). */
export const IRRADIANCE: Record<string, number> = {
  nord: 1100,
  centro: 1275,
  sud: 1425,
  isole: 1525,
};

export const ZONE_LABELS: Record<string, string> = {
  nord: 'Nord Italia',
  centro: 'Centro Italia',
  sud: 'Sud Italia',
  isole: 'Sicilia / Sardegna',
};

/**
 * Load match: quota di consumo che avviene durante le ore di produzione FV (8-18).
 * Fonti: HTW Berlin (Quaschning 2014), GSE Italia 2022-2024, validato su BP Le Pajare.
 */
export const LOAD_MATCH: Record<string, number> = {
  industriale: 0.58,   // turno pieno 8-18, consumi concentrati
  commerciale: 0.48,   // uffici/negozi 9-19
  residenziale: 0.35,  // picco serale 18-22
  ricettivo: 0.45,     // hotel/ristorante, consumo estivo alto
};

export const ATTIVITA_LABELS: Record<string, string> = {
  industriale: 'Industriale / Artigianale',
  commerciale: 'Commerciale / Ufficio',
  residenziale: 'Residenziale',
};

/**
 * Etichette PA-friendly per i tipi attivita' (usate dal simulatore Econocom PA).
 * Mappano sugli stessi load match di cui sopra, ma con linguaggio adatto agli enti pubblici.
 */
export const ATTIVITA_LABELS_PA: Record<string, string> = {
  industriale: 'Ospedale / Struttura 24/7',
  commerciale: 'Ufficio / Sede amministrativa',
  residenziale: 'Presidio territoriale / consumo serale',
};

// === Funzioni pure ===

/**
 * Calcola la percentuale di autoconsumo in base al rapporto reale produzione/consumo.
 * Il consumo annuo e' derivato dalla bolletta mensile diviso il prezzo medio kWh.
 */
export function calcolaAutoconsumo(
  produzioneAnnua: number,
  consumoAnnuo: number,
  capacitaAccumulo: number,
  profiloConsumo: string,
): { autoconsumoPerc: number; autosufficienzaPerc: number } {
  if (consumoAnnuo <= 0 || produzioneAnnua <= 0) {
    return { autoconsumoPerc: 0.50, autosufficienzaPerc: 0 };
  }

  const R = produzioneAnnua / consumoAnnuo;
  const loadMatch = LOAD_MATCH[profiloConsumo] ?? 0.48;

  // Autoconsumo diretto a R=1 (punto di calibrazione)
  const scAtR1 = loadMatch + 0.10;

  // Componente diretta (senza batteria)
  let autoconsumoBase: number;
  if (R <= 1.0) {
    // Sotto-dimensionato: quasi tutto autoconsumato, ma limitato dal mismatch orario
    autoconsumoBase = 1.0 - (1.0 - scAtR1) * Math.pow(R, 1.3);
  } else {
    // Sovra-dimensionato: cala con curva iperbolica
    autoconsumoBase = scAtR1 * Math.pow(1 / R, 0.75);
  }

  // Componente accumulo
  let bonusBatteria = 0;
  if (capacitaAccumulo > 0) {
    const efficienzaRT = 0.90;
    const fattoreDisponibilita = 0.85; // non tutti i giorni ciclo pieno
    const prodGiorno = produzioneAnnua / 365;
    const consGiorno = consumoAnnuo / 365;

    const eccedenza = prodGiorno * (1 - autoconsumoBase);
    const consumoNotturno = consGiorno * (1 - loadMatch);
    const cicli = Math.min(1.0, eccedenza / Math.max(1, capacitaAccumulo));
    const catturata = capacitaAccumulo * cicli * fattoreDisponibilita;
    const restituita = Math.min(catturata * efficienzaRT, consumoNotturno);

    bonusBatteria = restituita / prodGiorno;
    bonusBatteria = Math.min(bonusBatteria, 0.95 - autoconsumoBase);
    bonusBatteria = Math.max(0, bonusBatteria);
  }

  const autoconsumoPerc = Math.max(0.15, Math.min(0.95, autoconsumoBase + bonusBatteria));
  const autoconsumokWh = produzioneAnnua * autoconsumoPerc;
  const autosufficienzaPerc = Math.min(1.0, autoconsumokWh / consumoAnnuo);

  return { autoconsumoPerc, autosufficienzaPerc };
}

export interface BilancioEnergetico {
  /** kWh prodotti in un anno. */
  produzioneAnnua: number;
  /** kWh consumati in un anno (derivati da bolletta / prezzo kWh). */
  consumoAnnuo: number;
  /** Quota di produzione consumata in loco (0-1). */
  autoconsumoPerc: number;
  /** Quota di consumo coperta dall'impianto (0-1). */
  autosufficienzaPerc: number;
  /** kWh autoconsumati in un anno. */
  kwhAutoconsumo: number;
  /** kWh immessi in rete in un anno. */
  kwhImmissione: number;
  /** Prezzo kWh effettivo usato per il calcolo (oggi pari a ENERGY_PRICE_DEFAULT). */
  prezzoKwh: number;
  /** Risparmio in bolletta dato dall'autoconsumo (€/mese). */
  risparmioAutoconsumoMensile: number;
  /** Ricavo dall'immissione in rete (€/mese). */
  valoreImmissioneMensile: number;
  /** Beneficio totale mensile: autoconsumo + immissione. */
  risparmioMensileTotale: number;
}

/**
 * Calcola il bilancio energetico mensile di un impianto FV.
 * Restituisce `null` se i parametri non sono validi (potenza, zona o bolletta nulla/negativa).
 *
 * @param potenzaKwp     Potenza nominale dell'impianto in kWp
 * @param accumuloKwh    Capacita' della batteria in kWh (0 = senza accumulo)
 * @param zona           Zona di irraggiamento (chiave di IRRADIANCE)
 * @param profilo        Profilo di consumo (chiave di LOAD_MATCH)
 * @param bollettaMese   Bolletta elettrica attuale del cliente (€/mese)
 */
export function calcolaBilancioEnergetico(
  potenzaKwp: number,
  accumuloKwh: number,
  zona: string,
  profilo: string,
  bollettaMese: number,
): BilancioEnergetico | null {
  if (potenzaKwp <= 0 || bollettaMese <= 0) return null;

  const irraggiamento = IRRADIANCE[zona] ?? IRRADIANCE.nord;
  const produzioneAnnua = potenzaKwp * irraggiamento;
  const prezzoKwh = ENERGY_PRICE_DEFAULT;
  const consumoAnnuo = (bollettaMese * 12) / prezzoKwh;

  const { autoconsumoPerc, autosufficienzaPerc } = calcolaAutoconsumo(
    produzioneAnnua, consumoAnnuo, accumuloKwh, profilo,
  );

  const kwhAutoconsumo = produzioneAnnua * autoconsumoPerc;
  const kwhImmissione = produzioneAnnua * (1 - autoconsumoPerc);
  const risparmioAutoconsumoMensile = (kwhAutoconsumo * prezzoKwh) / 12;
  const valoreImmissioneMensile = (kwhImmissione * FEED_IN_PRICE) / 12;
  const risparmioMensileTotale = risparmioAutoconsumoMensile + valoreImmissioneMensile;

  return {
    produzioneAnnua,
    consumoAnnuo,
    autoconsumoPerc,
    autosufficienzaPerc,
    kwhAutoconsumo,
    kwhImmissione,
    prezzoKwh,
    risparmioAutoconsumoMensile,
    valoreImmissioneMensile,
    risparmioMensileTotale,
  };
}
