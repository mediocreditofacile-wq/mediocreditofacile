import { useState, useMemo } from 'preact/hooks';
import './simulatore-fotovoltaico.css';
import {
  calcolaRataLeasing,
  calcolaIperammortamento,
  calcolaSabatini,
  LEASING_DEFAULTS,
  DURATE_LEASING,
  ANTICIPO_OPTIONS,
  SABATINI_DEFAULT_PERC,
} from '../../data/leasing';

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
const ENERGY_PRICE = 0.25;    // €/kWh costo medio energia (bolletta)
const FEED_IN_PRICE = 0.13;   // €/kWh valore immissione in rete (ritiro dedicato / vendita)

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

// Autoconsumo per tipo attivita (senza/con accumulo)
const SELF_CONSUMPTION: Record<string, { senza: number; con: number }> = {
  industriale: { senza: 0.60, con: 0.80 },
  commerciale: { senza: 0.47, con: 0.72 },
  residenziale: { senza: 0.37, con: 0.80 },
};

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
  costoNettoMensile?: number;            // bolletta - autoconsumo + rata - immissione - agevolazioni
  differenza?: number;                   // bolletta - costoNettoMensile (>0 = risparmio complessivo)
}

interface Props {
  modalitaPartner?: boolean;
  // Quando true: toggle che permette di includere / escludere l'assicurazione all-risk dalla rata.
  // Default OFF: la rata mostrata e' il canone puro, l'assicurazione e' solo informativa.
  assicurazioneOpzionale?: boolean;
  // Variante del form di richiesta in fondo al simulatore.
  varianteForm?: 'standard' | 'energyteam' | 'arcaenergia';
  // Se settata, forza un coefficiente di irraggiamento unico indipendentemente dalla zona selezionata.
  zonaFissa?: 'nord' | 'centro' | 'sud' | 'isole';
  // Quando true: mostra lo switch Noleggio Operativo / Leasing Finanziario
  abilitaLeasing?: boolean;
  // Quando true: mostra i toggle iperammortamento e Sabatini (solo in modalita' leasing + BP)
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

  // Modalita' finanziaria effettiva (leasing solo se abilitato)
  const isLeasing = abilitaLeasing && modalitaFin === 'leasing';
  // Agevolazioni visibili solo con leasing + BP
  const mostraAgevolazioni = abilitaAgevolazioni && isLeasing && modalitaBP;

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
    if (!modalitaBP || potenza <= 0) return null;
    const produzioneAnnua = potenza * (IRRADIANCE[zonaEffettiva] ?? 1100);
    const autoconsumoPct = SELF_CONSUMPTION[tipoAttivita]?.[accumulo > 0 ? 'con' : 'senza'] ?? 0.47;
    const kwhAutoconsumo = produzioneAnnua * autoconsumoPct;
    const kwhImmissione = produzioneAnnua * (1 - autoconsumoPct);
    const risparmioAutoconsumo = kwhAutoconsumo * ENERGY_PRICE / 12;
    const valoreImmissione = kwhImmissione * FEED_IN_PRICE / 12;
    const risparmioMensile = risparmioAutoconsumo + valoreImmissione;

    return {
      produzioneAnnua,
      autoconsumoPct,
      kwhAutoconsumo,
      kwhImmissione,
      risparmioMensile,
      risparmioAutoconsumoMensile: risparmioAutoconsumo,
      valoreImmissioneMensile: valoreImmissione,
    };
  }, [modalitaBP, potenza, accumulo, zonaEffettiva, tipoAttivita]);

  // Funzione helper: calcola risultato per una durata specifica
  function calcolaPerDurata(d: number): RisultatoDurata | null {
    if (costo < 800 || costo > 240000) return null;

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

    if (modalitaBP && energetica) {
      res.risparmioMensile = energetica.risparmioMensile;
      res.risparmioAutoconsumoMensile = energetica.risparmioAutoconsumoMensile;
      res.valoreImmissioneMensile = energetica.valoreImmissioneMensile;

      // Agevolazioni (solo leasing)
      let beneficioAgevolazioni = 0;
      if (isLeasing && includiIper) {
        const iper = calcolaIperammortamento(costo);
        res.iperBeneficioMensile = iper.beneficioMensile;
        beneficioAgevolazioni += iper.beneficioMensile;
      }
      if (isLeasing && includiSabatini) {
        const sab = calcolaSabatini(costo, sabatiniPerc);
        res.sabatiniBeneficioMensile = sab.contributoMensile;
        beneficioAgevolazioni += sab.contributoMensile;
      }

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
      includiIper, includiSabatini, sabatiniPerc]);

  // Tabella comparativa per tutte le durate
  const duratePerTabella = isLeasing ? DURATE_LEASING : DURATE;
  const tabelladurate = useMemo((): RisultatoDurata[] => {
    if (!calcolato || costo < 800 || costo > 240000) return [];
    return duratePerTabella
      .map((d) => calcolaPerDurata(d))
      .filter((r): r is RisultatoDurata => r !== null);
  }, [calcolato, costo, modalitaBP, energetica, bolletta, assicurazioneOpzionale,
      includiAssicurazione, isLeasing, tanLeasing, anticipoPerc, riscattoLeasing,
      includiIper, includiSabatini, sabatiniPerc]);

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
      const clamped = Math.min(240000, Math.max(800, costo));
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
        ...(modalitaBP ? { potenza_kwp: potenza, zona: zonaEffettiva, tipo_attivita: tipoAttivita } : {}),
      });
    }
  };

  // Click "Calcola"
  const handleCalcola = () => {
    if (costo > 0) {
      const clamped = Math.min(240000, Math.max(800, costo));
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
    if (includiSabatini) docs.push(...ARCAENERGIA_DOCS_SABATINI);
    return docs;
  }, [isLeasing, includiIper, includiSabatini]);

  const currentDocs = varianteForm === 'arcaenergia' ? arcaEnergiaDocs : ENERGYTEAM_DOCS;
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

    const body = new FormData();
    body.append('fonte', 'arcaenergia');
    body.append('tool', 'simulatore_arcaenergia');
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

  const costoValido = costo >= 800 && costo <= 240000;
  const formValido = formNome.trim() && formAzienda.trim() && formEmail.trim() && formTelefono.trim() && formPrivacy;
  const formPartnerValido = formNome.trim() && formCognome.trim() && formTelefono.trim() && formPiva.trim().length >= 11 && formPrivacy;
  const formEnergyteamValido = Boolean(
    etPartnerNome.trim() && etPartnerEmail.trim() && etPartnerTelefono.trim() && etClienteRs.trim() && formPrivacy && risultato,
  );

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
            onInput={handleNumericInput(setCosto, setCostoInput, 240000)}
            onBlur={handleCostoBlur}
            placeholder="15000"
          />
          <span class="simpv__hint">Min €800 — Max €240.000</span>
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

        {/* Card Agevolazioni 4.0 — visibile solo con leasing + BP attivo */}
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
                    ? 'Attivo — maggiorazione 280% del costo ammortizzabile (IRES 24%)'
                    : 'Maggiorazione fino al 280% per beni nuovi Industria 4.0'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includiIper}
                onChange={() => { setIncludiIper(!includiIper); setCalcolato(false); }}
              />
              <span class="simpv__toggle-switch" />
            </label>

            {/* Toggle Sabatini 4.0 */}
            <label class={`simpv__toggle-card simpv__toggle-card--small ${includiSabatini ? 'simpv__toggle-card--active' : ''}`}>
              <span class="material-icons-outlined simpv__toggle-icon" aria-hidden="true">
                {includiSabatini ? 'check_circle' : 'savings'}
              </span>
              <div class="simpv__toggle-content">
                <div class="simpv__toggle-title">Sabatini 4.0</div>
                <div class="simpv__toggle-desc">
                  {includiSabatini
                    ? `Attivo — contributo MISE ${sabatiniPerc}% in 6 quote annuali`
                    : 'Contributo MISE per investimenti 4.0 in leasing'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={includiSabatini}
                onChange={() => { setIncludiSabatini(!includiSabatini); setCalcolato(false); }}
              />
              <span class="simpv__toggle-switch" />
            </label>

            {/* Campo % Sabatini (visibile solo se attivo) */}
            {includiSabatini && (
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
              </div>
            )}

            {/* Card produzione (solo BP) */}
            {modalitaBP && energetica && (
              <div class="simpv__card simpv__card--produzione">
                <h4 class="simpv__card-heading">
                  <span class="material-icons-outlined simpv__icon-sun">wb_sunny</span>
                  Stima produzione
                </h4>
                <div class="simpv__card-row">
                  <span>Produzione annua</span>
                  <span>{Math.round(energetica.produzioneAnnua).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Autoconsumo ({Math.round(energetica.autoconsumoPct * 100)}%)</span>
                  <span>{Math.round(energetica.kwhAutoconsumo).toLocaleString('it-IT')} kWh</span>
                </div>
                <div class="simpv__card-row">
                  <span>Immissione in rete</span>
                  <span>{Math.round(energetica.kwhImmissione).toLocaleString('it-IT')} kWh</span>
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
                <p>* Iperammortamento: beneficio fiscale IRES (24%) sulla maggiorazione 180%, distribuito su 9 anni di ammortamento. Richiede beni nuovi 4.0 e perizia asseverata sopra €300k.</p>
              )}
              {risultato?.sabatiniBeneficioMensile !== undefined && risultato.sabatiniBeneficioMensile > 0 && (
                <p>* Sabatini 4.0: contributo MISE stimato al {sabatiniPerc}% dell'investimento, erogato in 6 quote annuali. Il calcolo esatto dipende dalla delibera MISE e dalla durata del finanziamento.</p>
              )}
            </div>
          </>
        ) : calcolato && !costoValido ? (
          <div class="simpv__message">
            <span class="material-icons-outlined simpv__message-icon">warning</span>
            <p>Il costo dell'impianto deve essere compreso tra <strong>€800</strong> e <strong>€240.000</strong>.</p>
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

      {/* --- FORM INVIO RICHIESTA (variante EnergyTeam / ArcaEnergia) --- */}
      {(varianteForm === 'energyteam' || varianteForm === 'arcaenergia') ? (
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

          <form class="simpv__lead-bar-form simpv__et-form" onSubmit={varianteForm === 'arcaenergia' ? handleArcaenergiaSubmit : handleEnergyteamSubmit}>
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
                {formInvio ? 'Invio in corso…' : 'Invia richiesta a Mediocredito Facile'}
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
