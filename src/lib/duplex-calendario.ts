// Calendario dei pagamenti di un noleggio Grenke, tabella tradizionale o Grace Period.
// Regole dalle condizioni generali Grenke (art. 1) e dalla guida operativa Rete Rent:
// - la locazione decorre dal primo giorno del trimestre solare successivo alla consegna
//   (1 gennaio, 1 aprile, 1 luglio, 1 ottobre);
// - dalla consegna a quel giorno si paga il pro rata ("indennita' di prelocazione"),
//   1/30 del canone mensile per ogni giorno di calendario;
// - i canoni si fatturano a trimestre anticipato.
// Con la tabella Grace Period il pro rata e il primo trimestre si spostano in coda al
// contratto: la prima fattura arriva un trimestre dopo. Verificato sulle date di decorrenza
// e scadenza delle pratiche Grace Period caricate su ReteRent.

export type TabellaCanoni = 'tradizionale' | 'grace';

export interface CalendarioPagamenti {
  consegna: Date;
  /** Primo giorno del trimestre solare successivo alla consegna. */
  inizioLocazione: Date;
  giorniProRata: number;
  costoGiornaliero: number;
  importoProRata: number;
  importoTrimestre: number;
  /** Data della prima fattura trimestrale. */
  primaFattura: Date;
  /** Ultimo giorno coperto dal contratto. */
  fineContratto: Date;
  /** true se pro rata e primo trimestre sono stati spostati a fine contratto. */
  grace: boolean;
}

const MS_GIORNO = 86_400_000;

function arrotonda2(n: number): number {
  return Math.round(n * 100) / 100;
}

function aggiungiMesi(d: Date, mesi: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + mesi, d.getDate());
}

/** Primo giorno del trimestre solare successivo a quello che contiene la data. */
export function inizioTrimestreSuccessivo(d: Date): Date {
  const meseInizioTrimestre = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), meseInizioTrimestre + 3, 1);
}

/** Giorni di calendario dalla consegna (inclusa) all'inizio locazione (escluso). */
export function giorniTra(da: Date, a: Date): number {
  // UTC per non perdere o guadagnare un giorno al cambio dell'ora legale.
  const utcDa = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round((utcA - utcDa) / MS_GIORNO);
}

export function calendarioPagamenti(
  consegna: Date,
  canoneMensile: number,
  durataMesi: number,
  tabella: TabellaCanoni,
): CalendarioPagamenti {
  const giorno = new Date(consegna.getFullYear(), consegna.getMonth(), consegna.getDate());
  const inizioLocazione = inizioTrimestreSuccessivo(giorno);
  const giorniProRata = giorniTra(giorno, inizioLocazione);
  const costoGiornaliero = canoneMensile / 30;
  const grace = tabella === 'grace';

  // Con la Grace il periodo base parte un trimestre dopo: sia la prima fattura sia la
  // scadenza slittano di tre mesi.
  const slittamento = grace ? 3 : 0;
  const primaFattura = aggiungiMesi(inizioLocazione, slittamento);
  const fineContratto = new Date(aggiungiMesi(primaFattura, durataMesi).getTime() - MS_GIORNO);

  return {
    consegna: giorno,
    inizioLocazione,
    giorniProRata,
    costoGiornaliero: arrotonda2(costoGiornaliero),
    importoProRata: arrotonda2(costoGiornaliero * giorniProRata),
    importoTrimestre: arrotonda2(canoneMensile * 3),
    primaFattura,
    fineContratto,
    grace,
  };
}

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

export function dataEstesa(d: Date): string {
  // "1° gennaio": il primo del mese si scrive con l'ordinale.
  const giorno = d.getDate() === 1 ? '1°' : String(d.getDate());
  return `${giorno} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

export function meseAnno(d: Date): string {
  return `${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

/** "gennaio-marzo 2027" per il trimestre che inizia alla data indicata. */
export function trimestreEsteso(d: Date): string {
  const fine = new Date(d.getFullYear(), d.getMonth() + 2, 1);
  return `${MESI[d.getMonth()]}-${MESI[fine.getMonth()]} ${fine.getFullYear()}`;
}

export interface FinestraConsegna {
  /** Primo e ultimo giorno del trimestre solare in cui cade la consegna. */
  dal: Date;
  al: Date;
  /** Prima fattura con la tabella tradizionale e con la Grace Period. */
  pagaTradizionale: Date;
  pagaGrace: Date;
}

/**
 * Da quando si paga se la macchina arriva nel trimestre di oggi, e nel successivo.
 * Serve a dire al commerciale, con le date di oggi: "consegna entro il 30 settembre,
 * con la Grace il cliente paga dal 1 gennaio".
 */
export function finestreConsegna(oggi: Date): [FinestraConsegna, FinestraConsegna] {
  const finestra = (inizioTrimestre: Date): FinestraConsegna => {
    const prossimo = inizioTrimestreSuccessivo(inizioTrimestre);
    return {
      dal: inizioTrimestre,
      al: new Date(prossimo.getFullYear(), prossimo.getMonth(), 0),
      pagaTradizionale: prossimo,
      pagaGrace: aggiungiMesi(prossimo, 3),
    };
  };
  const questo = new Date(oggi.getFullYear(), Math.floor(oggi.getMonth() / 3) * 3, 1);
  const attuale = finestra(questo);
  // Oggi puo' essere a meta' trimestre: la finestra attuale parte da oggi, non dal primo.
  attuale.dal = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return [attuale, finestra(inizioTrimestreSuccessivo(questo))];
}
