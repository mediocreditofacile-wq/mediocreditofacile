// Credit policy MCF a semaforo, calcolata sui dati di bilancio. Nessun modello:
// sono soglie fisse, le stesse del tool Marotta (valutaCreditPolicy in
// public/tools/marotta/index.html, sorgente ~/dev/marotta-tool).
//
// Modulo puro e senza segreti: gira nel browser come sul server. Il tool Marotta
// e' un file statico e oggi ha ancora la sua copia delle soglie; quando lo si
// allinea deve leggere da qui (vedi CLAUDE.md, sezione /fiera). Finche' esistono
// due copie, una modifica alle soglie va fatta in tutti e due i posti.
//
// Criteri (verde / giallo / rosso):
//   importo / fatturato        <= 20%  |  20-30%, anticipo proporzionale  |  > 30%
//   patrimonio netto / importo >= 75%  |  50-75%, markup                  |  < 50%
//   utile d'esercizio          > 0     |  = 0, anticipo 10%               |  < 0
//   anni di attivita'          >= 3    |  1-3, anticipo 20%               |  < 1
//   massimale Grenke = min(20% del fatturato, patrimonio netto): oltre e' rosso
//
// Un dato che manca non da' verde per assenza di prove: il criterio resta
// "non disponibile", e se manca il fatturato il semaforo non puo' essere verde.

export type Semaforo = 'verde' | 'giallo' | 'rosso';

export interface DatiCredito {
  /** Importo della fornitura, IVA esclusa. Null se non ancora indicato */
  importo: number | null;
  fatturato: number | null;
  patrimonioNetto: number | null;
  utile: number | null;
  /** Data di inizio attivita', 'AAAA-MM-GG' o 'GG-MM-AAAA' */
  inizioAttivita: string | null;
  /** Solo per i test: la data a cui calcolare gli anni di attivita' */
  oggi?: Date;
}

export interface Criterio {
  chiave: 'rapporto' | 'patrimonio' | 'utile' | 'anni' | 'massimale';
  nome: string;
  valore: string;
  /** true soddisfatto, false no, null dato non disponibile */
  ok: boolean | null;
}

export interface EsitoCredito {
  semaforo: Semaforo;
  criteri: Criterio[];
  /** Anticipo suggerito in percentuale (solo gialli) */
  anticipo: number;
  /** Maggiorazione suggerita sul coefficiente, in punti (solo gialli) */
  markup: number;
  /** Massimale finanziabile stimato, null se mancano i dati */
  massimale: number | null;
}

const PEGGIORE: Record<Semaforo, number> = { verde: 0, giallo: 1, rosso: 2 };
const peggiora = (a: Semaforo, b: Semaforo): Semaforo => (PEGGIORE[b] > PEGGIORE[a] ? b : a);

const intero = (n: number) => Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions);
const pct = (n: number, dec = 0) =>
  n > 0 && n < 0.1 ? 'meno dello 0,1%' : `${n.toLocaleString('it-IT', { maximumFractionDigits: dec })}%`;

/** Anno di inizio attivita' da una data nei due formati che arrivano dalle fonti */
export function annoInizio(data: string | null): number | null {
  if (!data) return null;
  const parti = data.split(/[-/]/);
  const anno = parseInt(parti[2]?.length === 4 ? parti[2] : parti[0], 10);
  return Number.isFinite(anno) && anno > 1800 ? anno : null;
}

export function valutaCredito(d: DatiCredito): EsitoCredito {
  let semaforo: Semaforo = 'verde';
  let anticipo = 0;
  let markup = 0;
  const criteri: Criterio[] = [];
  const importo = d.importo && d.importo > 0 ? d.importo : null;
  const fat = d.fatturato && d.fatturato > 0 ? d.fatturato : null;

  // 1. Importo rispetto al fatturato
  if (fat == null) {
    semaforo = peggiora(semaforo, 'giallo');
    criteri.push({ chiave: 'rapporto', nome: 'Fatturato', valore: 'nessun bilancio disponibile', ok: null });
  } else if (importo == null) {
    criteri.push({ chiave: 'rapporto', nome: 'Fatturato', valore: `${intero(fat)} €`, ok: null });
  } else {
    const r = (importo / fat) * 100;
    if (r <= 20) {
      criteri.push({ chiave: 'rapporto', nome: 'Fornitura sul fatturato', valore: pct(r, 1), ok: true });
    } else if (r <= 30) {
      semaforo = peggiora(semaforo, 'giallo');
      anticipo = Math.max(anticipo, Math.round((r - 20) * 2));
      criteri.push({ chiave: 'rapporto', nome: 'Fornitura sul fatturato', valore: pct(r, 1), ok: false });
    } else {
      semaforo = 'rosso';
      criteri.push({ chiave: 'rapporto', nome: 'Fornitura sul fatturato', valore: pct(r, 1), ok: false });
    }
  }

  // 2. Patrimonio netto rispetto all'importo (quasi mai disponibile nei dati gratuiti)
  if (d.patrimonioNetto != null && importo != null) {
    const r = (d.patrimonioNetto / importo) * 100;
    if (r >= 75) {
      criteri.push({ chiave: 'patrimonio', nome: 'Patrimonio netto sulla fornitura', valore: pct(r), ok: true });
    } else if (r >= 50) {
      semaforo = peggiora(semaforo, 'giallo');
      markup = Math.max(markup, r < 60 ? 0.5 : 0.3);
      criteri.push({ chiave: 'patrimonio', nome: 'Patrimonio netto sulla fornitura', valore: pct(r), ok: false });
    } else {
      semaforo = 'rosso';
      criteri.push({ chiave: 'patrimonio', nome: 'Patrimonio netto sulla fornitura', valore: pct(r), ok: false });
    }
  }

  // 3. Utile d'esercizio
  if (d.utile == null) {
    criteri.push({ chiave: 'utile', nome: "Utile d'esercizio", valore: 'non disponibile', ok: null });
  } else if (d.utile > 0) {
    criteri.push({ chiave: 'utile', nome: "Utile d'esercizio", valore: 'positivo', ok: true });
  } else if (d.utile === 0) {
    semaforo = peggiora(semaforo, 'giallo');
    anticipo = Math.max(anticipo, 10);
    criteri.push({ chiave: 'utile', nome: "Utile d'esercizio", valore: 'in pareggio', ok: false });
  } else {
    semaforo = 'rosso';
    criteri.push({ chiave: 'utile', nome: "Utile d'esercizio", valore: 'in perdita', ok: false });
  }

  // 4. Anni di attivita'
  const anno = annoInizio(d.inizioAttivita);
  if (anno == null) {
    criteri.push({ chiave: 'anni', nome: "Anni di attività", valore: 'non disponibile', ok: null });
  } else {
    const anni = (d.oggi ?? new Date()).getFullYear() - anno;
    const valore = anni === 1 ? '1 anno' : `${anni} anni`;
    if (anni >= 3) {
      criteri.push({ chiave: 'anni', nome: "Anni di attività", valore, ok: true });
    } else if (anni >= 1) {
      semaforo = peggiora(semaforo, 'giallo');
      anticipo = Math.max(anticipo, 20);
      criteri.push({ chiave: 'anni', nome: "Anni di attività", valore, ok: false });
    } else {
      semaforo = 'rosso';
      criteri.push({ chiave: 'anni', nome: "Anni di attività", valore: 'meno di 1 anno', ok: false });
    }
  }

  // 5. Massimale finanziabile: il 20% del fatturato, o il patrimonio netto se piu' basso
  const tetti = [fat != null ? fat * 0.2 : null, d.patrimonioNetto].filter((x): x is number => x != null);
  const massimale = tetti.length ? Math.min(...tetti) : null;
  if (massimale != null && importo != null && importo > massimale) {
    semaforo = 'rosso';
    criteri.push({ chiave: 'massimale', nome: 'Massimale stimato', valore: `${intero(massimale)} €, sotto la fornitura`, ok: false });
  }

  return { semaforo, criteri, anticipo, markup, massimale };
}

/**
 * Etichette della pagina /fiera. Sono scelte apposta: nessuna promette una
 * delibera, e in pagina vanno sempre accompagnate da "valutazione indicativa,
 * non è una delibera".
 */
export const ETICHETTE_FIERA: Record<Semaforo, string> = {
  verde: 'verosimile',
  giallo: 'da istruire',
  rosso: 'difficile',
};
