// Esito della verifica del cliente sul simulatore di noleggio operativo.
//
// Regola decisa da Alberto il 24/10/2026, sui soli dati della ricerca economica
// Openapi (IT-advanced), quindi senza patrimonio netto:
//   rosso   meno di 2 anni compiuti di attivita', per tutte le forme
//   verde   societa' di capitali: 2 anni, bilancio dell'anno atteso, importo
//           entro il 20% del fatturato, utile positivo
//           ditte e societa' di persone (non depositano il bilancio): 2 anni
//   giallo  tutto il resto, compresa l'anzianita' che non si legge
// Non e' credit-policy.ts, che ha quattro criteri e soglie diverse.
//
// Modulo puro: lo usa l'API, lo provano i test con la data fissata.

import { tipoVisura } from './documenti-ufficiali';
import { annoBilancioAtteso } from './motore/semaforo-locatore';

export type ClasseSimulatore = 'capitali' | 'persone' | 'individuale';
export type ColoreSimulatore = 'verde' | 'giallo' | 'rosso';

export interface DatiEsito {
  importo: number;
  classe: ClasseSimulatore;
  /** 'AAAA-MM-GG' o 'GG-MM-AAAA', inizio attivita' o in mancanza iscrizione al registro */
  inizioAttivita: string | null;
  annoBilancio: number | null;
  fatturato: number | null;
  utile: number | null;
  oggi?: Date;
}

export interface CriterioSimulatore {
  chiave: 'anni' | 'bilancio' | 'rapporto' | 'utile';
  nome: string;
  valore: string;
  /** true passato, false no, null dato non disponibile */
  ok: boolean | null;
}

export interface EsitoSimulatore {
  colore: ColoreSimulatore;
  criteri: CriterioSimulatore[];
  /** Due o tre frasi concrete su cosa guarda una societa' di noleggio */
  indicazioni: string[];
}

export const QUOTA_FATTURATO = 0.2;
export const ANNI_MINIMI = 2;

/** Dal codice del Registro, o dalla descrizione per le ricerche salvate senza codice */
export function classeFormaRicerca(codice: string | null | undefined, descrizione: string | null | undefined): ClasseSimulatore {
  if (codice && codice.trim()) {
    const t = tipoVisura(codice);
    return t === 'capitale' ? 'capitali' : t;
  }
  const d = String(descrizione ?? '').toLowerCase();
  if (d.includes('individuale')) return 'individuale';
  if (d.includes('nome collettivo') || d.includes('accomandita semplice') || d.includes('societa\' semplice') || d.includes('societa semplice')) {
    return 'persone';
  }
  return 'capitali';
}

export function anniCompiuti(data: string | null, oggi: Date): number | null {
  if (!data) return null;
  const parti = data.split(/[-/]/).map((x) => parseInt(x, 10));
  if (parti.length < 3 || parti.some((n) => !Number.isFinite(n))) return null;
  const [a, m, g] = parti[0] > 1800 ? parti : [parti[2], parti[1], parti[0]];
  if (a < 1800) return null;
  let anni = oggi.getFullYear() - a;
  if (oggi.getMonth() + 1 < m || (oggi.getMonth() + 1 === m && oggi.getDate() < g)) anni -= 1;
  return anni >= 0 ? anni : null;
}

/** Cessata, in liquidazione, inattiva: nessun colore e nessuna scheda */
export function aziendaFerma(stato: string | null | undefined): boolean {
  const s = String(stato ?? '').toLowerCase();
  return /cessat|liquidaz|inattiv|scioglim|fallim|sospes/.test(s);
}

const euro = (n: number) =>
  `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;
const pct = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

export function valutaSimulatore(d: DatiEsito): EsitoSimulatore {
  const oggi = d.oggi ?? new Date();
  const atteso = annoBilancioAtteso(oggi);
  const anni = anniCompiuti(d.inizioAttivita, oggi);
  const fat = d.fatturato && d.fatturato > 0 ? d.fatturato : null;
  const capitali = d.classe === 'capitali';
  const criteri: CriterioSimulatore[] = [];
  const indicazioni: string[] = [];

  criteri.push({
    chiave: 'anni',
    nome: 'Anni di attività',
    valore: anni == null ? 'data di inizio non disponibile' : `${anni} ${anni === 1 ? 'anno' : 'anni'}`,
    ok: anni == null ? null : anni >= ANNI_MINIMI,
  });

  const bilancioOk = d.annoBilancio == null ? null : d.annoBilancio >= atteso;
  criteri.push({
    chiave: 'bilancio',
    nome: 'Ultimo bilancio nel registro',
    valore: d.annoBilancio == null ? 'non disponibile' : String(d.annoBilancio),
    ok: capitali ? (bilancioOk ?? false) : bilancioOk,
  });

  const rapporto = fat ? d.importo / fat : null;
  criteri.push({
    chiave: 'rapporto',
    nome: 'Richiesta sul fatturato',
    valore: rapporto == null ? 'fatturato non disponibile' : `${pct(rapporto * 100)} di ${euro(fat!)}`,
    ok: rapporto == null ? null : rapporto <= QUOTA_FATTURATO,
  });

  criteri.push({
    chiave: 'utile',
    nome: 'Risultato d\'esercizio',
    valore: d.utile == null ? 'non disponibile' : `${d.utile > 0 ? 'utile' : d.utile < 0 ? 'perdita' : 'pareggio'} di ${euro(Math.abs(d.utile))}`,
    ok: d.utile == null ? null : d.utile > 0,
  });

  let colore: ColoreSimulatore;
  if (anni != null && anni < ANNI_MINIMI) colore = 'rosso';
  else if (anni == null) colore = 'giallo';
  else if (!capitali) colore = 'verde';
  else colore = criteri.every((c) => c.ok === true) ? 'verde' : 'giallo';

  // Le indicazioni seguono i criteri che non passano: spiegano cosa guarda una
  // societa' di noleggio e cosa si puo' fare, senza promettere l'esito
  if (anni != null && anni < ANNI_MINIMI) {
    indicazioni.push('Se l\'attività viene dal conferimento di un\'azienda precedente, o i soci hanno una storia nello stesso settore, quella storia conta e va documentata.');
  }
  if (anni == null) {
    indicazioni.push('Il registro non riporta la data di inizio attività: la verifico io dalla visura.');
  }
  if (capitali && d.annoBilancio != null && d.annoBilancio < atteso) {
    indicazioni.push(`Il registro ha ancora il bilancio ${d.annoBilancio}. Se il ${atteso} è chiuso, anche non depositato, conviene averlo pronto: è il primo documento che chiederanno.`);
  }
  if (capitali && d.annoBilancio == null) {
    indicazioni.push(`Nel registro non c'è un bilancio leggibile. Serve il bilancio ${atteso} con la ricevuta di deposito.`);
  }
  if (rapporto != null && rapporto > QUOTA_FATTURATO) {
    indicazioni.push('Le società di noleggio di solito finanziano fino a circa un quinto del fatturato annuo. Un anticipo o una durata più lunga possono riportare la richiesta in linea.');
  }
  if (d.utile != null && d.utile <= 0 && capitali) {
    indicazioni.push('Un esercizio in perdita o in pareggio non chiude la porta, ma va spiegato: una nota del commercialista sulla causa vale più di qualsiasi altro documento.');
  }
  if (!capitali) {
    indicazioni.push('Per le ditte e le società di persone conta il Modello Unico: tienilo pronto, è quello che sostituisce il bilancio.');
  }
  if (colore === 'verde' && capitali) {
    indicazioni.push('Con un bilancio aggiornato e la richiesta in proporzione al fatturato, la pratica si presenta con i documenti di base e una visura recente.');
  }

  return { colore, criteri, indicazioni: indicazioni.slice(0, 3) };
}

/**
 * "15.000", "15000", "15 000" -> 15000. Gli importi qui sono euro interi: il punto
 * e' delle migliaia. Una virgola seguita da tre cifre ("25,000") e' ambigua,
 * all'inglese sarebbero 25.000 euro, all'italiana 25: si rifiuta.
 */
export function leggiImporto(v: string): number | null {
  const t = v.replace(/[\s€]/g, '');
  if (/,\d{3}(\D|$)/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const BASE = [
  'Visura camerale',
  "Carta d'identità del legale rappresentante",
  'Tessera sanitaria',
  'IBAN aziendale',
  'Email',
  'Cellulare',
  'Preventivo dei beni da acquistare',
];

/** Documenti per procedere: decisi da Alberto il 24/10/2026, un solo bilancio sopra 10.000 euro */
export function documentiSimulatore(classe: ClasseSimulatore, importo: number, oggi: Date = new Date()): string[] {
  if (importo <= 10_000) return [...BASE];
  if (classe === 'capitali') {
    return [...BASE, `Bilancio ${annoBilancioAtteso(oggi)} depositato, con la ricevuta di deposito`];
  }
  return [...BASE, 'Ultimo Modello Unico (dichiarazione dei redditi)'];
}
