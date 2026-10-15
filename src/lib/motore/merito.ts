// Dalla scheda Openapi a quello che serve al motore dei portali.
//
// ATTENZIONE — FILE SERVER-ONLY: importa i dizionari di bilancio, che non
// servono al browser. Il portale riceve testo gia' leggibile.
//
// Tre uscite, separate perche' hanno destinatari diversi:
//  - datiCredito: i numeri su cui gira il semaforo. Si salvano nel database
//    (app.ricerca_merito) e la proposta li rilegge da li', mai dal browser.
//  - scheda: la scheda ridotta che vede l'agente.
//  - info: il tab "Info aggiuntive" (soci, amministratori, anagrafica, indici,
//    bilancio riclassificato). Gli eventi negativi NON ci sono: li vede solo MCF.
//
// La lettura dei campi segue rendiScheda() di src/scripts/valutazione.ts, che
// e' la scheda gia' in uso da settembre: stessi campi, stesse cautele.

import CODICI from '../../data/codici-bilancio.json';
import { ETICHETTE, RUOLI, VALORI } from '../../data/openapi-etichette';
import type { SchedaAzienda } from '../openapi';
import type { DatiLocatore } from './semaforo-locatore';

const CODICI_BILANCIO = CODICI as Record<string, string>;

/** Scala del rating Openapi, dalla classe migliore alla peggiore */
export const SCALA_RATING = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

export interface DatiCreditoMotore {
  fatturato: number | null;
  annoBilancio: number | null;
  patrimonioNetto: number | null;
  utile: number | null;
  /** AAAA-MM-GG */
  inizioAttivita: string | null;
  rating: string | null;
  /** Codice della forma giuridica del Registro (SR, RS, DI, SN...). Dal 15/10/2026. */
  formaCodice?: string | null;
  /** true attiva, false non attiva o in liquidazione, null non disponibile. Dal 15/10/2026. */
  attiva?: boolean | null;
  /** Data di cessazione o codice fiscale cessato. Dal 15/10/2026. */
  cessata?: boolean;
}

export interface SchedaRidotta {
  piva: string;
  ragioneSociale: string;
  formaGiuridica: string | null;
  sede: string | null;
  ateco: string | null;
  attivaDal: string | null;
  statoAttivita: string | null;
  fatturato: number | null;
  annoBilancio: number | null;
  trendFatturato: number | null;
  utile: number | null;
  patrimonioNetto: number | null;
  ebitda: number | null;
  dipendenti: number | null;
  rating: { classe: string; posizione: number; descrizione: string | null } | null;
  lineaCreditoConsigliata: number | null;
}

/** Una riga etichetta/valore; `sotto` apre un sottogruppo dentro la sezione */
export interface Riga { etichetta: string; valore: string; sotto?: boolean }

export interface InfoAggiuntive {
  soci: { nome: string; quota: number | null; persona: boolean }[];
  amministratori: { nome: string; ruoli: string; legaleRappresentante: boolean; eta: number | null }[];
  anagrafica: Riga[];
  indici: Riga[];
  bilancio: { titolo: string; voci: Riga[] }[];
}

export interface LetturaScheda {
  dati: DatiCreditoMotore;
  scheda: SchedaRidotta;
  info: InfoAggiuntive;
}

// --- formattazione -----------------------------------------------------------

const nf = (n: number, dec = 0) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });

const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Le date arrivano come mezzanotte italiana in UTC: 1883-05-23T22:00 e' il 24. */
export function dataIso(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?/.exec(String(v ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (m[4] && +m[4] >= 22) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const dataIt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

const umano = (k: string) =>
  ETICHETTE[k] ?? ETICHETTE[k.trim()] ?? k.replace(/(?!^)([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function testo(v: unknown, chiave = ''): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sì' : 'no';
  if (typeof v === 'number') {
    // gli anni sono numeri ma non importi: 2024, non 2.024
    if (/year|anno/i.test(chiave) && v > 1900 && v < 2100) return String(v);
    return Number.isInteger(v) ? nf(v) : nf(v, 2);
  }
  const s = String(v);
  const d = dataIso(s);
  if (d && /^\d{4}-\d{2}-\d{2}/.test(s)) return dataIt(d) ?? s;
  return VALORI[s.trim()] ?? s;
}

/** Un blocco {code, description} si legge per la descrizione */
function piatto(v: Record<string, unknown>): string {
  if (v.description != null && v.description !== '') {
    const altri = Object.entries(v).filter(([k, x]) => k !== 'code' && k !== 'description' && x != null && x !== '');
    return [testo(v.description), ...altri.map(([k, x]) => `${umano(k).toLowerCase()}: ${testo(x, k)}`)].join(' · ');
  }
  const resto = Object.entries(v).filter(([, x]) => x != null && x !== '');
  if (!resto.length) return '—';
  if (resto.length === 1 && resto[0][0] === 'code') return testo(resto[0][1]);
  return resto.map(([k, x]) => `${umano(k).toLowerCase()}: ${testo(x, k)}`).join(' · ');
}

function righe(d: Record<string, unknown>): Riga[] {
  const out: Riga[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const semplice = Object.values(o).every((x) => x == null || typeof x !== 'object');
      if (semplice) out.push({ etichetta: umano(k), valore: piatto(o) });
      else out.push({ etichetta: umano(k), valore: '', sotto: true }, ...righe(o));
    } else if (Array.isArray(v)) {
      out.push({ etichetta: umano(k), valore: `${v.length} voci` });
    } else {
      out.push({ etichetta: umano(k), valore: testo(v, k) });
    }
  }
  return out;
}

// Sezioni della scheda completa, le stesse di /tools/valutazione. Restano
// fuori i contatti e la PEC: all'agente servono a poco e sono dati di contatto.
const SEZ_ANAG = ['companyDetails', 'companyStatus', 'companyDates', 'detailedLegalForm', 'atecoClassification',
  'branches', 'corporateGroups', 'innovativeSmeAndSu', 'soaCertification', 'artisanBusinessRegistry', 'development'];
const SEZ_ECON = ['ecofin', 'operatingResults', 'profitability', 'financialStatementKpi', 'indebtedness',
  'leverageRatios', 'coverageRatios', 'liquidityRatios', 'structureRatios', 'financialStability', 'financialBurden',
  'financialCycle', 'efficiency', 'employees', 'employeesStatistic', 'foreignTrade'];
const SEZ_COD = ['assetsAggregateValues', 'liabilitiesAggregateValues', 'incomeStatementAggregateValues', 'annualResult',
  'productionValue', 'productionCosts', 'netWorth', 'debts', 'credits', 'inventory', 'tangibleFixedAssets',
  'intangibleFixedAssets', 'financialFixedAssets', 'financialAssets', 'cashEquivalents', 'riskProvisions',
  'revenuesFinancialCharges', 'creditsToShareholders', 'adjustments'];
// Dove IT-advanced ha la versione italiana dello stesso blocco si usa quella:
// le descrizioni di IT-full sono tradotte a macchina e a volte sbagliate.
const IN_ITALIANO = ['atecoClassification', 'detailedLegalForm'];

const capitalizza = (s: string) => s.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());

// Ruoli che il dizionario per codice non copre e che Openapi descrive in inglese
const RUOLI_INGLESE: Record<string, string> = {
  'Sole owner': 'Socio unico',
  'Special representative/agent': 'Procuratore speciale',
  'Attorney': 'Procuratore',
  'Auditor': 'Revisore',
};

// --- lettura -------------------------------------------------------------------

export function leggiScheda(s: SchedaAzienda): LetturaScheda {
  const F = s.full ?? {};
  const A = s.advanced ?? {};
  const CS = s.score ?? {};
  const det = F.companyDetails ?? {};
  const eco = F.ecofin ?? {};
  const op = F.operatingResults ?? {};
  const ann: Record<string, number> = {};
  for (const x of F.annualResult ?? []) if (x?.code) ann[x.code] = x.value;

  const ragioneSociale = String(det.companyName ?? A.companyName ?? '').trim();
  const piva = String(det.vatCode ?? A.vatCode ?? s.piva);
  const forma = A.detailedLegalForm?.description ?? F.legalForm?.detailedLegalForm?.description
    ?? F.legalForm?.legalForm?.description ?? F.legalForm?.description ?? null;

  // Sede: IT-advanced la annida sotto registeredOffice con la provincia in
  // sigla, IT-full la tiene piatta con la provincia come oggetto
  const ro = A.address?.registeredOffice ?? {};
  const fa = F.address ?? {};
  const via = ro.streetName ?? fa.streetName ?? '';
  const comune = ro.town ?? fa.town ?? '';
  const prov = typeof ro.province === 'string' ? ro.province : (fa.province?.code ?? '');
  const sede = [via, [comune, prov ? `(${prov})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;

  const ate = A.atecoClassification?.ateco ?? {};
  const ateco = ate.code ? `${ate.code} ${ate.description ?? ''}`.trim() : null;
  const inizio = dataIso(A.startDate);

  const rating = SCALA_RATING.includes(CS.rating) ? String(CS.rating) : null;
  const utile = numero(ann.IIC179);

  // Per il semaforo del locatore: forma dal codice del Registro, stato e cessazione.
  // IT-advanced dice "ATTIVA"; se manca, IT-full ha il codice "A".
  const formaCodice = A.detailedLegalForm?.code ?? F.legalForm?.detailedLegalForm?.code ?? null;
  const statoA = typeof A.activityStatus === 'string' ? A.activityStatus.trim().toUpperCase() : '';
  const statoF = String(F.companyStatus?.activityStatus?.code ?? '').trim().toUpperCase();
  const attiva = statoA ? statoA === 'ATTIVA' : statoF ? statoF === 'A' : null;
  const cessata = Boolean(A.endDate) || A.taxCodeCeased === true || A.taxCodeCeased === 'true';

  const dati: DatiCreditoMotore = {
    fatturato: numero(eco.turnover),
    annoBilancio: numero(eco.turnoverYear),
    // ecofin.netWorth di IT-full e' il patrimonio netto vero. Quello di
    // IT-advanced e' l'utile: qui non si usa (vedi CLAUDE.md, Openapi).
    patrimonioNetto: numero(eco.netWorth),
    utile,
    inizioAttivita: inizio,
    rating,
    formaCodice,
    attiva,
    cessata,
  };

  const scheda: SchedaRidotta = {
    piva,
    ragioneSociale,
    formaGiuridica: forma,
    sede,
    ateco,
    attivaDal: dataIt(inizio),
    // Openapi lo scrive in inglese ("Enable"): passa dal dizionario dei valori
    statoAttivita: (() => {
      const v = F.companyStatus?.activityStatus?.description ?? A.activityStatus ?? null;
      return v == null ? null : testo(v);
    })(),
    fatturato: dati.fatturato,
    annoBilancio: dati.annoBilancio,
    trendFatturato: numero(eco.turnoverTrend),
    utile,
    patrimonioNetto: dati.patrimonioNetto,
    ebitda: numero(op.ebitda),
    dipendenti: numero(F.employees?.employee),
    rating: rating
      ? { classe: rating, posizione: SCALA_RATING.indexOf(rating) + 1, descrizione: CS.risk_score_description ?? null }
      : null,
    lineaCreditoConsigliata: numero(CS.operational_credit_limit),
  };

  // --- info aggiuntive ---
  const soci = (s.soci ?? []).map((x: any) => {
    const persona = !x.companyName;
    const nome = x.companyName || `${x.name ?? ''} ${x.surname ?? ''}`.trim();
    return { nome: persona ? capitalizza(nome) : nome, quota: numero(x.percentShare), persona };
  });

  // Niente codice fiscale, data e luogo di nascita: all'agente bastano nome e
  // ruolo per sapere con chi parla. Sono dati personali di terzi.
  const amministratori = ((F.managers ?? []) as any[]).map((m) => ({
    // Una societa' che ricopre una carica (il socio unico) arriva senza nome e
    // cognome: si usa la ragione sociale
    nome: capitalizza(`${m.name ?? ''} ${m.surname ?? ''}`.trim()) || String(m.companyName ?? '').trim() || '—',
    ruoli: ((m.roles ?? []) as any[])
      .map((r) => RUOLI[r?.role?.code] ?? RUOLI_INGLESE[r?.role?.description] ?? r?.role?.description ?? '')
      .filter(Boolean)
      .join(' · ') || '—',
    legaleRappresentante: Boolean(m.isLegalRepresentative),
    eta: numero(m.age),
  }));

  const fonte = (k: string) => (IN_ITALIANO.includes(k) && A[k] ? A[k] : F[k]);
  const sezione = (chiavi: string[]): Riga[] => {
    const out: Riga[] = [];
    for (const k of chiavi) {
      const v = fonte(k);
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) {
        out.push({ etichetta: umano(k), valore: '', sotto: true }, ...righe(v));
      }
    }
    return out;
  };
  const anagrafica = sezione(SEZ_ANAG);
  if (forma) anagrafica.unshift({ etichetta: 'Forma giuridica', valore: testo(forma) });

  const bilancio = SEZ_COD
    .filter((k) => Array.isArray(F[k]) && F[k].length)
    .map((k) => ({
      titolo: umano(k),
      voci: (F[k] as any[])
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({ etichetta: CODICI_BILANCIO[x.code] ?? `Codice ${x.code}`, valore: testo(x.value) })),
    }));

  return { dati, scheda, info: { soci, amministratori, anagrafica, indici: sezione(SEZ_ECON), bilancio } };
}

/** I numeri della ricerca nella forma del semaforo del locatore. Le ricerche vecchie non hanno forma e stato: restano dati mancanti. */
export function datiLocatore(d: Partial<DatiCreditoMotore>): DatiLocatore {
  return {
    formaCodice: d.formaCodice ?? null,
    attiva: d.attiva ?? null,
    cessata: d.cessata ?? false,
    inizioAttivita: d.inizioAttivita ?? null,
    volumeAffari: d.fatturato ?? null,
    patrimonioNetto: d.patrimonioNetto ?? null,
    annoBilancio: d.annoBilancio ?? null,
  };
}
