import { useState, useMemo } from 'preact/hooks';
import './simulatore-fotovoltaico.css';
import {
  calcolaRataLeasing,
  calcolaIperammortamento,
  calcolaSabatini,
  calcolaZES,
  LEASING_DEFAULTS,
  DURATE_LEASING,
  ANTICIPO_OPTIONS,
  SABATINI_DEFAULT_PERC,
  ZES_REGIONI,
  DIMENSIONE_LABELS,
  type DimensioneImpresa,
} from '../../data/leasing';

// Limiti costo impianto per modalita' finanziaria
// Il noleggio operativo e' limitato dalle fasce dei coefficienti GRENKE (max 240k)
// Il leasing finanziario non ha tetto commerciale: alziamo a 500M per coprire qualsiasi impianto industriale
const MAX_COSTO_NOLEGGIO = 240_000;
const MAX_COSTO_LEASING = 500_000_000;
const MIN_COSTO = 800;

// --- Coefficienti GRENKE ESG++++ (fonte: Tabella ESG ++++.pdf) ---
const ESG_COEFFS: Record<number, { da: number; a: number; c: number }[]> = {
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

// Costanti finanziarie
const INSURANCE_RATE = 0.0183; // 1,83% annuo (fotovoltaico)
// Riscatto per durata (fonte: Valori di Ripresa Grenke — "Altri Beni Strumentali" / Fotovoltaico)
const RISCATTO_PV: Record<number, number> = {
  24: 0.10,  // 10%
  36: 0.06,  // 6%
  48: 0.04,  // 4%
  60: 0.03,  // 3%
  72: 0.03,  // 3% (esteso)
  84: 0.03,  // 3% (esteso)
};

function getRiscatto(durata: number): number {
  return RISCATTO_PV[durata] ?? 0.03;
}

// Costanti energetiche
const ENERGY_PRICE_DEFAULT = 0.28; // €/kWh prezzo medio PMI Italia (aprile 2026, conservativo)
const FEED_IN_PRICE = 0.13;        // €/kWh valore immissione in rete (ritiro dedicato)

// Irraggiamento medio per zona (kWh/kWp/anno — fonte PVGIS)
const IRRADIANCE: Record<string, number> = {
  nord: 1100,
  centro: 1275,
  sud: 1425,
  isole: 1525,
};

const ZONE_LABELS: Record<string, string> = {
  nord: 'Nord Italia',
  centro: 'Centro Italia',
  sud: 'Sud Italia',
  isole: 'Sicilia / Sardegna',
};

// --- Modello autoconsumo dinamico ---
// Fonti: HTW Berlin (Quaschning 2014), GSE Italia 2022-2024, validato su BP Le Pajare (MCF).
// L'autoconsumo dipende dal rapporto produzione/consumo, non dalla tipologia di attivita'.
// Il tipo attivita' influenza solo il load match (correlazione oraria produzione-consumo).

// Load match: quota di consumo che avviene durante le ore di produzione FV (8-18)
const LOAD_MATCH: Record<string, number> = {
  industriale: 0.58,    // turno pieno 8-18, consumi concentrati
  commerciale: 0.48,    // uffici/negozi 9-19
  residenziale: 0.35,   // picco serale 18-22
  ricettivo: 0.45,      // hotel/ristorante, consumo estivo alto
};

/**
 * Calcola la percentuale di autoconsumo in base al rapporto reale produzione/consumo.
 * Il consumo annuo e' derivato dalla bolletta mensile diviso il prezzo medio kWh.
 */
function calcolaAutoconsumo(
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

const ATTIVITA_LABELS: Record<string, string> = {
  industriale: 'Industriale / Artigianale',
  commerciale: 'Commerciale / Ufficio',
  residenziale: 'Residenziale',
};

const DURATE = [24, 36, 48, 60, 72, 84];

// Checklist documenti standard per richiesta pratica Grenke / Pagarent (variante EnergyTeam)
const ENERGYTEAM_DOCS = [
  'Visura camerale aggiornata',
  "Documento d'identità del legale rappresentante",
  'Codice fiscale del legale rappresentante',
  'IBAN',
  'Ultimi due bilanci depositati',
  'Situazione contabile provvisoria 2025',
];

// Checklist Arca Energia: stessi documenti base + condizionali per leasing/agevolazioni
const ARCAENERGIA_DOCS_BASE = [
  'Visura camerale aggiornata',
  "Documento d'identità del legale rappresentante",
  'Codice fiscale del legale rappresentante',
  'IBAN',
  'Ultimi due bilanci depositati',
  'Situazione contabile provvisoria 2025',
];
const ARCAENERGIA_DOCS_LEASING = ['Preventivo fornitore impianto'];
const ARCAENERGIA_DOCS_IPER = ['Perizia asseverata 4.0 (per investimenti > €300.000)'];
const ARCAENERGIA_DOCS_SABATINI = ['Dichiarazione dimensione impresa (PMI)'];
const ARCAENERGIA_DOCS_ZES = ['Visura camerale con sede in ZES', 'Dichiarazione dimensione impresa', 'DURC regolare'];

// Trova il coefficiente ESG per un importo e una durata
function getCoeff(importo: number, durata: number): number | null {
  const fasce = ESG_COEFFS[durata];
  if (!fasce) return null;
  const fascia = fasce.find((f) => importo >= f.da && importo <= f.a);
  return fascia ? fascia.c : null;
}

// Formatta in euro
function eur(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

// Interfaccia risultati per singola durata
interface RisultatoDurata {
  durata: number;
  coeff: number;
  canoneMensile: number;
  assicurazioneMensile: number;
  rataTotale: number;
  riscatto: number;
  riscattoPerc: number;
  // Solo leasing
  anticipo?: number;
  capitaleFin?: number;
  // Solo modalita BP
  risparmioMensile?: number;             // Totale: autoconsumo + immissione
  risparmioAutoconsumoMensile?: number;  // Abbatte la bolletta
  valoreImmissioneMensile?: number;      // Ricavo dalla vendita in rete (abbatte la rata)
  iperBeneficioMensile?: number;         // Beneficio iperammortamento mensile
  sabatiniBeneficioMensile?: number;     // Contributo Sabatini mensile
  zesBeneficioMensile?: number;          // Credito d'imposta ZES mensile (distribuito su 5 anni)
  costoNettoMensile?: number;            // bolletta - autoconsumo + rata - immissione - agevolazioni
  differenza?: number;                   // bolletta - costoNettoMensile (>0 = risparmio complessivo)
}

interface Props {
  modalitaPartner?: boolean;
  // Quando true: toggle che permette di includere / escludere l'assicurazione all-risk dalla rata.
  // Default OFF: la rata mostrata e' il canone puro, l'assicurazione e' solo informativa.
  assicurazioneOpzionale?: boolean;
  // Variante del form di richiesta in fondo al simulatore.
  varianteForm?: 'standard' | 'energyteam' | 'arcaenergia' | 'age-srl';
  // Se settata, forza un coefficiente di irraggiamento unico indipendentemente dalla zona selezionata.
  zonaFissa?: 'nord' | 'centro' | 'sud' | 'isole';
  // Quando true: mostra lo switch Noleggio Operativo / Leasing Finanziario
  abilitaLeasing?: boolean;
  // Quando true: mostra i toggle iperammortamento, Sabatini e ZES in modalita' leasing (indipendenti dal business plan)
  abilitaAgevolazioni?: boolean;
}

export default function SimulatoreFotovoltaico({
  modalitaPartner = false,
  assicurazioneOpzionale = false,
  varianteForm = 'standard',
  zonaFissa,
  abilitaLeasing = false,
  abilitaAgevolazioni = false,
}: Props) {
  // Modalita base vs business plan
  const [modalitaBP, setModalitaBP] = useState(false);

  // Campi sempre visibili
  const [costo, setCosto] = useState(0);
  const [costoInput, setCostoInput] = useState('');
  const [durata, setDurata] = useState(60);
  const [calcolato, setCalcolato] = useState(false);

  // Toggle assicurazione (usato solo se assicurazioneOpzionale=true). Default OFF.
  const [includiAssicurazione, setIncludiAssicurazione] = useState(false);

  // --- Leasing ---
  const [modalitaFin, setModalitaFin] = useState<'noleggio' | 'leasing'>('noleggio');
  const [anticipoPerc, setAnticipoPerc] = useState(LEASING_DEFAULTS.anticipoPerc);
  const [tanLeasing, setTanLeasing] = useState(LEASING_DEFAULTS.tan);
  const [tanInput, setTanInput] = useState(LEASING_DEFAULTS.tan.toString());
  const [riscattoLeasing, setRiscattoLeasing] = useState(LEASING_DEFAULTS.riscattoPerc);
  const [riscattoLeasingInput, setRiscattoLeasingInput] = useState(LEASING_DEFAULTS.riscattoPerc.toString());

  // --- Agevolazioni ---
  const [includiIper, setIncludiIper] = useState(false);
  const [includiSabatini, setIncludiSabatini] = useState(false);
  const [sabatiniPerc, setSabatiniPerc] = useState(SABATINI_DEFAULT_PERC);
  const [sabatiniPercInput, setSabatiniPercInput] = useState(SABATINI_DEFAULT_PERC.toString());
  const [includiZES, setIncludiZES] = useState(false);
  const [zesRegione, setZesRegione] = useState('puglia');
  const [zesDimensione, setZesDimensione] = useState<DimensioneImpresa>('piccola');

  // Modalita' finanziaria effettiva (leasing solo se abilitato)
  const isLeasing = abilitaLeasing && modalitaFin === 'leasing';
  // Agevolazioni visibili con leasing — indipendenti dal business plan
  const mostraAgevolazioni = abilitaAgevolazioni && isLeasing;
  // Limite massimo costo impianto: 500M in leasing, 240k in noleggio
  const maxCosto = isLeasing ? MAX_COSTO_LEASING : MAX_COSTO_NOLEGGIO;
  // ZES attivabile solo sopra €200.000
  const zesSogliaOk = costo >= 200000;
  // Se il costo scende sotto soglia, disattiva ZES
  useMemo(() => {
    if (!zesSogliaOk && includiZES) setIncludiZES(false);
  }, [zesSogliaOk]);
  // Se si passa da leasing a noleggio con costo sopra 240k, clampa al limite noleggio
  useMemo(() => {
    if (!isLeasing && costo > MAX_COSTO_NOLEGGIO) {
      setCosto(MAX_COSTO_NOLEGGIO);
      setCostoInput(MAX_COSTO_NOLEGGIO.toString());
      setCalcolato(false);
    }
  }, [isLeasing]);

  // Campi business plan (visibili solo con modalitaBP)
  const [potenza, setPotenza] = useState(6);
  const [potenzaInput, setPotenzaInput] = useState('6');
  const [accumulo, setAccumulo] = useState(0);
  const [accumuloInput, setAccumuloInput] = useState('');
  const [bolletta, setBolletta] = useState(250);
  const [bollettaInput, setBollettaInput] = useState('250');
  const [zona, setZona] = useState('nord');
  const [tipoAttivita, setTipoAttivita] = useState('commerciale');

  // Durate disponibili per l'importo corrente
  const durateDisponibili = useMemo(() => {
    if (isLeasing) return DURATE_LEASING;
    return DURATE.filter((d) => getCoeff(Math.max(costo, 800), d) !== null);
  }, [costo, isLeasing]);

  // Se la durata selezionata non e' disponibile, resetta a 60
  useMemo(() => {
    if (durateDisponibili.length > 0 && !durateDisponibili.includes(durata)) {
      setDurata(durateDisponibili[durateDisponibili.length - 1]);
    }
  }, [durateDisponibili]);

  // Zona effettiva: se e' stata passata una zonaFissa (variante EnergyTeam), ignora la selezione utente.
  const zonaEffettiva = zonaFissa ?? zona;

  // Calcolo produzione e risparmio energetico (solo modalita BP)
  const energetica = useMemo(() => {
    if (!modalitaBP || potenza <= 0 || bolletta <= 0) return null;

    const produzioneAnnua = potenza * (IRRADIANCE[zonaEffettiva] ?? 1100);
    // Consumo annuo derivato dalla bolletta (bolletta mensile × 12 / prezzo medio kWh)
    const consumoAnnuo = (bolletta * 12) / ENERGY_PRICE_DEFAULT;
    // Prezzo medio kWh effettivo del cliente (per calcolare il risparmio coerente)
    const prezzoKwh = ENERGY_PRICE_DEFAULT;

    // Autoconsumo calcolato dal rapporto reale produzione/consumo
    const { autoconsumoPerc: autoconsumoPct, autosufficienzaPerc } = calcolaAutoconsumo(
      produzioneAnnua, consumoAnnuo, accumulo, tipoAttivita,
    );

    const kwhAutoconsumo = produzioneAnnua * autoconsumoPct;
    const kwhImmissione = produzioneAnnua * (1 - autoconsumoPct);
    const risparmioAutoconsumo = kwhAutoconsumo * prezzoKwh / 12;
    const valoreImmissione = kwhImmissione * FEED_IN_PRICE / 12;
    const risparmioMensile = risparmioAutoconsumo + valoreImmissione;

    return {
      produzioneAnnua,
      consumoAnnuo,
      autoconsumoPct,
      autosufficienzaPerc,
      kwhAutoconsumo,
      kwhImmissione,
      risparmioMensile,
      risparmioAutoconsumoMensile: risparmioAutoconsumo,
      valoreImmissioneMensile: valoreImmissione,
      prezzoKwh,
    };
  }, [modalitaBP, potenza, accumulo, bolletta, zonaEffettiva, tipoAttivita]);

  // Funzione helper: calcola risultato per una durata specifica
  function calcolaPerDurata(d: number): RisultatoDurata | null {
    if (costo < MIN_COSTO || costo > maxCosto) return null;

    let coeff = 0;
    let canoneMensile = 0;
    let assicurazioneMensile = 0;
    let rataTotale = 0;
    let riscattoPerc = 0;
    let riscatto = 0;
    let anticipo: number | undefined;
    let capitaleFin: number | undefined;

    if (isLeasing) {
      // Calcolo leasing alla francese
      const leas = calcolaRataLeasing(costo, d, tanLeasing, anticipoPerc, riscattoLeasing);
      coeff = tanLeasing; // per tracking
      canoneMensile = leas.rataMensile;
      assicurazioneMensile = 0; // nel leasing la gestione assicurativa e' separata
      rataTotale = leas.rataMensile;
      riscattoPerc = riscattoLeasing / 100;
      riscatto = leas.riscatto;
      anticipo = leas.anticipo;
      capitaleFin = leas.capitaleFin;
    } else {
      // Calcolo noleggio operativo (coefficienti ESG++++)
      const c = getCoeff(costo, d);
      if (!c) return null;
      coeff = c;
      canoneMensile = (costo * c) / 100;
      assicurazioneMensile = (costo * INSURANCE_RATE) / 12;
      rataTotale = (assicurazioneOpzionale && !includiAssicurazione)
        ? canoneMensile
        : canoneMensile + assicurazioneMensile;
      riscattoPerc = getRiscatto(d);
      riscatto = costo * riscattoPerc;
    }

    const res: RisultatoDurata = {
      durata: d, coeff, canoneMensile, assicurazioneMensile, rataTotale,
      riscatto, riscattoPerc, anticipo, capitaleFin,
    };

    // Agevolazioni fiscali: calcolate sempre che si e' in leasing, indipendenti dal business plan
    let beneficioAgevolazioni = 0;
    if (isLeasing && includiIper) {
      const iper = calcolaIperammortamento(costo);
      res.iperBeneficioMensile = iper.beneficioMensile;
      beneficioAgevolazioni += iper.beneficioMensile;
    }
    if (isLeasing && includiSabatini && !includiZES) {
      const sab = calcolaSabatini(costo, sabatiniPerc);
      res.sabatiniBeneficioMensile = sab.contributoMensile;
      beneficioAgevolazioni += sab.contributoMensile;
    }
    if (isLeasing && includiZES) {
      const zes = calcolaZES(costo, zesRegione, zesDimensione);
      res.zesBeneficioMensile = zes.creditoMensile;
      beneficioAgevolazioni += zes.creditoMensile;
    }

    if (modalitaBP && energetica) {
      res.risparmioMensile = energetica.risparmioMensile;
      res.risparmioAutoconsumoMensile = energetica.risparmioAutoconsumoMensile;
      res.valoreImmissioneMensile = energetica.valoreImmissioneMensile;

      // Costo netto: bolletta - autoconsumo + rata - immissione - agevolazioni
      res.costoNettoMensile = bolletta - energetica.risparmioAutoconsumoMensile + rataTotale
        - energetica.valoreImmissioneMensile - beneficioAgevolazioni;
      res.differenza = bolletta - res.costoNettoMensile;
    }
    return res;
  }

  // Calcolo risultati per la durata selezionata
  const risultato = useMemo((): RisultatoDurata | null => {
    if (!calcolato) return null;
    return calcolaPerDurata(durata);
  }, [calcolato, costo, durata, modalitaBP, energetica, bolletta, assicurazioneOpzionale,
      includiAssicurazione, isLeasing, tanLeasing, anticipoPerc, riscattoLeasing,
      includiIper, includiSabatini, sabatiniPerc, includiZES, zesRegione, zesDimensione]);

  // Tabella comparativa per tutte le durate
  const duratePerTabella = isLeasing ? DURATE_LEASING : DURATE;
  const tabelladurate = useMemo((): RisultatoDurata[] => {
    if (!calcolato || costo < MIN_COSTO || costo > maxCosto) return [];
    return duratePerTabella
      .map((d) => calcolaPerDurata(d))
      .filter((r): r is RisultatoDurata => r !== null);
  }, [calcolato, costo, modalitaBP, energetica, bolletta, assicurazioneOpzionale,
      includiAssicurazione, isLeasing, tanLeasing, anticipoPerc, riscattoLeasing,
      includiIper, includiSabatini, sabatiniPerc, includiZES, zesRegione, zesDimensione]);

  // Gestione input numerico generico
  const handleNumericInput = (
    setter: (v: number) => void,
    inputSetter: (v: string) => void,
    max: number,
  ) => (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    inputSetter(raw);
    setCalcolato(false);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) setter(Math.min(max, Math.max(0, num)));
  };

  const handleCostoBlur = () => {
    if (costo > 0) {
      const clamped = Math.min(maxCosto, Math.max(MIN_COSTO, costo));
      setCosto(clamped);
      setCostoInput(clamped.toString());
    }
  };

  // Gestione input potenza (ammette decimali)
  const handlePotenzaInput = (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d.,]/g, '').replace(',', '.');
    setPotenzaInput(raw);
    setCalcolato(false);
    const num = parseFloat(raw);
    if (!isNaN(num)) setPotenza(Math.min(500, Math.max(0, num)));
  };

  // GTM tracking
  const toolName = varianteForm === 'arcaenergia' ? 'simulatore_arcaenergia'
    : varianteForm === 'age-srl' ? 'simulatore_age_srl'
    : varianteForm === 'energyteam' ? 'simulatore_energyteam' : 'simulatore_fotovoltaico';

  const pushCalcolo = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'calcolo_eseguito',
        tool: toolName,
        costo_impianto: costo,
        durata,
        modalita: modalitaBP ? 'business_plan' : 'base',
        modalita_finanziaria: isLeasing ? 'leasing' : 'noleggio',
        rata_totale: risultato?.rataTotale,
        ...(isLeasing ? { tan_leasing: tanLeasing, anticipo_perc: anticipoPerc } : {}),
        ...(includiIper ? { iper_ammortamento: true } : {}),
        ...(includiSabatini ? { sabatini: true } : {}),
        ...(includiZES ? { zes_unica: true, zes_regione: zesRegione, zes_dimensione: zesDimensione } : {}),
        ...(modalitaBP ? { potenza_kwp: potenza, zona: zonaEffettiva, tipo_attivita: tipoAttivita } : {}),
      });
    }
  };

  // Click "Calcola"
  const handleCalcola = () => {
    if (costo > 0) {
      const clamped = Math.min(maxCosto, Math.max(MIN_COSTO, costo));
      setCosto(clamped);
      setCostoInput(clamped.toString());
    }
    setCalcolato(true);
    pushCalcolo();
  };

  // State per il form contatti
  const [formNome, setFormNome] = useState('');
  const [formCognome, setFormCognome] = useState('');
  const [formAzienda, setFormAzienda] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formPiva, setFormPiva] = useState('');
  const [formPrivacy, setFormPrivacy] = useState(false);
  const [formInvio, setFormInvio] = useState(false);
  const [partnerSbloccato, setPartnerSbloccato] = useState(false);

  // State per il form variante EnergyTeam / ArcaEnergia (partner + cliente + checklist documenti)
  const [etPartnerNome, setEtPartnerNome] = useState('');
  const [etPartnerEmail, setEtPartnerEmail] = useState('');
  const [etPartnerTelefono, setEtPartnerTelefono] = useState('');
  const [etClienteRs, setEtClienteRs] = useState('');
  const [etClientePiva, setEtClientePiva] = useState('');
  const [etClienteReferente, setEtClienteReferente] = useState('');
  const [etNote, setEtNote] = useState('');

  // Documenti: per arcaenergia sono dinamici (cambiano in base a leasing/agevolazioni)
  const arcaEnergiaDocs = useMemo(() => {
    const docs = [...ARCAENERGIA_DOCS_BASE];
    if (isLeasing) docs.push(...ARCAENERGIA_DOCS_LEASING);
    if (includiIper) docs.push(...ARCAENERGIA_DOCS_IPER);
    if (includiSabatini && !includiZES) docs.push(...ARCAENERGIA_DOCS_SABATINI);
    if (includiZES) docs.push(...ARCAENERGIA_DOCS_ZES);
    return docs;
  }, [isLeasing, includiIper, includiSabatini, includiZES]);

  const currentDocs = (varianteForm === 'arcaenergia' || varianteForm === 'age-srl') ? arcaEnergiaDocs : ENERGYTEAM_DOCS;
  const [etDocsSpuntati, setEtDocsSpuntati] = useState<boolean[]>(() => new Array(20).fill(false));

  const toggleEtDoc = (idx: number) => {
    setEtDocsSpuntati((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  // Invio form a Zapier
  const handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    setFormInvio(true);

    // GTM
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'form_inviato',
        tool: 'simulatore_fotovoltaico',
      });
    }

    const body = new FormData();
    body.append('tool', 'simulatore_fotovoltaico');
    body.append('nome', formNome);
    body.append('azienda', formAzienda);
    body.append('email', formEmail);
    body.append('telefono', formTelefono);
    body.append('valore_bene', costo.toString());
    body.append('durata_preferita', durata.toString());
    if (modalitaBP) {
      body.append('potenza_kwp', potenza.toString());
      body.append('accumulo_kwh', accumulo.toString());
      body.append('zona', zonaEffettiva);
      body.append('tipo_attivita', tipoAttivita);
      body.append('bolletta_mensile', bolletta.toString());
    }
    if (risultato) {
      body.append('rata_calcolata', risultato.rataTotale.toFixed(2));
      body.append('riscatto_perc', (risultato.riscattoPerc * 100).toFixed(0) + '%');
      body.append('riscatto_euro', risultato.riscatto.toFixed(2));
      if (risultato.risparmioMensile !== undefined) {
        body.append('risparmio_stimato', risultato.risparmioMensile.toFixed(2));
      }
      if (risultato.differenza !== undefined) {
        body.append('differenza_netta', risultato.differenza.toFixed(2));
      }
    }

    try {
      await fetch('https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/', {
        method: 'POST',
        body,
      });
    } catch (_) {}
    window.location.href = '/grazie';
  };

  // Submit form partner (nome, cognome, cellulare, P.IVA → Zapier, poi sblocca stampa)
  const handlePartnerSubmit = async (e: Event) => {
    e.preventDefault();
    setFormInvio(true);

    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'form_inviato',
        tool: 'preventivatore_fotovoltaico_partner',
      });
    }

    const body = new FormData();
    body.append('tool', 'preventivatore_fotovoltaico_partner');
    body.append('nome', formNome);
    body.append('cognome', formCognome);
    body.append('telefono', formTelefono);
    body.append('partita_iva', formPiva);
    body.append('valore_bene', costo.toString());
    body.append('durata', durata.toString());
    if (risultato) {
      body.append('rata_calcolata', risultato.rataTotale.toFixed(2));
      if (risultato.risparmioMensile !== undefined) {
        body.append('risparmio_stimato', risultato.risparmioMensile.toFixed(2));
      }
    }

    try {
      await fetch('https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/', {
        method: 'POST',
        body,
      });
    } catch (_) {}
    setFormInvio(false);
    setPartnerSbloccato(true);
  };

  // Submit form variante EnergyTeam — richiesta pratica diretta con checklist documenti
  const handleEnergyteamSubmit = async (e: Event) => {
    e.preventDefault();
    setFormInvio(true);

    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'form_inviato',
        tool: 'simulatore_energyteam',
      });
    }

    const pronti: string[] = [];
    const mancanti: string[] = [];
    ENERGYTEAM_DOCS.forEach((doc, i) => {
      if (etDocsSpuntati[i]) pronti.push(doc);
      else mancanti.push(doc);
    });

    const body = new FormData();
    body.append('fonte', 'energyteam');
    body.append('tool', 'simulatore_energyteam');
    body.append('partner_nome', etPartnerNome);
    body.append('partner_email', etPartnerEmail);
    body.append('partner_telefono', etPartnerTelefono);
    body.append('cliente_ragione_sociale', etClienteRs);
    body.append('cliente_piva', etClientePiva);
    body.append('cliente_referente', etClienteReferente);
    body.append('valore_bene', costo.toString());
    body.append('durata', durata.toString());
    if (risultato) {
      body.append('coefficiente', risultato.coeff.toFixed(3));
      body.append('canone_mensile', risultato.canoneMensile.toFixed(2));
      body.append('assicurazione_mensile', risultato.assicurazioneMensile.toFixed(2));
      body.append('assicurazione_inclusa', includiAssicurazione ? 'si' : 'no');
      body.append('rata_mostrata', risultato.rataTotale.toFixed(2));
      body.append('riscatto_perc', (risultato.riscattoPerc * 100).toFixed(0) + '%');
      body.append('riscatto_euro', risultato.riscatto.toFixed(2));
    }
    body.append('documenti_pronti', pronti.join(' | '));
    body.append('documenti_mancanti', mancanti.join(' | '));
    body.append('note', etNote);

    try {
      await fetch('https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/', {
        method: 'POST',
        body,
      });
    } catch (_) {}
    window.location.href = '/grazie';
  };

  // Submit form variante ArcaEnergia — simile a EnergyTeam ma con dati leasing/agevolazioni
  const handleArcaenergiaSubmit = async (e: Event) => {
    e.preventDefault();
    setFormInvio(true);

    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({ event: 'form_inviato', tool: 'simulatore_arcaenergia' });
    }

    const pronti: string[] = [];
    const mancanti: string[] = [];
    currentDocs.forEach((doc, i) => {
      if (etDocsSpuntati[i]) pronti.push(doc);
      else mancanti.push(doc);
    });

    const fonte = varianteForm === 'age-srl' ? 'age-srl' : 'arcaenergia';
    const body = new FormData();
    body.append('fonte', fonte);
    body.append('tool', `simulatore_${fonte}`);
    body.append('modalita_finanziaria', isLeasing ? 'leasing' : 'noleggio');
    body.append('partner_nome', etPartnerNome);
    body.append('partner_email', etPartnerEmail);
    body.append('partner_telefono', etPartnerTelefono);
    body.append('cliente_ragione_sociale', etClienteRs);
    body.append('cliente_piva', etClientePiva);
    body.append('cliente_referente', etClienteReferente);
    body.append('valore_bene', costo.toString());
    body.append('durata', durata.toString());
    if (risultato) {
      body.append('rata_mensile', risultato.rataTotale.toFixed(2));
      body.append('riscatto_perc', (risultato.riscattoPerc * 100).toFixed(0) + '%');
      body.append('riscatto_euro', risultato.riscatto.toFixed(2));
      if (isLeasing) {
        body.append('anticipo_perc', anticipoPerc.toString() + '%');
        body.append('anticipo_euro', (risultato.anticipo ?? 0).toFixed(2));
        body.append('tan_leasing', tanLeasing.toString() + '%');
      } else {
        body.append('canone_mensile', risultato.canoneMensile.toFixed(2));
        body.append('assicurazione_mensile', risultato.assicurazioneMensile.toFixed(2));
        body.append('assicurazione_inclusa', includiAssicurazione ? 'si' : 'no');
      }
      if (risultato.iperBeneficioMensile) {
        body.append('iper_beneficio_mensile', risultato.iperBeneficioMensile.toFixed(2));
      }
      if (risultato.sabatiniBeneficioMensile) {
        body.append('sabatini_beneficio_mensile', risultato.sabatiniBeneficioMensile.toFixed(2));
      }
      if (risultato.zesBeneficioMensile) {
        body.append('zes_regione', zesRegione);
        body.append('zes_dimensione', zesDimensione);
        body.append('zes_beneficio_mensile', risultato.zesBeneficioMensile.toFixed(2));
      }
    }
    body.append('documenti_pronti', pronti.join(' | '));
    body.append('documenti_mancanti', mancanti.join(' | '));
    body.append('note', etNote);

    try {
      await fetch('https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/', {
        method: 'POST',
        body,
      });
    } catch (_) {}

    // Genera e scarica il PDF con i dati del cliente
    if (risultato) {
      await generaPDF({
        ragioneSociale: etClienteRs,
        referente: etClienteReferente,
        piva: etClientePiva,
      });
    }

    // Feedback: mostra messaggio di successo senza redirect
    setFormInvio(false);
    setCalcolato(true);
    // Scroll verso i risultati
    document.querySelector('.simpv__results')?.scrollIntoView({ behavior: 'smooth' });
  };

  const costoValido = costo >= MIN_COSTO && costo <= maxCosto;
  const formValido = formNome.trim() && formAzienda.trim() && formEmail.trim() && formTelefono.trim() && formPrivacy;
  const formPartnerValido = formNome.trim() && formCognome.trim() && formTelefono.trim() && formPiva.trim().length >= 11 && formPrivacy;
  const formEnergyteamValido = Boolean(
    etPartnerNome.trim() && etPartnerEmail.trim() && etPartnerTelefono.trim() && etClienteRs.trim() && formPrivacy && risultato,
  );

  // Generazione PDF brandizzato MCF
  // Genera PDF brandizzato MCF con dati preventivo e opzionalmente dati cliente
  const generaPDF = async (datiCliente?: { ragioneSociale: string; referente: string; piva: string }) => {
    if (!risultato) return;

    const html2pdf = (await import('html2pdf.js')).default;

    const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    const modalitaLabel = isLeasing ? 'Leasing Finanziario' : 'Noleggio Operativo';

    // Sezione dati cliente (se presenti)
    const sezioneCliente = datiCliente?.ragioneSociale ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-size:10px;color:#787782;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Intestato a</div>
        <div style="font-size:14px;font-weight:700;color:#293C5B;">${datiCliente.ragioneSociale}</div>
        ${datiCliente.referente ? `<div style="font-size:11px;color:#475569;margin-top:2px;">Rif. ${datiCliente.referente}</div>` : ''}
        ${datiCliente.piva ? `<div style="font-size:11px;color:#787782;margin-top:2px;">P.IVA ${datiCliente.piva}</div>` : ''}
      </div>
    ` : '';

    // Righe dettaglio
    let righeDettaglio = '';
    if (isLeasing) {
      righeDettaglio += `<tr><td>Anticipo alla firma (${anticipoPerc}%)</td><td style="text-align:right">${eur(risultato.anticipo ?? 0)}</td></tr>`;
    }
    righeDettaglio += `<tr><td>Riscatto finale (${isLeasing ? riscattoLeasing : Math.round(risultato.riscattoPerc * 100)}%)</td><td style="text-align:right">${eur(risultato.riscatto)}</td></tr>`;
    if (!isLeasing && risultato.assicurazioneMensile > 0) {
      righeDettaglio += `<tr><td>Assicurazione all-risk</td><td style="text-align:right">${eur(risultato.assicurazioneMensile)}/mese</td></tr>`;
    }

    // Righe business plan
    let sezioneBP = '';
    if (modalitaBP && energetica && risultato.differenza !== undefined) {
      let righeAgevolazioni = '';
      if (risultato.iperBeneficioMensile && risultato.iperBeneficioMensile > 0) {
        righeAgevolazioni += `<tr style="background:#f5f3ff"><td>Iperammortamento 4.0 (su 9 anni)</td><td style="text-align:right;color:#664CCD;font-weight:700">-${eur(risultato.iperBeneficioMensile)}/mese</td></tr>`;
      }
      if (risultato.sabatiniBeneficioMensile && risultato.sabatiniBeneficioMensile > 0) {
        righeAgevolazioni += `<tr style="background:#f5f3ff"><td>Contributo Sabatini 4.0 (su 6 anni)</td><td style="text-align:right;color:#664CCD;font-weight:700">-${eur(risultato.sabatiniBeneficioMensile)}/mese</td></tr>`;
      }
      if (risultato.zesBeneficioMensile && risultato.zesBeneficioMensile > 0) {
        righeAgevolazioni += `<tr style="background:#f5f3ff"><td>ZES Unica — credito d'imposta (su 5 anni)</td><td style="text-align:right;color:#664CCD;font-weight:700">-${eur(risultato.zesBeneficioMensile)}/mese</td></tr>`;
      }

      const coloreConfronto = risultato.differenza >= 0 ? '#16a34a' : '#dc2626';
      const labelConfronto = risultato.differenza >= 0 ? 'Risparmio vs bolletta' : 'Costo extra vs bolletta';

      sezioneBP = `
        <h3 style="margin:24px 0 12px;font-size:14px;color:#293C5B;font-weight:700;">Confronto con la bolletta</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr><td>Bolletta attuale</td><td style="text-align:right">${eur(bolletta)}/mese</td></tr>
          <tr><td>Risparmio autoconsumo</td><td style="text-align:right;color:#16a34a;font-weight:700">-${eur(energetica.risparmioAutoconsumoMensile)}/mese</td></tr>
          <tr><td>Rata ${isLeasing ? 'leasing' : 'noleggio'}</td><td style="text-align:right">+${eur(risultato.rataTotale)}/mese</td></tr>
          <tr><td>Immissione in rete</td><td style="text-align:right;color:#16a34a;font-weight:700">-${eur(energetica.valoreImmissioneMensile)}/mese</td></tr>
          ${righeAgevolazioni}
          <tr style="border-top:2px solid #293C5B;font-weight:700;font-size:13px">
            <td style="padding-top:8px">Costo netto mensile</td>
            <td style="text-align:right;padding-top:8px">${eur(risultato.costoNettoMensile!)}/mese</td>
          </tr>
          <tr style="font-weight:700;font-size:13px">
            <td>${labelConfronto}</td>
            <td style="text-align:right;color:${coloreConfronto}">${risultato.differenza >= 0 ? '+' : ''}${eur(risultato.differenza)}/mese</td>
          </tr>
        </table>
        ${risultato.differenza > 0 ? `
        <div style="margin-top:16px;padding:12px 16px;background:#ecfdf5;border:2px solid #34d399;border-radius:8px;text-align:center;">
          <div style="font-size:11px;color:#15803d;font-weight:600;margin-bottom:4px;">Risparmio totale sui ${durata} mesi di contratto</div>
          <div style="font-size:20px;font-weight:800;color:#16a34a;">+${eur(risultato.differenza * durata)}</div>
        </div>` : ''}
      `;
    }

    const html = `
      <div style="font-family:'Manrope',Helvetica,Arial,sans-serif;color:#293C5B;padding:32px;max-width:600px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #664CCD;">
          <div>
            <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;">
              <span style="color:#664CCD">Medio</span><span style="color:#293C5B">credito</span>
              <span style="color:#FE6F3A;margin-left:4px">Facile</span>
            </div>
            <div style="font-size:8px;font-weight:400;letter-spacing:3.5px;color:#664CCD;text-transform:uppercase;margin-top:2px;">L'OFFICINA DEL CREDITO</div>
          </div>
          <div style="text-align:right;font-size:10px;color:#787782;">
            Preventivo generato il ${oggi}
          </div>
        </div>

        <h2 style="font-size:16px;font-weight:800;color:#664CCD;margin:0 0 4px;">Preventivo ${modalitaLabel} Fotovoltaico</h2>
        <p style="font-size:11px;color:#787782;margin:0 0 20px;">Durata: ${durata} mesi — Importo: ${eur(costo)}</p>

        ${sezioneCliente}

        <div style="background:#f5f3ff;border-left:4px solid #664CCD;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
          <div style="font-size:10px;color:#787782;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">
            ${isLeasing ? 'Rata leasing mensile' : 'Rata mensile'}
          </div>
          <div style="font-size:28px;font-weight:800;color:#664CCD;letter-spacing:-0.02em;">${eur(risultato.rataTotale)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          ${righeDettaglio}
        </table>

        ${sezioneBP}

        ${modalitaBP && energetica ? `
        <h3 style="margin:24px 0 12px;font-size:14px;color:#293C5B;font-weight:700;">Analisi energetica</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr><td>Potenza impianto</td><td style="text-align:right">${potenza} kWp</td></tr>
          ${accumulo > 0 ? `<tr><td>Accumulo</td><td style="text-align:right">${accumulo} kWh</td></tr>` : ''}
          <tr><td>Consumo annuo stimato</td><td style="text-align:right">${Math.round(energetica.consumoAnnuo).toLocaleString('it-IT')} kWh</td></tr>
          <tr><td>Produzione annua</td><td style="text-align:right">${Math.round(energetica.produzioneAnnua).toLocaleString('it-IT')} kWh</td></tr>
          <tr><td>Autoconsumo (${Math.round(energetica.autoconsumoPct * 100)}%)</td><td style="text-align:right">${Math.round(energetica.kwhAutoconsumo).toLocaleString('it-IT')} kWh</td></tr>
          <tr style="font-weight:700"><td>Autosufficienza energetica</td><td style="text-align:right">${Math.round(energetica.autosufficienzaPerc * 100)}%</td></tr>
        </table>
        ` : ''}

        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E1DEE3;font-size:9px;color:#787782;line-height:1.5;">
          <p>Coefficienti indicativi. Il preventivo definitivo dipende dalla società ${isLeasing ? 'di leasing' : 'di locazione'} e dalle condizioni al momento della delibera.
          ${modalitaBP ? ' Produzione e risparmio sono stime basate su dati medi PVGIS.' : ''}</p>
          <p style="margin-top:8px;">
            <strong style="color:#664CCD">Mediocredito Facile</strong> — mediocreditofacile.it — +39 393 995 7840
          </p>
        </div>
      </div>
    `;

    // Creo un container temporaneo
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const clienteSlug = datiCliente?.ragioneSociale
      ? '_' + datiCliente.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
      : '';
    const nomeFile = `Preventivo_MCF_${isLeasing ? 'Leasing' : 'Noleggio'}${clienteSlug}_${durata}mesi.pdf`;

    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: nomeFile,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(container.firstElementChild).save();

    document.body.removeChild(container);
  };

  // Handler input decimale generico (per TAN, riscatto, sabatini)
  const handleDecimalInput = (
    setter: (v: number) => void,
    inputSetter: (v: string) => void,
    max: number,
  ) => (e: Event) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^\d.,]/g, '').replace(',', '.');
    inputSetter(raw);
    setCalcolato(false);
    const num = parseFloat(raw);
    if (!isNaN(num)) setter(Math.min(max, Math.max(0, num)));
  };

  return (
    <div class="simpv">
      {/* --- FORM --- */}
      <div class="simpv__form">

        {/* Switch Noleggio / Leasing (solo se abilitato) */}
        {abilitaLeasing && (
          <div class="simpv__field">
            <label class="simpv__label">Modalità finanziaria</label>
            <div class="simpv__modalita-switch">
              <button
                type="button"
                class={`simpv__modalita-btn ${modalitaFin === 'noleggio' ? 'simpv__modalita-btn--active' : ''}`}
                onClick={() => { setModalitaFin('noleggio'); setCalcolato(false); }}
              >
                <span class="material-icons-outlined simpv__modalita-icon" aria-hidden="true">description</span>
                Noleggio Operativo
              </button>
              <button
                type="button"
                class={`simpv__modalita-btn ${modalitaFin === 'leasing' ? 'simpv__modalita-btn--active' : ''}`}
                onClick={() => { setModalitaFin('leasing'); setCalcolato(false); }}
              >
                <span class="material-icons-outlined simpv__modalita-icon" aria-hidden="true">account_balance</span>
                Leasing Finanziario
              </button>
            </div>
          </div>
        )}

        {/* Costo impianto */}
        <div class="simpv__field">
          <label class="simpv__label" for="pv-costo">Costo impianto (€, netto IVA)</label>
          <input
            id="pv-costo"
            type="text"
            inputMode="numeric"
            class="simpv__input"
            value={costoInput}
            onInput={handleNumericInput(setCosto, setCostoInput, maxCosto)}
            onBlur={handleCostoBlur}
            placeholder="15000"
          />
          <span class="simpv__hint">
            Min €800 — Max {isLeasing ? '€500.000.000' : '€240.000'}
          </span>
        </div>

        {/* Durata — bottoni per selezione diretta */}
        <div class="simpv__field">
          <label class="simpv__label">Durata contratto</label>
          <div class="simpv__durate">
            {(isLeasing ? DURATE_LEASING : DURATE).map((d) => {
              const disponibile = durateDisponibili.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  class={`simpv__durata ${d === durata ? 'simpv__durata--active' : ''} ${!disponibile ? 'simpv__durata--disabled' : ''}`}
                  onClick={() => { if (disponibile) setDurata(d); }}
                  disabled={!disponibile}
                >
                  {d} mesi
                </button>
              );
            })}
          </div>
        </div>

        {/* Campi leasing (visibili solo in modalita' leasing) */}
        {isLeasing && (
          <div class="simpv__leasing-fields">
            {/* Anticipo */}
            <div class="simpv__field">
              <label class="simpv__label">Anticipo / Maxicanone</label>
              <div class="simpv__durate">
                {ANTICIPO_OPTIONS.map((perc) => (
                  <button
                    key={perc}
                    type="button"
                    class={`simpv__durata ${perc === anticipoPerc ? 'simpv__durata--active' : ''}`}
                    onClick={() => { setAnticipoPerc(perc); setCalcolato(false); }}
                  >
                    {perc}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Toggle assicurazione all-risk (solo noleggio) */}
        {assicurazioneOpzionale && !isLeasing && (
          <div class="simpv__toggle">
            <label class={`simpv__toggle-card ${includiAssicurazione ? 'simpv__toggle-card--active' : ''}`}>
              <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
                {includiAssicurazione ? 'check_circle' : 'shield'}
              </span>
              <div class="simpv__toggle-content">
                <div class="simpv__toggle-title">Includi assicurazione all-risk</div>
                <div class="simpv__toggle-desc">
                  {includiAssicurazione
                    ? 'Attiva — inclusa nel canone (+1,83% annuo del valore bene)'
                    : "Copertura su danni elettrici, eventi atmosferici, furto e atti vandalici. +1,83% annuo sul valore dell'impianto."}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includiAssicurazione}
                onChange={() => { setIncludiAssicurazione(!includiAssicurazione); }}
              />
              <span class="simpv__toggle-switch" />
            </label>
          </div>
        )}

        {/* Toggle business plan — card visibile */}
        <div class="simpv__toggle">
          <label class={`simpv__toggle-card ${modalitaBP ? 'simpv__toggle-card--active' : ''}`}>
            <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
              {modalitaBP ? 'check_circle' : 'bolt'}
            </span>
            <div class="simpv__toggle-content">
              <div class="simpv__toggle-title">Confronta con il risparmio in bolletta</div>
              <div class="simpv__toggle-desc">
                {modalitaBP ? 'Business plan attivo — compila i dati energetici qui sotto' : 'Attiva per calcolare produzione e risparmio'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={modalitaBP}
              onChange={() => { setModalitaBP(!modalitaBP); setCalcolato(false); }}
            />
            <span class="simpv__toggle-switch" />
          </label>
        </div>

        {/* Campi business plan */}
        <div class={`simpv__bp-fields ${modalitaBP ? 'simpv__bp-fields--open' : ''}`}>
          <div class="simpv__field">
            <label class="simpv__label" for="pv-potenza">Potenza impianto (kWp)</label>
            <input
              id="pv-potenza"
              type="text"
              inputMode="decimal"
              class="simpv__input"
              value={potenzaInput}
              onInput={handlePotenzaInput}
              placeholder="6"
            />
          </div>

          <div class="simpv__field">
            <label class="simpv__label" for="pv-accumulo">Accumulo / Batteria (kWh)</label>
            <input
              id="pv-accumulo"
              type="text"
              inputMode="numeric"
              class="simpv__input"
              value={accumuloInput}
              onInput={handleNumericInput(setAccumulo, setAccumuloInput, 200)}
              placeholder="0 = senza batteria"
            />
          </div>

          <div class="simpv__field">
            <label class="simpv__label" for="pv-bolletta">Bolletta elettrica attuale (€/mese)</label>
            <input
              id="pv-bolletta"
              type="text"
              inputMode="numeric"
              class="simpv__input"
              value={bollettaInput}
              onInput={handleNumericInput(setBolletta, setBollettaInput, 50000)}
              placeholder="250"
            />
          </div>

          {!zonaFissa && (
            <div class="simpv__field">
              <label class="simpv__label" for="pv-zona">Zona geografica</label>
              <select
                id="pv-zona"
                class="simpv__select"
                value={zona}
                onChange={(e) => { setZona((e.target as HTMLSelectElement).value); setCalcolato(false); }}
              >
                {Object.entries(ZONE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          )}

          <div class="simpv__field">
            <label class="simpv__label" for="pv-attivita">Tipo di attività</label>
            <select
              id="pv-attivita"
              class="simpv__select"
              value={tipoAttivita}
              onChange={(e) => { setTipoAttivita((e.target as HTMLSelectElement).value); setCalcolato(false); }}
            >
              {Object.entries(ATTIVITA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Card Agevolazioni 4.0 — visibile con leasing, indipendente dal business plan */}
        {mostraAgevolazioni && (
          <div class="simpv__agevolazioni-card">
            <h4 class="simpv__agevolazioni-title">
              <span class="material-icons-outlined" aria-hidden="true" style="font-size:1.1rem;vertical-align:middle;margin-right:0.35rem;color:#664CCD;">star</span>
              Agevolazioni fiscali 4.0
            </h4>
            <p class="simpv__agevolazioni-nota">
              Disponibili solo con leasing finanziario o acquisto diretto. Non applicabili al noleggio operativo.
            </p>

            {/* Toggle iperammortamento */}
            <label class={`simpv__toggle-card simpv__toggle-card--small ${includiIper ? 'simpv__toggle-card--active' : ''}`}>
              <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
                {includiIper ? 'check_circle' : 'trending_up'}
              </span>
              <div class="simpv__toggle-content">
                <div class="simpv__toggle-title">Iperammortamento 4.0</div>
                <div class="simpv__toggle-desc">
                  {includiIper
                    ? 'Attivo — costo ammortizzabile al 280% (100% ordinario + 180% maggiorazione)'
                    : 'Costo ammortizzabile al 280% per beni nuovi Industria 4.0'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includiIper}
                onChange={() => { setIncludiIper(!includiIper); setCalcolato(false); }}
              />
              <span class="simpv__toggle-switch" />
            </label>

            {/* Toggle Sabatini 4.0 — disabilitato se ZES attiva */}
            <label class={`simpv__toggle-card simpv__toggle-card--small ${includiSabatini ? 'simpv__toggle-card--active' : ''} ${includiZES ? 'simpv__toggle-card--disabled' : ''}`}>
              <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
                {includiSabatini ? 'check_circle' : 'savings'}
              </span>
              <div class="simpv__toggle-content">
                <div class="simpv__toggle-title">Sabatini 4.0</div>
                <div class="simpv__toggle-desc">
                  {includiZES
                    ? 'Non cumulabile con ZES Unica'
                    : includiSabatini
                      ? `Attivo — contributo MISE ${sabatiniPerc}% in 6 quote annuali`
                      : 'Contributo MISE per investimenti 4.0 in leasing'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includiSabatini && !includiZES}
                disabled={includiZES}
                onChange={() => { setIncludiSabatini(!includiSabatini); setCalcolato(false); }}
              />
              <span class="simpv__toggle-switch" />
            </label>

            {/* Campo % Sabatini (visibile solo se attivo e ZES non attiva) */}
            {includiSabatini && !includiZES && (
              <div class="simpv__field" style="margin-top:0.5rem;">
                <label class="simpv__label" for="pv-sabatini-perc">Contributo Sabatini stimato (%)</label>
                <input
                  id="pv-sabatini-perc"
                  type="text"
                  inputMode="decimal"
                  class="simpv__input"
                  value={sabatiniPercInput}
                  onInput={handleDecimalInput(setSabatiniPerc, setSabatiniPercInput, 30)}
                  placeholder="10"
                />
                <span class="simpv__hint">Default ~10% dell'investimento. Il calcolo esatto dipende dalla delibera MISE.</span>
              </div>
            )}

            {/* Toggle ZES Unica — disabilita Sabatini quando attivo, richiede costo >= 200k */}
            <label class={`simpv__toggle-card simpv__toggle-card--small ${includiZES ? 'simpv__toggle-card--active simpv__toggle-card--zes' : ''} ${!zesSogliaOk ? 'simpv__toggle-card--disabled' : ''}`}>
              <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
                {includiZES ? 'check_circle' : 'south'}
              </span>
              <div class="simpv__toggle-content">
                <div class="simpv__toggle-title">ZES Unica Mezzogiorno</div>
                <div class="simpv__toggle-desc">
                  {!zesSogliaOk
                    ? 'Investimento minimo €200.000 per accedere alla ZES'
                    : includiZES
                      ? 'Attivo — credito d\'imposta su investimenti in ZES'
                      : 'Credito d\'imposta fino al 60% per investimenti al Sud'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includiZES && zesSogliaOk}
                disabled={!zesSogliaOk}
                onChange={() => {
                  const nuovoZES = !includiZES;
                  setIncludiZES(nuovoZES);
                  if (nuovoZES) setIncludiSabatini(false); // mutua esclusione
                  setCalcolato(false);
                }}
              />
              <span class="simpv__toggle-switch" />
            </label>

            {/* Campi ZES: regione e dimensione impresa */}
            {includiZES && (
              <div class="simpv__zes-fields">
                <div class="simpv__field">
                  <label class="simpv__label" for="pv-zes-regione">Regione sede produttiva</label>
                  <select
                    id="pv-zes-regione"
                    class="simpv__select"
                    value={zesRegione}
                    onChange={(e) => { setZesRegione((e.target as HTMLSelectElement).value); setCalcolato(false); }}
                  >
                    {ZES_REGIONI.map((r) => (
                      <option key={r.key} value={r.key}>{r.label} — fino al {r.aliquote.piccola}%</option>
                    ))}
                  </select>
                </div>
                <div class="simpv__field">
                  <label class="simpv__label" for="pv-zes-dimensione">Dimensione impresa</label>
                  <select
                    id="pv-zes-dimensione"
                    class="simpv__select"
                    value={zesDimensione}
                    onChange={(e) => { setZesDimensione((e.target as HTMLSelectElement).value as DimensioneImpresa); setCalcolato(false); }}
                  >
                    {(Object.entries(DIMENSIONE_LABELS) as [DimensioneImpresa, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <p class="simpv__hint" style="margin-top:0.25rem;">Investimento minimo €200.000. Non cumulabile con Sabatini. Importo soggetto a riparto proporzionale AdE.</p>
              </div>
            )}
          </div>
        )}

        {/* Bottone calcola */}
        <button
          type="button"
          class="simpv__button"
          onClick={handleCalcola}
          disabled={costo < 1}
        >
          Calcola preventivo
        </button>
      </div>

      {/* --- RISULTATI + FORM --- */}
      <div class="simpv__results">
        {risultato ? (
          <>
            <h3 class="simpv__results-title">Il tuo preventivo</h3>

            {/* Card rata principale */}
            <div class="simpv__card simpv__card--main">
              <span class="simpv__card-label">
                {isLeasing ? 'Rata leasing mensile' :
                 assicurazioneOpzionale && !includiAssicurazione ? 'Canone mensile' : 'Rata mensile totale'}
              </span>
              <span class="simpv__card-value">{eur(risultato.rataTotale)}</span>
              <span class="simpv__card-detail">
                {isLeasing
                  ? <>Anticipo {anticipoPerc}% ({eur(risultato.anticipo ?? 0)}) — Riscatto {riscattoLeasing}%</>
                  : assicurazioneOpzionale && !includiAssicurazione
                    ? <>Canone puro — +{eur(risultato.assicurazioneMensile)}/mese se aggiungi l'all-risk</>
                    : <>Canone {eur(risultato.canoneMensile)} + Assicurazione {eur(risultato.assicurazioneMensile)}</>
                }
              </span>
            </div>

            {/* Card dettaglio */}
            <div class="simpv__card">
              <div class="simpv__card-row">
                <span>Riscatto finale ({isLeasing ? riscattoLeasing : Math.round(risultato.riscattoPerc * 100)}%)</span>
                <span>{eur(risultato.riscatto)}</span>
              </div>
              {isLeasing && risultato.anticipo !== undefined && risultato.anticipo > 0 && (
                <div class="simpv__card-row">
                  <span>Anticipo alla firma ({anticipoPerc}%)</span>
                  <span>{eur(risultato.anticipo)}</span>
                </div>
              )}
            </div>

            {/* Card Agevolazioni fiscali — visibile senza business plan, quando leasing + agevolazione e' attiva */}
            {isLeasing && !modalitaBP && ((risultato.iperBeneficioMensile ?? 0) > 0 || (risultato.sabatiniBeneficioMensile ?? 0) > 0 || (risultato.zesBeneficioMensile ?? 0) > 0) && (
              <div class="simpv__card simpv__card--confronto">
                <h4 class="simpv__card-heading">
                  <span class="material-icons-outlined" aria-hidden="true" style="color:#664CCD;vertical-align:middle;margin-right:0.35rem;">star</span>
                  Agevolazioni fiscali
                </h4>
                <div class="simpv__card-row">
                  <span>Rata leasing</span>
                  <span>+{eur(risultato.rataTotale)}/mese</span>
                </div>
                {risultato.iperBeneficioMensile !== undefined && risultato.iperBeneficioMensile > 0 && (
                  <div class="simpv__card-row simpv__card-row--agevolazione">
                    <span>Iperammortamento 4.0 (su 9 anni)</span>
                    <span class="simpv__violet">−{eur(risultato.iperBeneficioMensile)}/mese</span>
                  </div>
                )}
                {risultato.sabatiniBeneficioMensile !== undefined && risultato.sabatiniBeneficioMensile > 0 && (
                  <div class="simpv__card-row simpv__card-row--agevolazione">
                    <span>Contributo Sabatini 4.0 (su 6 anni)</span>
                    <span class="simpv__violet">−{eur(risultato.sabatiniBeneficioMensile)}/mese</span>
                  </div>
                )}
                {risultato.zesBeneficioMensile !== undefined && risultato.zesBeneficioMensile > 0 && (
                  <div class="simpv__card-row simpv__card-row--agevolazione">
                    <span>ZES Unica — credito d'imposta (su 5 anni)</span>
                    <span class="simpv__violet">−{eur(risultato.zesBeneficioMensile)}/mese</span>
                  </div>
                )}
                <div class="simpv__card-row simpv__card-row--total">
                  <span>Rata effettiva al netto delle agevolazioni</span>
                  <span>{eur(Math.max(0, risultato.rataTotale - (risultato.iperBeneficioMensile ?? 0) - (risultato.sabatiniBeneficioMensile ?? 0) - (risultato.zesBeneficioMensile ?? 0)))}/mese</span>
                </div>
                <div class="simpv__card-row simpv__card-row--agevolazione" style="margin-top:0.5rem;">
                  <span>Totale agevolazioni nel periodo di beneficio</span>
                  <span class="simpv__violet">
                    {eur(
                      ((risultato.iperBeneficioMensile ?? 0) * 12 * 9) +
                      ((risultato.sabatiniBeneficioMensile ?? 0) * 12 * 6) +
                      ((risultato.zesBeneficioMensile ?? 0) * 12 * 5)
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Card confronto bolletta (solo BP) */}
            {modalitaBP && energetica && risultato.differenza !== undefined && risultato.costoNettoMensile !== undefined && (
              <div class={`simpv__card simpv__card--confronto ${risultato.differenza >= 0 ? 'simpv__card--green' : 'simpv__card--red'}`}>
                <h4 class="simpv__card-heading">La rata si sostiene con la bolletta?</h4>
                <div class="simpv__card-row">
                  <span>Bolletta attuale</span>
                  <span>{eur(bolletta)}/mese</span>
                </div>
                <div class="simpv__card-row">
                  <span>Risparmio autoconsumo (abbatte la bolletta)</span>
                  <span class="simpv__green">−{eur(energetica.risparmioAutoconsumoMensile)}/mese</span>
                </div>
                <div class="simpv__card-row">
                  <span>Rata {isLeasing ? 'leasing' : 'noleggio'}</span>
                  <span>+{eur(risultato.rataTotale)}/mese</span>
                </div>
                <div class="simpv__card-row">
                  <span>Immissione in rete a {eur(FEED_IN_PRICE)}/kWh (abbatte la rata)</span>
                  <span class="simpv__green">−{eur(energetica.valoreImmissioneMensile)}/mese</span>
                </div>
                {/* Righe agevolazioni */}
                {risultato.iperBeneficioMensile !== undefined && risultato.iperBeneficioMensile > 0 && (
                  <div class="simpv__card-row simpv__card-row--agevolazione">
                    <span>Iperammortamento 4.0 (su 9 anni)</span>
                    <span class="simpv__violet">−{eur(risultato.iperBeneficioMensile)}/mese</span>
                  </div>
                )}
                {risultato.sabatiniBeneficioMensile !== undefined && risultato.sabatiniBeneficioMensile > 0 && (
                  <div class="simpv__card-row simpv__card-row--agevolazione">
                    <span>Contributo Sabatini 4.0 (su 6 anni)</span>
                    <span class="simpv__violet">−{eur(risultato.sabatiniBeneficioMensile)}/mese</span>
                  </div>
                )}
                {risultato.zesBeneficioMensile !== undefined && risultato.zesBeneficioMensile > 0 && (
                  <div class="simpv__card-row simpv__card-row--agevolazione">
                    <span>ZES Unica — credito d'imposta (su 5 anni)</span>
                    <span class="simpv__violet">−{eur(risultato.zesBeneficioMensile)}/mese</span>
                  </div>
                )}
                <div class="simpv__card-row simpv__card-row--total">
                  <span>Costo netto mensile con impianto</span>
                  <span>{eur(risultato.costoNettoMensile)}/mese</span>
                </div>
                <div class="simpv__card-row simpv__card-row--total">
                  <span>{risultato.differenza >= 0 ? 'Risparmio vs bolletta attuale' : 'Costo extra vs bolletta attuale'}</span>
                  <span class={risultato.differenza >= 0 ? 'simpv__green' : 'simpv__red'}>
                    {risultato.differenza >= 0 ? '+' : ''}{eur(risultato.differenza)}/mese
                  </span>
                </div>

                {/* Totale beneficio agevolazioni — solo leasing */}
                {isLeasing && ((risultato.iperBeneficioMensile ?? 0) > 0 || (risultato.sabatiniBeneficioMensile ?? 0) > 0 || (risultato.zesBeneficioMensile ?? 0) > 0) && (
                  <div class="simpv__card-row simpv__card-row--agevolazione" style="margin-top:0.5rem;">
                    <span>Totale agevolazioni fiscali</span>
                    <span class="simpv__violet">
                      {eur(
                        ((risultato.iperBeneficioMensile ?? 0) * 12 * 9) +
                        ((risultato.sabatiniBeneficioMensile ?? 0) * 12 * 6) +
                        ((risultato.zesBeneficioMensile ?? 0) * 12 * 5)
                      )}
                    </span>
                  </div>
                )}

                {/* Risparmio totale sulla durata del contratto — solo se c'è risparmio */}
                {risultato.differenza > 0 && (
                  <div class="simpv__card simpv__card--risparmio-totale">
                    <div class="simpv__card-row simpv__card-row--total">
                      <span>Risparmio totale sui {durata} mesi di contratto</span>
                      <span class="simpv__green simpv__big-number">
                        +{eur(risultato.differenza * durata)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Card produzione e consumo (solo BP) */}
            {modalitaBP && energetica && (
              <div class="simpv__card simpv__card--produzione">
                <h4 class="simpv__card-heading">
                  <span class="material-icons-outlined simpv__icon-sun">wb_sunny</span>
                  Analisi energetica
                </h4>
                <div class="simpv__card-row">
                  <span>Consumo annuo stimato (da bolletta {eur(bolletta)}/mese)</span>
                  <span>{Math.round(energetica.consumoAnnuo).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Produzione annua impianto</span>
                  <span>{Math.round(energetica.produzioneAnnua).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Autoconsumo ({Math.round(energetica.autoconsumoPct * 100)}% della produzione)</span>
                  <span>{Math.round(energetica.kwhAutoconsumo).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Immissione in rete</span>
                  <span>{Math.round(energetica.kwhImmissione).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row" style="font-weight:700;">
                  <span>Autosufficienza energetica</span>
                  <span>{Math.round(energetica.autosufficienzaPerc * 100)}%</span>
                </div>
              </div>
            )}

            {/* Tabella comparativa durate */}
            {tabelladurate.length > 1 && (
              <div class="simpv__table-wrap">
                <h4 class="simpv__card-heading">Confronto durate</h4>
                <div class="simpv__table-scroll">
                  <table class="simpv__table">
                    <thead>
                      <tr>
                        <th>Durata</th>
                        <th>Rata mensile</th>
                        <th>Riscatto</th>
                        {modalitaBP && <th>Costo netto</th>}
                        {modalitaBP && <th>Saldo vs bolletta</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tabelladurate.map((r) => (
                        <tr
                          key={r.durata}
                          class={`simpv__table-row ${r.durata === durata ? 'simpv__table-active' : ''}`}
                          onClick={() => setDurata(r.durata)}
                        >
                          <td>{r.durata} mesi</td>
                          <td>{eur(r.rataTotale)}</td>
                          <td>{Math.round(r.riscattoPerc * 100)}%</td>
                          {modalitaBP && r.costoNettoMensile !== undefined && (
                            <td>{eur(r.costoNettoMensile)}</td>
                          )}
                          {modalitaBP && r.differenza !== undefined && (
                            <td class={r.differenza >= 0 ? 'simpv__green' : 'simpv__red'}>
                              {r.differenza >= 0 ? '+' : ''}{eur(r.differenza)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Note */}
            <div class="simpv__note">
              {isLeasing ? (
                <p>* Il preventivo definitivo dipende dalla società di leasing e dalle condizioni di mercato al momento della delibera.</p>
              ) : (
                <>
                  <p>* Coefficienti indicativi per noleggio operativo fotovoltaico. Il preventivo definitivo dipende dalla società di locazione selezionata.</p>
                  {assicurazioneOpzionale && !includiAssicurazione ? (
                    <p>* Assicurazione all-risk opzionale (1,83% annuo) — attiva il toggle sopra per includerla nella rata.</p>
                  ) : !isLeasing && (
                    <p>* Assicurazione all-risk obbligatoria inclusa nel calcolo (1,83% annuo).</p>
                  )}
                  <p>* Riscatto finale variabile per durata: dal 3% (60+ mesi) al 10% (24 mesi).</p>
                </>
              )}
              {modalitaBP && (
                <>
                  <p>* La produzione e il risparmio sono stime basate su dati medi PVGIS. I valori reali dipendono da orientamento, inclinazione, ombreggiamenti e consumi effettivi.</p>
                  <p>* Valore immissione in rete stimato a 0,13 €/kWh (ritiro dedicato medio).</p>
                </>
              )}
              {risultato?.iperBeneficioMensile !== undefined && risultato.iperBeneficioMensile > 0 && (
                <p>* Iperammortamento: il costo ammortizzabile del bene sale al 280% (100% ordinario + 180% maggiorazione). Beneficio fiscale calcolato al 27,8% (IRES + IRAP) sull'intero importo ammortizzabile, distribuito su 9 anni. Richiede beni nuovi 4.0 e perizia asseverata sopra €300k.</p>
              )}
              {risultato?.sabatiniBeneficioMensile !== undefined && risultato.sabatiniBeneficioMensile > 0 && (
                <p>* Sabatini 4.0: contributo MISE stimato al {sabatiniPerc}% dell'investimento, erogato in 6 quote annuali. Il calcolo esatto dipende dalla delibera MISE e dalla durata del finanziamento.</p>
              )}
              {risultato?.zesBeneficioMensile !== undefined && risultato.zesBeneficioMensile > 0 && (
                <p>* ZES Unica: credito d'imposta su investimenti in Mezzogiorno (D.L. 124/2023, prorogato al 2028). Importo soggetto a riparto proporzionale AdE. Investimento minimo €200.000. Non cumulabile con Sabatini 4.0.</p>
              )}
            </div>
          </>
        ) : calcolato && !costoValido ? (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">warning</span>
            <p>Il costo dell'impianto deve essere compreso tra <strong>€800</strong> e <strong>{isLeasing ? '€500.000.000' : '€240.000'}</strong>.</p>
          </div>
        ) : calcolato && !risultato ? (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">info</span>
            <p>Per l'importo e la durata selezionati non è disponibile un coefficiente. Prova con una durata diversa.</p>
          </div>
        ) : (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">edit</span>
            <p>Compila i campi e premi <strong>Calcola preventivo</strong> per vedere il risultato.</p>
          </div>
        )}

      </div>

      {/* Bottone Scarica PDF — disponibile su tutte le varianti partner, fuori dal form invia pratica */}
      {risultato && (varianteForm === 'age-srl' || varianteForm === 'arcaenergia' || varianteForm === 'energyteam') && (
        <div class="simpv__pdf-bar">
          <button
            type="button"
            class="simpv__button simpv__button--pdf"
            onClick={() => generaPDF(
              etClienteRs.trim() ? { ragioneSociale: etClienteRs, referente: etClienteReferente, piva: etClientePiva } : undefined
            )}
          >
            <span class="material-icons-outlined" style="font-size:1.1rem;vertical-align:middle;margin-right:0.35rem;">picture_as_pdf</span>
            Scarica preventivo PDF
          </button>
          <span class="simpv__pdf-hint">
            Il PDF si scarica subito. Se compili la ragione sociale del cliente qui sotto, verra' intestato a lui.
          </span>
        </div>
      )}

      {/* --- FORM INVIO RICHIESTA (variante EnergyTeam / ArcaEnergia / AGE SRL) --- */}
      {(varianteForm === 'energyteam' || varianteForm === 'arcaenergia' || varianteForm === 'age-srl') ? (
        <div class="simpv__lead-bar simpv__lead-bar--energyteam" id="contatti">
          <div class="simpv__lead-bar-info">
            <span class="material-icons-outlined simpv__lead-icon" aria-hidden="true">send</span>
            <div>
              <h4 class="simpv__lead-title">Checklist documenti &amp; invio pratica</h4>
              <p class="simpv__lead-sub">
                {risultato
                  ? "Compila i dati del cliente e spunta i documenti che hai già in tuo possesso. La richiesta arriva direttamente a Mediocredito Facile."
                  : "Calcola prima il preventivo qui sopra, poi compila i dati per inviare la richiesta."}
              </p>
            </div>
          </div>

          <form class="simpv__lead-bar-form simpv__et-form" onSubmit={
            (varianteForm === 'arcaenergia' || varianteForm === 'age-srl') ? handleArcaenergiaSubmit : handleEnergyteamSubmit
          }>
            {/* Dati partner */}
            <div class="simpv__et-section">
              <h5 class="simpv__et-section-title">Dati partner (chi invia la richiesta)</h5>
              <div class="simpv__lead-bar-fields">
                <input
                  type="text"
                  class="simpv__input"
                  placeholder="Nome e cognome"
                  value={etPartnerNome}
                  onInput={(e) => setEtPartnerNome((e.target as HTMLInputElement).value)}
                  required
                />
                <input
                  type="email"
                  class="simpv__input"
                  placeholder="Email"
                  value={etPartnerEmail}
                  onInput={(e) => setEtPartnerEmail((e.target as HTMLInputElement).value)}
                  required
                />
                <input
                  type="tel"
                  class="simpv__input"
                  placeholder="Cellulare"
                  value={etPartnerTelefono}
                  onInput={(e) => setEtPartnerTelefono((e.target as HTMLInputElement).value)}
                  required
                />
              </div>
            </div>

            {/* Dati cliente finale */}
            <div class="simpv__et-section">
              <h5 class="simpv__et-section-title">Dati cliente finale</h5>
              <div class="simpv__lead-bar-fields">
                <input
                  type="text"
                  class="simpv__input"
                  placeholder="Ragione sociale"
                  value={etClienteRs}
                  onInput={(e) => setEtClienteRs((e.target as HTMLInputElement).value)}
                  required
                />
                <input
                  type="text"
                  class="simpv__input"
                  placeholder="Partita IVA (opzionale)"
                  value={etClientePiva}
                  onInput={(e) => setEtClientePiva((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 11))}
                  maxLength={11}
                />
                <input
                  type="text"
                  class="simpv__input"
                  placeholder="Referente / Legale rappresentante"
                  value={etClienteReferente}
                  onInput={(e) => setEtClienteReferente((e.target as HTMLInputElement).value)}
                />
              </div>
            </div>

            {/* Checklist documenti */}
            <div class="simpv__et-section">
              <h5 class="simpv__et-section-title">Documenti richiesti ({currentDocs.length})</h5>
              <ul class="simpv__et-docs">
                {currentDocs.map((doc, i) => (
                  <li key={doc} class="simpv__et-doc">
                    <label>
                      <input
                        type="checkbox"
                        checked={etDocsSpuntati[i]}
                        onChange={() => toggleEtDoc(i)}
                      />
                      <span>{doc}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p class="simpv__et-docs-hint">
                Spunta i documenti che hai già pronti. I file puoi inviarli via email o WhatsApp dopo l'invio della richiesta.
              </p>
            </div>

            {/* Note libere */}
            <div class="simpv__et-section">
              <h5 class="simpv__et-section-title">Note (opzionale)</h5>
              <textarea
                class="simpv__input simpv__et-textarea"
                placeholder="Note sul cliente, sull'impianto, urgenze, condizioni particolari…"
                rows={3}
                value={etNote}
                onInput={(e) => setEtNote((e.target as HTMLTextAreaElement).value)}
              />
            </div>

            <div class="simpv__lead-bar-actions">
              <label class="simpv__privacy">
                <input
                  type="checkbox"
                  checked={formPrivacy}
                  onChange={() => setFormPrivacy(!formPrivacy)}
                />
                <span>Ho letto e accetto l'<a href="/privacy" target="_blank">informativa privacy</a></span>
              </label>
              <button
                type="submit"
                class="simpv__button simpv__button--cta"
                disabled={!formEnergyteamValido || formInvio}
              >
                {formInvio ? 'Generazione preventivo…' :
                  (varianteForm === 'arcaenergia' || varianteForm === 'age-srl')
                    ? 'Invia e scarica preventivo PDF'
                    : 'Invia richiesta a Mediocredito Facile'
                }
              </button>
            </div>
          </form>
        </div>
      ) : modalitaPartner ? (
        <div class="simpv__lead-bar simpv__lead-bar--partner" id="contatti">
          {partnerSbloccato ? (
            <>
              <div class="simpv__lead-bar-info">
                <span class="material-icons-outlined simpv__lead-icon" aria-hidden="true">check_circle</span>
                <div>
                  <h4 class="simpv__lead-title">Preventivo pronto</h4>
                  <p class="simpv__lead-sub">
                    Clicca per stampare o salvare in PDF. Ti ricontattiamo entro 24 ore.
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="simpv__button simpv__button--cta"
                onClick={() => window.print()}
              >
                Stampa / Salva PDF
              </button>
            </>
          ) : (
            <>
              <div class="simpv__lead-bar-info">
                <span class="material-icons-outlined simpv__lead-icon" aria-hidden="true">picture_as_pdf</span>
                <div>
                  <h4 class="simpv__lead-title">Scarica il Preventivo</h4>
                  <p class="simpv__lead-sub">
                    Compila i dati per sbloccare la stampa del preventivo PDF.
                  </p>
                </div>
              </div>
              <form class="simpv__lead-bar-form" onSubmit={handlePartnerSubmit}>
                <div class="simpv__lead-bar-fields">
                  <input
                    type="text"
                    class="simpv__input"
                    placeholder="Nome"
                    value={formNome}
                    onInput={(e) => setFormNome((e.target as HTMLInputElement).value)}
                    required
                  />
                  <input
                    type="text"
                    class="simpv__input"
                    placeholder="Cognome"
                    value={formCognome}
                    onInput={(e) => setFormCognome((e.target as HTMLInputElement).value)}
                    required
                  />
                  <input
                    type="tel"
                    class="simpv__input"
                    placeholder="Cellulare"
                    value={formTelefono}
                    onInput={(e) => setFormTelefono((e.target as HTMLInputElement).value)}
                    required
                  />
                  <input
                    type="text"
                    class="simpv__input"
                    placeholder="Partita IVA"
                    value={formPiva}
                    onInput={(e) => setFormPiva((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 11))}
                    pattern="[0-9]{11}"
                    maxLength={11}
                    required
                  />
                </div>
                <div class="simpv__lead-bar-actions">
                  <label class="simpv__privacy">
                    <input
                      type="checkbox"
                      checked={formPrivacy}
                      onChange={() => setFormPrivacy(!formPrivacy)}
                    />
                    <span>Ho letto e accetto l'<a href="/privacy" target="_blank">informativa privacy</a></span>
                  </label>
                  <button
                    type="submit"
                    class="simpv__button simpv__button--cta"
                    disabled={!formPartnerValido || formInvio}
                  >
                    {formInvio ? 'Invio in corso…' : 'Sblocca Preventivo PDF'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      ) : (
        <div class="simpv__lead-bar" id="contatti">
          <div class="simpv__lead-bar-info">
            <span class="material-icons-outlined simpv__lead-icon" aria-hidden="true">picture_as_pdf</span>
            <div>
              <h4 class="simpv__lead-title">Scarica il Preventivo PDF</h4>
              <p class="simpv__lead-sub">
                PDF personalizzato con il nome della tua azienda, pronto da inviare al cliente.
              </p>
            </div>
          </div>
          <form class="simpv__lead-bar-form" onSubmit={handleFormSubmit}>
            <div class="simpv__lead-bar-fields">
              <input
                type="text"
                class="simpv__input"
                placeholder="Nome e Cognome"
                value={formNome}
                onInput={(e) => setFormNome((e.target as HTMLInputElement).value)}
                required
              />
              <input
                type="text"
                class="simpv__input"
                placeholder="Nome Azienda"
                value={formAzienda}
                onInput={(e) => setFormAzienda((e.target as HTMLInputElement).value)}
                required
              />
              <input
                type="email"
                class="simpv__input"
                placeholder="Email"
                value={formEmail}
                onInput={(e) => setFormEmail((e.target as HTMLInputElement).value)}
                required
              />
              <input
                type="tel"
                class="simpv__input"
                placeholder="Cellulare"
                value={formTelefono}
                onInput={(e) => setFormTelefono((e.target as HTMLInputElement).value)}
                required
              />
            </div>
            <div class="simpv__lead-bar-actions">
              <label class="simpv__privacy">
                <input
                  type="checkbox"
                  checked={formPrivacy}
                  onChange={() => setFormPrivacy(!formPrivacy)}
                />
                <span>Ho letto e accetto l'<a href="/privacy" target="_blank">informativa privacy</a></span>
              </label>
              <button
                type="submit"
                class="simpv__button simpv__button--cta"
                disabled={!formValido || formInvio}
              >
                {formInvio ? 'Invio in corso…' : 'Scarica Preventivo PDF'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
