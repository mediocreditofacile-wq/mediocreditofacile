// Registro delle verifiche a pagamento su persone e aziende (negativita' e report persona).
// Modulo puro: niente rete, niente blob. Decide soltanto se una richiesta si serve
// dal registro o se va spesa una chiamata Openapi. La lettura e la scrittura del
// blob stanno in openapi.ts, accanto alla cache delle schede.
//
// Il registro e' per codice fiscale (o partita IVA per la negativita' azienda), non
// per azienda: la stessa persona compare come socio e come amministratore, e in
// aziende diverse. Pagare due volte la stessa verifica e' esattamente il difetto
// che questo registro chiude.

export type TipoVerifica = 'negativita' | 'report';

export interface EsitoVerifica {
  id: string;
  /** ISO: quando e' partita la chiamata a pagamento. Il TTL si misura da qui. */
  avviata: string;
  pronto: boolean;
  dati?: any;
  /** ISO: quando e' arrivato l'esito */
  concluso?: string;
}

export interface RegistroVerifiche {
  cf: string;
  negativita?: EsitoVerifica;
  report?: EsitoVerifica;
}

/** 30 giorni, come la scheda azienda. */
export const TTL_VERIFICA = 30 * 24 * 60 * 60 * 1000;

/**
 * Una verifica ancora "in lavorazione" dopo un giorno intero non arrivera' piu':
 * la pratica su Openapi e' morta. Oltre questa soglia si accetta di rilanciare,
 * altrimenti la persona resterebbe bloccata per sempre su un id che non risponde.
 */
export const ATTESA_MAX = 24 * 60 * 60 * 1000;

export type Decisione =
  | { azione: 'registro'; id: string; pronto: boolean; dati?: any; avviata: string }
  | { azione: 'chiama'; motivo: 'assente' | 'scaduta' | 'bloccata' };

/**
 * Rispondo dal registro o chiamo Openapi?
 *   - nessuna verifica di quel tipo           -> chiama
 *   - verifica pronta dentro il TTL           -> registro, esito completo, nessuna spesa
 *   - verifica pronta oltre il TTL            -> chiama (l'esito e' vecchio)
 *   - in lavorazione da meno di ATTESA_MAX    -> registro, solo id: il browser riprende il polling
 *   - in lavorazione da piu' di ATTESA_MAX    -> chiama
 */
export function decidiVerifica(
  registro: RegistroVerifiche | null,
  tipo: TipoVerifica,
  adesso: number = Date.now(),
): Decisione {
  const v = registro?.[tipo];
  if (!v?.id) return { azione: 'chiama', motivo: 'assente' };
  const eta = adesso - new Date(v.avviata).getTime();
  // data illeggibile: meglio rispendere che servire un esito di eta' ignota
  if (!Number.isFinite(eta)) return { azione: 'chiama', motivo: 'scaduta' };
  if (v.pronto) {
    if (eta > TTL_VERIFICA) return { azione: 'chiama', motivo: 'scaduta' };
    return { azione: 'registro', id: v.id, pronto: true, dati: v.dati, avviata: v.avviata };
  }
  if (eta > ATTESA_MAX) return { azione: 'chiama', motivo: 'bloccata' };
  return { azione: 'registro', id: v.id, pronto: false, avviata: v.avviata };
}

/**
 * Cosa conservare della negativita'. Le tre presenze sempre; il resto della
 * risposta (il dettaglio, che si paga a parte) solo quando c'e' qualcosa da leggere.
 */
export function riduciNegativita(d: any): any {
  const base = {
    presenzaProtesti: !!d?.presenzaProtesti,
    presenzaPregiudizievoli: !!d?.presenzaPregiudizievoli,
    presenzaProcedure: !!d?.presenzaProcedure,
  };
  const qualcosa = base.presenzaProtesti || base.presenzaPregiudizievoli || base.presenzaProcedure;
  return qualcosa ? { ...base, dettaglio: d } : base;
}

/** Aggiorna una voce del registro senza toccare l'altra. */
export function conEsito(
  registro: RegistroVerifiche | null,
  cf: string,
  tipo: TipoVerifica,
  esito: EsitoVerifica,
): RegistroVerifiche {
  return { ...(registro ?? { cf }), cf, [tipo]: esito };
}
