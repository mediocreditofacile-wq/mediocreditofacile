// Gli eventi negativi della ricerca del cliente: tipi e regole pure.
// L'I/O sta in eventi-merito.ts; qui solo decisioni, provate nei test.

import { classeForma, type StatoEventi } from './semaforo-locatore';

export interface EventiRicerca {
  stato: StatoEventi;
  /** Id della verifica Openapi. Null se non e' partita */
  id: string | null;
  /** ISO: quando e' partita la verifica pagata */
  avviata: string | null;
  /** ISO: quando e' arrivato l'esito */
  chiusa: string | null;
  /** Partita IVA, oppure codice fiscale del titolare sulle ditte individuali */
  codice: string;
  /** La verifica era gia' nel registro: non si e' pagata adesso */
  daRegistro: boolean;
  mail: 'da-mandare' | 'mandata' | 'non-serve';
}

/** Quanto il server segue l'esito in background dopo la ricerca */
export const ATTESA_EVENTI_MS = 90_000;
export const PASSO_EVENTI_MS = 10_000;

/** Partita IVA, oppure il codice fiscale del titolare sulle ditte individuali */
export function bersaglioEventi(piva: string, formaCodice: string | null, taxCode: unknown): string {
  const cf = String(taxCode ?? '').trim().toUpperCase();
  return classeForma(formaCodice) === 'individuale' && /^[A-Z0-9]{16}$/.test(cf) ? cf : piva;
}

/** Dall'esito Openapi (grezzo o ridotto dal registro) a quello che vede l'agente */
export function statoDaEsito(dati: any): 'presenti' | 'assenti' {
  return dati?.presenzaProtesti || dati?.presenzaPregiudizievoli || dati?.presenzaProcedure ? 'presenti' : 'assenti';
}

/**
 * Rileggendo una ricerca: serve una lettura su Openapi? Solo se la verifica e'
 * aperta e il lavoro in background ha gia' finito il suo giro: prima risponde
 * lui, dal database. La lettura dell'esito non si paga finche' non e' pronto.
 */
export function serveControllo(ev: EventiRicerca | null, adesso: number = Date.now()): boolean {
  if (!ev?.id) return false;
  if (ev.stato !== 'in-verifica' && ev.stato !== 'non-pervenuti') return false;
  return adesso - new Date(ev.avviata ?? 0).getTime() > ATTESA_EVENTI_MS;
}

export function eventiNonAvviati(codice: string): EventiRicerca {
  return { stato: 'non-avviata', id: null, avviata: null, chiusa: null, codice, daRegistro: false, mail: 'non-serve' };
}
