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
export const ANTICIPO_OPTIONS = [10, 15, 20];

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

const ALIQUOTA_IRES = 0.278; // IRES 24% + IRAP 3,8% = 27,8% effettivo
const ANNI_AMMORTAMENTO_FV = 9; // coefficiente 11,11% — impianti FER

export function calcolaIperammortamento(costoImpianto: number): {
  maggiorazionePerc: number;
  costoAmmortizzabilePerc: number;
  maggiorazione: number;
  costoAmmortizzabileTotale: number;
  beneficioFiscaleTotale: number;
  beneficioAnnuo: number;
  beneficioMensile: number;
} {
  const fascia = IPER_FASCE.find(f => costoImpianto <= f.fino);
  const maggiorazionePerc = fascia?.maggiorazionePerc ?? 0;
  // Costo ammortizzabile totale = 100% (ordinario) + maggiorazione (180/100/50%)
  const costoAmmortizzabilePerc = 100 + maggiorazionePerc; // 280%, 200% o 150%
  const maggiorazione = costoImpianto * (maggiorazionePerc / 100);
  const costoAmmortizzabileTotale = costoImpianto + maggiorazione;

  // Beneficio fiscale sull'INTERO costo ammortizzabile (280%, non solo la maggiorazione)
  // Il cliente scarica fiscalmente il 280% del bene, non il 100% standard
  const beneficioFiscaleTotale = costoAmmortizzabileTotale * ALIQUOTA_IRES;
  const beneficioAnnuo = beneficioFiscaleTotale / ANNI_AMMORTAMENTO_FV;
  const beneficioMensile = beneficioAnnuo / 12;

  return {
    maggiorazionePerc,
    costoAmmortizzabilePerc,
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


// --- ZES Unica (D.L. 124/2023, prorogata L. 207/2025 fino al 31/12/2028) ---
// Credito d'imposta su investimenti in beni strumentali nuovi per strutture produttive in ZES Unica (Mezzogiorno).
// Soglia minima: €200.000 per progetto. NON cumulabile con Sabatini 4.0.

// Aliquote per territorio e dimensione impresa (Carta Aiuti Regionali 2022-2027)
export const ZES_REGIONI: { label: string; key: string; aliquote: { piccola: number; media: number; grande: number } }[] = [
  { label: 'Campania', key: 'campania', aliquote: { piccola: 60, media: 50, grande: 40 } },
  { label: 'Puglia', key: 'puglia', aliquote: { piccola: 60, media: 50, grande: 40 } },
  { label: 'Calabria', key: 'calabria', aliquote: { piccola: 60, media: 50, grande: 40 } },
  { label: 'Sicilia', key: 'sicilia', aliquote: { piccola: 60, media: 50, grande: 40 } },
  { label: 'Basilicata', key: 'basilicata', aliquote: { piccola: 50, media: 40, grande: 30 } },
  { label: 'Molise', key: 'molise', aliquote: { piccola: 50, media: 40, grande: 30 } },
  { label: 'Sardegna', key: 'sardegna', aliquote: { piccola: 50, media: 40, grande: 30 } },
  { label: 'Abruzzo', key: 'abruzzo', aliquote: { piccola: 35, media: 25, grande: 15 } },
  { label: 'Puglia — JTF (Brindisi/Taranto)', key: 'puglia-jtf', aliquote: { piccola: 70, media: 60, grande: 50 } },
  { label: 'Sardegna — JTF (Sulcis)', key: 'sardegna-jtf', aliquote: { piccola: 60, media: 50, grande: 40 } },
];

export type DimensioneImpresa = 'piccola' | 'media' | 'grande';

export const DIMENSIONE_LABELS: Record<DimensioneImpresa, string> = {
  piccola: 'Piccola impresa',
  media: 'Media impresa',
  grande: 'Grande impresa',
};

export function calcolaZES(
  costoImpianto: number,
  regioneKey: string,
  dimensione: DimensioneImpresa,
): {
  aliquotaPerc: number;
  creditoImposta: number;
  creditoMensile: number; // distribuito sulla durata leasing per confronto BP
} {
  const regione = ZES_REGIONI.find(r => r.key === regioneKey);
  const aliquotaPerc = regione?.aliquote[dimensione] ?? 0;
  const creditoImposta = costoImpianto * (aliquotaPerc / 100);
  // Distribuzione su 5 anni (durata minima mantenimento bene in ZES) per confronto mensile
  const creditoMensile = creditoImposta / 60;

  return { aliquotaPerc, creditoImposta, creditoMensile };
}


// ═══════════════════════════════════════════════════════════════════════════
// SIMULATORE LEASING MULTI-PARTNER (SELLA, ALBA)
// Reverse engineering quotatore Lease for Business — Affida (maggio 2026)
// ═══════════════════════════════════════════════════════════════════════════

// Euribor 3M — da aggiornare manualmente quando il valore cambia in modo significativo
// Fonte: rilevazione su Lease for Business al 09/05/2026 (Banca d'Italia / EMMI)
export const EURIBOR_3M = 2.23; // % annuo
export const EURIBOR_3M_DATA = '09/05/2026';

// Tipologie bene supportate dal simulatore leasing
// Per ora SOLO strumentale generico, ma struttura parametrica per estensione futura
export type TipologiaBene = 'strumentale-generico';

export const TIPOLOGIE_BENE: { key: TipologiaBene; label: string; coeffAmmortamento: number; anniAmmortamento: number }[] = [
  // Coefficiente ammortamento fiscale: D.M. 31/12/1988, gruppo XXII "Altre attivita'"
  // Strumentale generico = "Macchinari, apparecchi e attrezzature varie" → 6,67% → 15 anni
  { key: 'strumentale-generico', label: 'Strumentale generico', coeffAmmortamento: 6.67, anniAmmortamento: 15 },
];

// Modello di calcolo della rata leasing
// - 'standard': Tasso = Spread + Euribor; rata francese su (importo - anticipo); riscatto attualizzato
// - 'capitale-gonfiato': Tasso = Spread + Euribor; rata francese su (importo - anticipo + provvigione); riscatto attualizzato
//   (modello SELLA: la provvigione viene "scaricata" sul cliente caricandola nel capitale finanziato)
export type ModelloCalcolo = 'standard' | 'capitale-gonfiato';

export interface CondizioneLeasing {
  id: number;           // IdCondizioneLeasing nel quotatore Affida
  spread: number;       // % (per ALBA = spread lordo; per SELLA = spread netto)
  provvigionePerc?: number; // % sull'importo (modello SELLA)
  provvigionePercSuSpread?: number; // % sullo spread lordo (modello ALBA)
}

export interface PartnerLeasing {
  key: 'sella' | 'alba' | 'credem';
  label: string;
  shortLabel: string;
  badgeColor: string;
  modello: ModelloCalcolo;
  importoMin: number;
  importoMax: number;
  durateAmmesse: number[];           // mesi
  riscattoMaxPerDurata: Record<number, number>; // mesi → max %
  speseIstruttoria: number;          // €
  speseIncassoRata: number;          // € per rata
  // Condizioni per durata: alcuni partner (ALBA) hanno condizioni che cambiano per durata
  // Mappa durata → lista condizioni; chiave 'default' per partner che non differenziano
  condizioniPerDurata: Record<string, CondizioneLeasing[]>;
  // Spread "medio commerciale" usato in modalità fornitori (variante senza scelta condizione).
  // Va sempre cercato fra le condizioni disponibili per la durata corrente (con fallback alla
  // condizione con spread immediatamente >= a questo valore).
  spreadFornitori: number;
}

// Riscatto massimo per durata (validato sia per SELLA sia per ALBA in fase di test)
const RISCATTO_MAX_STD: Record<number, number> = {
  24: 50, 36: 40, 48: 30, 60: 20, 72: 15, 84: 10,
};

// SELLA LEASING SPA × AFFIDA
// Modello pricing: Spread netto + Provvigione % separata fissa (1%)
// Le condizioni NON cambiano con la durata
export const SELLA: PartnerLeasing = {
  key: 'sella',
  label: 'Sella Leasing',
  shortLabel: 'SELLA',
  badgeColor: '#1e40af',
  modello: 'capitale-gonfiato',
  importoMin: 9_000,
  importoMax: 9_999_999,
  durateAmmesse: [24, 36, 48, 60, 72, 84],
  riscattoMaxPerDurata: RISCATTO_MAX_STD,
  speseIstruttoria: 380,
  speseIncassoRata: 6,
  spreadFornitori: 2.75,
  condizioniPerDurata: {
    default: [
      { id: 397300, spread: 2.25, provvigionePerc: 1 },
      { id: 395412, spread: 2.50, provvigionePerc: 1 },
      { id: 395416, spread: 2.75, provvigionePerc: 1 },
      { id: 395420, spread: 3.00, provvigionePerc: 1 },
      { id: 395424, spread: 3.25, provvigionePerc: 1 },
      { id: 395428, spread: 3.50, provvigionePerc: 1 },
      { id: 395432, spread: 3.75, provvigionePerc: 1 },
      { id: 395436, spread: 4.00, provvigionePerc: 1 },
    ],
  },
};

// ALBA LEASING S.P.A.
// Modello pricing: Spread Lordo + Prov. % Su Spread Lordo
// Le condizioni cambiano con la durata (36m: prov 30%; 60-84m: prov 60%)
export const ALBA: PartnerLeasing = {
  key: 'alba',
  label: 'Alba Leasing',
  shortLabel: 'ALBA',
  badgeColor: '#0f766e',
  modello: 'standard',
  importoMin: 5_000,
  importoMax: 9_999_999,
  durateAmmesse: [24, 36, 48, 60, 72, 84],
  riscattoMaxPerDurata: RISCATTO_MAX_STD,
  speseIstruttoria: 400,
  speseIncassoRata: 5,
  spreadFornitori: 3.00,
  condizioniPerDurata: {
    // Per durate 24-48 mesi: provvigione 30% sullo spread lordo, spread leggermente piu' alto
    '36': [
      { id: 394802, spread: 2.60, provvigionePercSuSpread: 30 },
      { id: 394803, spread: 2.85, provvigionePercSuSpread: 30 },
      { id: 394804, spread: 3.10, provvigionePercSuSpread: 30 },
      { id: 394805, spread: 3.35, provvigionePercSuSpread: 30 },
      { id: 394806, spread: 3.60, provvigionePercSuSpread: 30 },
      { id: 394807, spread: 3.85, provvigionePercSuSpread: 30 },
      { id: 394808, spread: 4.10, provvigionePercSuSpread: 30 },
      { id: 394809, spread: 4.35, provvigionePercSuSpread: 30 },
      { id: 394810, spread: 4.60, provvigionePercSuSpread: 30 },
      { id: 394811, spread: 4.85, provvigionePercSuSpread: 30 },
    ],
    // Per durate 60-84 mesi: provvigione 60% sullo spread lordo
    default: [
      { id: 394812, spread: 2.50, provvigionePercSuSpread: 60 },
      { id: 394813, spread: 2.75, provvigionePercSuSpread: 60 },
      { id: 394814, spread: 3.00, provvigionePercSuSpread: 60 },
      { id: 394815, spread: 3.25, provvigionePercSuSpread: 60 },
      { id: 394816, spread: 3.50, provvigionePercSuSpread: 60 },
      { id: 394817, spread: 3.75, provvigionePercSuSpread: 60 },
      { id: 394818, spread: 4.00, provvigionePercSuSpread: 60 },
      { id: 394819, spread: 4.25, provvigionePercSuSpread: 60 },
      { id: 394820, spread: 4.50, provvigionePercSuSpread: 60 },
      { id: 394821, spread: 4.75, provvigionePercSuSpread: 60 },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────────
// CAMPAGNA ALBA — Easy Lease (valida fino al 30/06/2026)
// Comunicazione Help Desk Leasing Alba di maggio 2026.
// Condizioni dedicate alla rete segnalatori MCF.
// ──────────────────────────────────────────────────────────────────────────
export const ALBA_EASY_LEASE = {
  attiva: true,
  nome: 'Easy Lease',
  scadenza: '2026-06-30',
  scadenzaLabel: '30 giugno 2026',
  importoMax: 200_000,
  prodottiAmmessi: ['strumentale-generico'] as const,
  // Override delle condizioni standard ALBA quando la campagna si applica:
  override: {
    anticipoPerc: 0,        // canone anticipato 0
    speseIstruttoria: 0,    // IST 0 (la campagna le azzera lato partner)
    // NB: "spese di contratto (IMP)" sono spese di stipula una tantum NON modellate
    // nella nostra rata (la nostra somma è anticipo + N×rata + riscatto + istruttoria + N×incasso rata),
    // quindi non c'è nulla da azzerare oltre.
  },
  cumulabilita: 'Cumulabile con Nuova Sabatini, MCC – Fondo di Garanzia e Crediti d\'imposta.',
};

// ──────────────────────────────────────────────────────────────────────────
// VARIANTE LO MARTIRE — markup intermediario sommato alle spese istruttoria
// ──────────────────────────────────────────────────────────────────────────
// Lorenzo Lo Martire e' l'intestatario delle pratiche raccolte tramite il
// simulatore dedicato in /tools/simulatore-leasing-lomartire. Sopra le spese
// istruttoria standard del partner viene SOMMATO un suo markup espresso in
// percentuale sull'importo del bene.
//
// - Mandanti standard (Sella, Alba senza promo, Credem): markup 1,00%
// - Mandante Alba in promo Easy Lease: markup 1,20% (Alba azzera l'istruttoria
//   come parte della campagna, Lo Martire ne approfitta per applicare un
//   markup leggermente piu' alto)
export const COMPENSO_LOMARTIRE_PERC = 1.0;          // % sull'importo
export const COMPENSO_LOMARTIRE_ALBA_PROMO_PERC = 1.2;

/**
 * Restituisce il markup Lo Martire (in €) per un dato partner+importo,
 * tenendo conto della promo Easy Lease.
 */
export function compensoLoMartire(partner: PartnerLeasing, importo: number, tipologia: TipologiaBene): {
  perc: number;
  euro: number;
} {
  const perc = easyLeaseEligibile(partner, importo, tipologia)
    ? COMPENSO_LOMARTIRE_ALBA_PROMO_PERC
    : COMPENSO_LOMARTIRE_PERC;
  return { perc, euro: importo * perc / 100 };
}

/**
 * Verifica se la campagna Easy Lease è applicabile a un dato partner+importo+tipologia.
 * NB: non controlla la data di scadenza (lasciamo che la pagina mostri la promo finché
 * Alberto non aggiorna `attiva: false` o sposta la scadenza).
 */
export function easyLeaseEligibile(partner: PartnerLeasing, importo: number, tipologia: TipologiaBene): boolean {
  if (!ALBA_EASY_LEASE.attiva) return false;
  if (partner.key !== 'alba') return false;
  if (importo <= 0 || importo > ALBA_EASY_LEASE.importoMax) return false;
  if (!ALBA_EASY_LEASE.prodottiAmmessi.includes(tipologia)) return false;
  return true;
}


// CREDEM LEASING SPA
// Modello pricing identico a SELLA (spread netto + provvigione % separata),
// ma a differenza di SELLA la provvigione % varia per condizione (1% → 4,25%).
// 14 livelli di spread/provvigione (vs 8 di SELLA).
// Le condizioni NON cambiano con la durata; il quotatore Affida richiede
// anche la provincia sede cliente (non rilevante per il calcolo della rata).
export const CREDEM: PartnerLeasing = {
  key: 'credem',
  label: 'Credem Leasing',
  shortLabel: 'CREDEM',
  badgeColor: '#c8102e',
  modello: 'capitale-gonfiato',
  importoMin: 5_000,
  importoMax: 9_999_999,
  durateAmmesse: [36, 48, 60, 72, 84],
  riscattoMaxPerDurata: RISCATTO_MAX_STD,
  speseIstruttoria: 350,
  speseIncassoRata: 5,
  spreadFornitori: 2.80,
  condizioniPerDurata: {
    default: [
      { id: 391657, spread: 2.60, provvigionePerc: 1.00 },
      { id: 391659, spread: 2.70, provvigionePerc: 1.10 },
      { id: 391661, spread: 2.80, provvigionePerc: 1.25 },
      { id: 391663, spread: 2.90, provvigionePerc: 1.50 },
      { id: 391665, spread: 3.10, provvigionePerc: 1.75 },
      { id: 391667, spread: 3.30, provvigionePerc: 2.00 },
      { id: 391669, spread: 3.55, provvigionePerc: 2.25 },
      { id: 391671, spread: 3.80, provvigionePerc: 2.50 },
      { id: 391673, spread: 4.05, provvigionePerc: 2.75 },
      { id: 391675, spread: 4.30, provvigionePerc: 3.00 },
      { id: 391677, spread: 4.55, provvigionePerc: 3.25 },
      { id: 391679, spread: 4.80, provvigionePerc: 3.50 },
      { id: 391681, spread: 5.05, provvigionePerc: 4.00 },
      { id: 391683, spread: 5.30, provvigionePerc: 4.25 },
    ],
  },
};

export const PARTNERS_LEASING: PartnerLeasing[] = [SELLA, ALBA, CREDEM];

/**
 * Recupera la lista condizioni applicabili a un partner per una data durata.
 * Per SELLA: sempre 'default'. Per ALBA: '36' se durata <=48, altrimenti 'default'.
 */
export function getCondizioniPerDurata(partner: PartnerLeasing, durata: number): CondizioneLeasing[] {
  if (partner.key === 'alba' && durata <= 48) {
    return partner.condizioniPerDurata['36'] ?? partner.condizioniPerDurata.default;
  }
  return partner.condizioniPerDurata.default;
}

/**
 * Trova la condizione "media commerciale" da usare nella variante fornitori.
 * Cerca nelle condizioni applicabili alla durata corrente quella col `spread === spreadFornitori`;
 * se non c'e' un match esatto, usa quella con spread immediatamente superiore (fallback prudenziale:
 * meglio sovrastimare la rata che sottostimarla in un preventivo).
 */
export function getCondizioneFornitori(partner: PartnerLeasing, durata: number): CondizioneLeasing {
  const cond = getCondizioniPerDurata(partner, durata);
  const target = partner.spreadFornitori;
  const match = cond.find(c => Math.abs(c.spread - target) < 0.001);
  if (match) return match;
  const fallback = cond.find(c => c.spread >= target) ?? cond[cond.length - 1];
  return fallback;
}

/**
 * Calcola la provvigione € per una condizione su un dato importo.
 */
export function calcolaProvvigione(condizione: CondizioneLeasing, importo: number): number {
  if (condizione.provvigionePerc !== undefined) {
    return importo * (condizione.provvigionePerc / 100);
  }
  if (condizione.provvigionePercSuSpread !== undefined) {
    return importo * (condizione.spread / 100) * (condizione.provvigionePercSuSpread / 100);
  }
  return 0;
}

export interface RisultatoLeasing {
  rataMensile: number;
  numRate: number;
  anticipo: number;
  riscatto: number;
  capitaleFinanziato: number;
  provvigione: number;
  tassoLeasingDichiarato: number;  // tasso che il partner mostra al cliente (può differire da quello effettivo nel modello SELLA)
  tassoEffettivo: number;          // tasso usato nel calcolo: spread + euribor
  speseIstruttoria: number;
  speseIncassoRata: number;
  totaleCanoni: number;            // anticipo + (n.rate × rata) + riscatto + spese istruttoria + (n.rate × incasso)
  costoComplessivo: number;        // totaleCanoni - importo bene (= costo del leasing per il cliente)
}

/**
 * Calcola la rata leasing per un partner specifico applicando il modello corretto.
 *
 * - ALBA (modello 'standard'): Tasso = Spread Lordo + Euribor, rata francese su (importo - anticipo).
 *   Tasso dichiarato = Tasso effettivo. Provvigione esterna al calcolo cliente.
 *
 * - SELLA (modello 'capitale-gonfiato'): Tasso effettivo = Spread + Euribor (piu' basso del dichiarato),
 *   ma la provvigione viene aggiunta al capitale finanziato. Risultato: rata leggermente piu' alta
 *   del puro spread+euribor, e il "Tasso leasing" dichiarato (4,94% nei test) e' un tasso lordo
 *   apparente che incorpora la provvigione nel display.
 */
export function calcolaRataLeasingPartner(
  partner: PartnerLeasing,
  importo: number,
  durata: number,
  anticipoPerc: number,
  riscattoPerc: number,
  condizioneId: number,
): RisultatoLeasing {
  const condizioni = getCondizioniPerDurata(partner, durata);
  const condizione = condizioni.find(c => c.id === condizioneId) ?? condizioni[0];

  const anticipo = importo * (anticipoPerc / 100);
  const riscatto = importo * (riscattoPerc / 100);
  const numRate = durata - 1; // primo mese = anticipo
  const provvigione = calcolaProvvigione(condizione, importo);

  // Tasso effettivo usato nel calcolo della rata
  const tassoEffettivo = condizione.spread + EURIBOR_3M;
  const r = tassoEffettivo / 100 / 12; // tasso mensile

  // Capitale su cui calcolare la rata: dipende dal modello
  // - standard (ALBA): solo importo - anticipo
  // - capitale-gonfiato (SELLA): importo - anticipo + provvigione (la provvigione e' caricata sul cliente)
  const capitaleBase = importo - anticipo;
  const capitaleAmmortizzabile = partner.modello === 'capitale-gonfiato'
    ? capitaleBase + provvigione
    : capitaleBase;

  // Rata francese con riscatto attualizzato
  const pvRiscatto = riscatto / Math.pow(1 + r, numRate);
  const capitaleFinanziato = capitaleAmmortizzabile - pvRiscatto;
  const rataMensile = capitaleFinanziato * (r * Math.pow(1 + r, numRate)) / (Math.pow(1 + r, numRate) - 1);

  // Tasso del piano: per entrambi i partner = Spread + Euribor.
  // Il "Tasso leasing" che SELLA mostra nel quotatore Affida (4,94% in baseline) e' un display
  // marketing che incorpora visivamente la provvigione: noi preferiamo essere espliciti e
  // mostrare il tasso reale + la voce "provvigione caricata sulla rata" come riga a parte.
  const tassoLeasingDichiarato = tassoEffettivo;

  const totaleCanoni = anticipo + numRate * rataMensile + riscatto + partner.speseIstruttoria + numRate * partner.speseIncassoRata;
  const costoComplessivo = totaleCanoni - importo;

  return {
    rataMensile,
    numRate,
    anticipo,
    riscatto,
    capitaleFinanziato,
    provvigione,
    tassoLeasingDichiarato,
    tassoEffettivo,
    speseIstruttoria: partner.speseIstruttoria,
    speseIncassoRata: partner.speseIncassoRata,
    totaleCanoni,
    costoComplessivo,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// SABATINI ORDINARIA vs SABATINI 4.0 — formula MISE corretta (VAN interessi)
// ═══════════════════════════════════════════════════════════════════════════
// Il contributo MISE in conto interessi si calcola come totale interessi su un
// finanziamento equivalente di 5 anni a tasso agevolato:
//   - Sabatini ordinaria: tasso 2,75% annuo (BCE + maggiorazione standard)
//   - Sabatini 4.0:       tasso 3,575% annuo (ordinaria + 30% di maggiorazione, beni 4.0)
// Erogazione in 6 quote annuali (semplificate come uguali per la UI).

export const SABATINI_TASSO_ORDINARIA = 2.75;   // % annuo
export const SABATINI_TASSO_4_0 = 3.575;        // % annuo (Alberto: "metti sempre la 4.0 a 3,57")
export const SABATINI_DURATA_MESI = 60;         // 5 anni
export const SABATINI_QUOTE_ANNI = 6;

export type TipoSabatini = 'ordinaria' | '4-0';

export function calcolaSabatiniMise(costoBene: number, tipo: TipoSabatini): {
  tipo: TipoSabatini;
  tassoAgevolato: number;
  contributoTotale: number;
  contributoAnnuo: number;
  contributoMensile: number;
  rataEquivalente: number;
} {
  const tassoAgevolato = tipo === '4-0' ? SABATINI_TASSO_4_0 : SABATINI_TASSO_ORDINARIA;
  const i = tassoAgevolato / 100 / 12;
  const n = SABATINI_DURATA_MESI;

  // Rata francese del finanziamento equivalente
  const rataEquivalente = costoBene * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);

  // Contributo MISE = somma degli interessi pagati nei 5 anni
  const contributoTotale = rataEquivalente * n - costoBene;

  // Erogazione in 6 quote annuali (legge: prima quota maggiore, le altre uguali — semplificate)
  const contributoAnnuo = contributoTotale / SABATINI_QUOTE_ANNI;
  const contributoMensile = contributoAnnuo / 12;

  return {
    tipo,
    tassoAgevolato,
    contributoTotale,
    contributoAnnuo,
    contributoMensile,
    rataEquivalente,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// IPERAMMORTAMENTO PARAMETRIZZATO PER TIPOLOGIA BENE
// ═══════════════════════════════════════════════════════════════════════════
// Estensione di calcolaIperammortamento con durata ammortamento configurabile.
// La funzione esistente (FV, 9 anni) resta inalterata per non rompere il SimulatoreFotovoltaico.

export function calcolaIperammortamentoBene(costoBene: number, tipologia: TipologiaBene): {
  tipologia: TipologiaBene;
  anniAmmortamento: number;
  maggiorazionePerc: number;
  costoAmmortizzabilePerc: number;
  maggiorazione: number;
  costoAmmortizzabileTotale: number;
  beneficioFiscaleTotale: number;
  beneficioAnnuo: number;
  beneficioMensile: number;
} {
  const tipologiaInfo = TIPOLOGIE_BENE.find(t => t.key === tipologia) ?? TIPOLOGIE_BENE[0];
  const anni = tipologiaInfo.anniAmmortamento;

  const fascia = IPER_FASCE.find(f => costoBene <= f.fino);
  const maggiorazionePerc = fascia?.maggiorazionePerc ?? 0;
  const costoAmmortizzabilePerc = 100 + maggiorazionePerc;
  const maggiorazione = costoBene * (maggiorazionePerc / 100);
  const costoAmmortizzabileTotale = costoBene + maggiorazione;

  const beneficioFiscaleTotale = costoAmmortizzabileTotale * ALIQUOTA_IRES;
  const beneficioAnnuo = beneficioFiscaleTotale / anni;
  const beneficioMensile = beneficioAnnuo / 12;

  return {
    tipologia,
    anniAmmortamento: anni,
    maggiorazionePerc,
    costoAmmortizzabilePerc,
    maggiorazione,
    costoAmmortizzabileTotale,
    beneficioFiscaleTotale,
    beneficioAnnuo,
    beneficioMensile,
  };
}
