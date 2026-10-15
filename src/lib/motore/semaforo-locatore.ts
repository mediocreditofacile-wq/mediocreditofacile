// Il semaforo sui criteri del locatore, per i fornitori del motore impostati con
// regole_semaforo = 'locatore' (oggi Duplex). Regole decise da Alberto il 30/09 e
// il 15/10/2026 (spec mcf_spec-duplex-motore_v1, paragrafo 6).
//
// Modulo puro: niente rete, niente database. Non cambia mai un numero: e'
// un'indicazione per l'agente, il canone resta quello del listino.
// Mai "approvato", mai il nome della societa' di locazione.

import { tipoVisura } from '../documenti-ufficiali';

export type ColoreLocatore = 'verde-scuro' | 'verde-chiaro' | 'giallo' | 'rosso';
export type ClasseForma = 'capitali' | 'persone' | 'individuale' | 'non-classificata';
export type StatoEventi = 'in-verifica' | 'assenti' | 'presenti' | 'non-pervenuti' | 'non-avviata';

export interface DatiLocatore {
  /** Codice della forma giuridica del Registro: SR, RS, DI, SN... */
  formaCodice: string | null;
  /** true attiva, false non attiva o in liquidazione, null non disponibile */
  attiva: boolean | null;
  cessata: boolean;
  /** AAAA-MM-GG */
  inizioAttivita: string | null;
  /** Volume d'affari dell'ultimo bilancio: lo zero e' un dato, non un dato mancante */
  volumeAffari: number | null;
  /** Da IT-full: quello di IT-advanced e' l'utile (CLAUDE.md, Openapi) */
  patrimonioNetto: number | null;
  annoBilancio: number | null;
}

export interface CriterioLocatore { nome: string; valore: string; ok: boolean | null }

export interface EsitoLocatore {
  semaforo: ColoreLocatore;
  etichetta: string;
  /** Le spiegazioni sotto l'etichetta: cosa fare, cosa manca */
  righe: string[];
  criteri: CriterioLocatore[];
  /** Eventi ancora in verifica: il colore puo' cambiare */
  provvisorio: boolean;
  eventi: StatoEventi;
  /**
   * Indicazione massima importo finanziabile, solo nella verifica senza importo
   * e fuori dal rosso. Null quando non si mostra.
   */
  indicazioneMassima: number | null;
}

/**
 * Quota del volume d'affari per l'indicazione massima importo finanziabile.
 * Indicazione di Alberto del 15/10/2026 sui parametri del locatore: il tetto
 * teorico e' il 20%, all'agente si indica il 15%. Non e' un limite: l'importo
 * lo valuta il semaforo quando c'e' una proposta.
 */
export const QUOTA_INDICAZIONE_MASSIMA = 0.15;

/** Tetto dell'indicazione, qualunque sia il volume d'affari (Alberto, 15/10/2026) */
export const TETTO_INDICAZIONE_MASSIMA = 199_000;

/**
 * Il piu' basso fra il 15% del volume d'affari, il patrimonio netto e il tetto,
 * per difetto alle centinaia di euro. L'importo non puo' superare il patrimonio
 * (Alberto, 15/10/2026): sulle societa' di capitali, senza patrimonio o con
 * patrimonio a zero o negativo l'indicazione non c'e', perche' il limite non si
 * rispetta o non si puo' verificare. Ditte individuali e societa' di persone di
 * solito non hanno il patrimonio nella scheda: li' valgono 15% e tetto.
 */
function indicazioneMassima(d: DatiLocatore, capitali: boolean): number | null {
  if (d.volumeAffari === null || !(d.volumeAffari > 0)) return null;
  if (d.patrimonioNetto === null ? capitali : d.patrimonioNetto <= 0) return null;
  const limiti = [d.volumeAffari * QUOTA_INDICAZIONE_MASSIMA, TETTO_INDICAZIONE_MASSIMA];
  if (d.patrimonioNetto !== null) limiti.push(d.patrimonioNetto);
  return Math.floor(Math.min(...limiti) / 100) * 100;
}

export const ETICHETTA_LOCATORE: Record<ColoreLocatore, string> = {
  'verde-scuro': 'In linea con i criteri',
  'verde-chiaro': 'Buone basi',
  giallo: 'Da istruire',
  rosso: 'Difficile',
};
export const ETICHETTA_SOTTO_DUE_ANNI = 'Sotto i due anni: percorso parallelo';
export const RIGA_PERCORSO_PARALLELO =
  'Si può fare con la società intermediaria: tempi di pagamento al fornitore più lunghi, per il cliente non cambia niente.';

export const TESTO_EVENTI: Record<StatoEventi, string> = {
  'in-verifica': 'in verifica',
  assenti: 'assenti',
  presenti: 'presenti',
  'non-pervenuti': 'non pervenuti',
  'non-avviata': 'non verificati',
};

const NOTA_EVENTI: Partial<Record<StatoEventi, string>> = {
  'in-verifica': 'Eventi negativi in verifica: il colore può ancora cambiare.',
  'non-pervenuti': 'Eventi negativi non pervenuti: il semaforo si ferma al verde chiaro.',
  'non-avviata': "Eventi negativi non verificati: li controlla Mediocredito Facile all'invio della pratica.",
};

/** Dal codice del Registro alla classe che conta per le regole. Senza codice: non classificata. */
export function classeForma(codice: string | null | undefined): ClasseForma {
  const c = String(codice ?? '').trim();
  if (!c) return 'non-classificata';
  const t = tipoVisura(c);
  return t === 'capitale' ? 'capitali' : t;
}

/** Il bilancio che deve esserci: dal 1° agosto quello dell'anno prima, prima di agosto quello di due anni prima */
export function annoBilancioAtteso(oggi: Date): number {
  return oggi.getMonth() >= 7 ? oggi.getFullYear() - 1 : oggi.getFullYear() - 2;
}

/** Mesi interi di attivita' dalla data civile di inizio */
export function mesiDiAttivita(inizio: string, oggi: Date): number {
  const [a, m, g] = inizio.split('-').map(Number);
  let mesi = (oggi.getFullYear() - a) * 12 + (oggi.getMonth() + 1 - m);
  if (oggi.getDate() < g) mesi -= 1;
  return mesi;
}

const euro = (n: number) =>
  `${n.toLocaleString('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;
const dataIt = (iso: string) => iso.split('-').reverse().join('/');

export function valutaLocatore(
  d: DatiLocatore,
  importo: number | null,
  eventi: StatoEventi,
  oggi: Date = new Date(),
): EsitoLocatore {
  const classe = classeForma(d.formaCodice);
  const capitali = classe === 'capitali';
  const atteso = annoBilancioAtteso(oggi);
  const mesi = d.inizioAttivita ? mesiDiAttivita(d.inizioAttivita, oggi) : null;
  const bilancio = d.annoBilancio !== null;
  const righe: string[] = [];

  // --- i criteri, come li legge l'agente ---
  const criteri: CriterioLocatore[] = [
    {
      nome: 'Stato',
      valore: d.cessata ? 'cessata' : d.attiva === null ? 'non disponibile' : d.attiva ? 'attiva' : 'non attiva',
      ok: d.cessata || d.attiva === false ? false : d.attiva === null ? null : true,
    },
    {
      nome: 'Attività',
      valore: mesi === null
        ? 'data di inizio non disponibile'
        : `dal ${dataIt(d.inizioAttivita!)}, ${mesi >= 24 ? `${Math.floor(mesi / 12)} anni` : `${mesi} mesi`}`,
      ok: mesi === null ? null : mesi >= 24,
    },
  ];
  if (bilancio || d.volumeAffari !== null) {
    criteri.push({
      nome: "Volume d'affari",
      valore: d.volumeAffari === null ? 'non disponibile' : `${euro(d.volumeAffari)}${bilancio ? ` (${d.annoBilancio})` : ''}`,
      ok: d.volumeAffari === null ? null : d.volumeAffari > 0,
    });
  }
  if (capitali) {
    criteri.push({
      nome: 'Patrimonio netto',
      valore: d.patrimonioNetto === null
        ? 'non disponibile'
        : importo !== null ? `${euro(d.patrimonioNetto)} contro ${euro(importo)} di fornitura` : euro(d.patrimonioNetto),
      ok: d.patrimonioNetto === null ? null : importo !== null ? d.patrimonioNetto >= importo : d.patrimonioNetto > 0,
    });
    criteri.push({
      nome: 'Bilancio',
      valore: !bilancio ? 'non disponibile' : d.annoBilancio! >= atteso ? `${d.annoBilancio}, aggiornato` : `${d.annoBilancio}, manca il ${atteso}`,
      ok: bilancio ? d.annoBilancio! >= atteso : false,
    });
  }
  criteri.push({
    nome: 'Eventi negativi',
    valore: TESTO_EVENTI[eventi],
    ok: eventi === 'presenti' ? false : eventi === 'assenti' ? true : null,
  });

  const esito = (semaforo: ColoreLocatore, etichetta = ETICHETTA_LOCATORE[semaforo]): EsitoLocatore => ({
    semaforo, etichetta, righe, criteri, eventi,
    provvisorio: eventi === 'in-verifica' && semaforo !== 'rosso',
    indicazioneMassima: importo === null && semaforo !== 'rosso' ? indicazioneMassima(d, capitali) : null,
  });

  // 1. Rosso Difficile: prevale su tutto
  const volumeNonPositivo = bilancio && d.volumeAffari !== null && d.volumeAffari <= 0;
  if (d.cessata || d.attiva === false || volumeNonPositivo || eventi === 'presenti') return esito('rosso');

  // 2. Rosso sotto i due anni: si puo' fare, ma con il percorso parallelo
  if (mesi !== null && mesi < 24) {
    righe.push(RIGA_PERCORSO_PARALLELO);
    return esito('rosso', ETICHETTA_SOTTO_DUE_ANNI);
  }

  // 3. Gialli: si raccolgono tutti, cosi' l'agente vede ogni cosa da chiedere
  const richiesta = `Chiedi al cliente il bilancio ${atteso} con la ricevuta di deposito.`;
  let giallo = false;
  if (classe === 'non-classificata' || d.attiva === null || mesi === null) {
    righe.push('Mancano dati di anagrafica: forma giuridica, stato o data di inizio.');
    giallo = true;
  }
  if (capitali) {
    if (!bilancio) {
      righe.push(`Bilancio non disponibile. ${richiesta}`);
      giallo = true;
    } else if (d.patrimonioNetto === null || d.volumeAffari === null) {
      righe.push(`Bilancio incompleto: mancano volume d'affari o patrimonio netto. ${richiesta}`);
      giallo = true;
    } else {
      if (d.annoBilancio! < atteso) {
        righe.push(`Bilancio non aggiornato: l'ultimo è il ${d.annoBilancio}. ${richiesta}`);
        giallo = true;
      }
      if (d.patrimonioNetto <= 0) {
        righe.push('Patrimonio netto a zero o negativo.');
        giallo = true;
      }
    }
  }
  if (giallo) return esito('giallo');

  // 4. Verdi
  const notaEventi = NOTA_EVENTI[eventi];
  if (notaEventi) righe.push(notaEventi);
  if (capitali) {
    if (importo === null) {
      righe.push('Il confronto tra patrimonio e importo arriva quando scegli il bene e il prezzo.');
      return esito('verde-chiaro');
    }
    if (d.patrimonioNetto! >= importo && eventi === 'assenti') return esito('verde-scuro');
  }
  return esito('verde-chiaro');
}
