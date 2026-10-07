// Documenti ufficiali della Camera di Commercio via Openapi DocuEngine:
// visura camerale ordinaria e bilancio depositato (ottico, cioe' il PDF vero).
// Modulo puro: niente rete, niente blob. Decide quale documento ordinare, se si
// serve dall'archivio o se va pagato, e come leggere le risposte di DocuEngine.
// L'I/O sta in docuengine.ts.
//
// Identificativi e prezzi letti da GET https://docuengine.openapi.com/documents il
// 07/10/2026, euro IVA esclusa. Se Openapi cambia listino si rilegge da li'.

export type TipoVisura = 'capitale' | 'persone' | 'individuale';

/**
 * La visura ordinaria non si chiede con la partita IVA: DocuEngine vuole numero
 * REA e provincia della Camera di Commercio, e ha un documento diverso per
 * forma giuridica.
 */
export const VISURA: Record<TipoVisura, { documentId: string; prezzo: number; nome: string }> = {
  capitale: { documentId: '663df75d19a52195e23e315c', prezzo: 4.9, nome: 'Visura ordinaria societa\' di capitali' },
  persone: { documentId: '6671a5549e6f0e447bc2659d', prezzo: 3.4, nome: 'Visura ordinaria societa\' di persone' },
  individuale: { documentId: '6671a5719e6f0e447bc2659e', prezzo: 2.9, nome: 'Visura ordinaria impresa individuale' },
};

/**
 * Bilancio ottico: si chiede col codice fiscale. La ricerca (0,10) restituisce
 * subito tutti gli esercizi depositati; si sceglie un esercizio per richiesta e
 * da li' parte il documento (4,40). Per un secondo anno serve una nuova ricerca.
 */
export const BILANCIO = { documentId: '667443c29e6f0e447bc265aa', ricerca: 0.1, documento: 4.4 };

/**
 * Codici di forma giuridica (tabella IT-legalforms di Openapi, letta il 07/10/2026)
 * che non sono societa' di capitali. Tutto il resto (SRL, SRLS, SPA, cooperative,
 * consorzi) va sulla visura delle societa' di capitali.
 */
const INDIVIDUALE = new Set(['DI', 'IF', 'PF']);
const PERSONE = new Set(['SN', 'AS', 'SE', 'SF', 'SI', 'AN', 'AE']);

export function tipoVisura(codiceForma: string | null | undefined): TipoVisura {
  const c = String(codiceForma ?? '').trim().toUpperCase();
  if (INDIVIDUALE.has(c)) return 'individuale';
  if (PERSONE.has(c)) return 'persone';
  return 'capitale';
}

// --- anni del bilancio -------------------------------------------------------

export interface AnnoBilancio {
  /** Identificativo del risultato dentro QUELLA ricerca: serve al PATCH */
  resultId: string;
  /** Identificativo del deposito al Registro Imprese: stabile tra ricerche diverse */
  balanceSheetId: string;
  /** Data di chiusura dell'esercizio, AAAA-MM-GG */
  data: string;
  anno: number;
  /** "BILANCIO ORDINARIO D'ESERCIZIO", "BILANCIO ABBREVIATO D'ESERCIZIO"... */
  tipo: string;
}

/** Dalla risposta di DocuEngine all'elenco degli esercizi, il piu' recente per primo. */
export function anniDaRicerca(results: any[] | null | undefined): AnnoBilancio[] {
  return (results ?? [])
    .map((r) => {
      const d = r?.data ?? {};
      const data = String(d.balanceSheetDate ?? '');
      return {
        resultId: String(r?.id ?? ''),
        balanceSheetId: String(d.balanceSheetId ?? ''),
        data,
        anno: Number(data.slice(0, 4)),
        tipo: String(d.balanceSheetTypeDescription ?? '').trim(),
      };
    })
    .filter((a) => a.resultId && a.balanceSheetId && Number.isFinite(a.anno) && a.anno > 1900)
    .sort((a, b) => b.data.localeCompare(a.data));
}

// --- stato delle richieste ---------------------------------------------------

export type Avanzamento = 'pronto' | 'errore' | 'attesa';

/**
 * DocuEngine documenta solo DONE come stato finale. Gli altri nomi non sono
 * scritti da nessuna parte: tutto cio' che suona come errore o annullamento
 * chiude la richiesta, il resto e' attesa.
 */
export function avanzamento(state: string | null | undefined): Avanzamento {
  const s = String(state ?? '').toUpperCase();
  if (s === 'DONE') return 'pronto';
  if (/ERROR|FAIL|CANCEL|REJECT|EXPIRED|REFUND/.test(s)) return 'errore';
  return 'attesa';
}

// --- archivio ------------------------------------------------------------------

export interface FileArchiviato {
  /** Percorso nello store Blob privato */
  percorso: string;
  nome: string;
  mime: string;
  dimensione: number | null;
}

export interface OrdineDocumento {
  /** Id della richiesta DocuEngine */
  richiestaId: string;
  /** ISO: quando e' partito l'ordine a pagamento. Il TTL si misura da qui. */
  avviato: string;
  stato: Avanzamento;
  /** Ultimo stato letto da DocuEngine, per chi deve ricostruire un episodio */
  statoDocuengine?: string;
  concluso?: string;
  errore?: string;
  file?: FileArchiviato[];
}

export interface OrdineVisura extends OrdineDocumento {
  tipo: TipoVisura;
}

export interface OrdineBilancio extends OrdineDocumento {
  anno: number;
  data: string;
  tipo: string;
  balanceSheetId: string;
}

export interface RicercaBilanci {
  richiestaId: string;
  quando: string;
  anni: AnnoBilancio[];
  /** La ricerca vale per un solo documento: dopo il PATCH non si riusa */
  usata: boolean;
}

/** Tutto quello che e' stato pagato per una partita IVA. */
export interface IndiceDocumenti {
  piva: string;
  visura?: OrdineVisura;
  /** Per balanceSheetId */
  bilanci?: Record<string, OrdineBilancio>;
  ricerca?: RicercaBilanci;
}

/** 30 giorni per la visura, come scheda e verifiche: oltre, la fotografia e' vecchia. */
export const TTL_VISURA = 30 * 24 * 60 * 60 * 1000;

/**
 * Un ordine fermo da un'ora non arrivera' piu': si accetta di ripagarlo,
 * altrimenti l'azienda resterebbe bloccata su una richiesta morta. DocuEngine
 * evade in pochi secondi o minuti, l'ora e' gia' larga.
 */
export const ATTESA_MAX_DOC = 60 * 60 * 1000;

/** L'elenco degli anni si mostra per 30 giorni senza ripagare la ricerca. */
export const TTL_ELENCO_ANNI = 30 * 24 * 60 * 60 * 1000;

/**
 * Una ricerca non ancora usata si puo' spendere per il PATCH solo se e' fresca:
 * quanto viva una richiesta in SEARCH su DocuEngine non e' scritto da nessuna parte.
 */
export const VITA_RICERCA = 12 * 60 * 60 * 1000;

export type Decisione =
  | { azione: 'archivio'; ordine: OrdineDocumento }
  | { azione: 'attendi'; ordine: OrdineDocumento }
  | { azione: 'ordina'; motivo: 'assente' | 'scaduto' | 'bloccato' | 'fallito' };

const eta = (iso: string | undefined, adesso: number) => adesso - new Date(String(iso)).getTime();

/**
 * Archivio o nuovo ordine? `ttl` null vuol dire "vale per sempre": e' il caso del
 * bilancio di un esercizio chiuso, che non cambia piu'.
 */
export function decidi(ordine: OrdineDocumento | undefined, ttl: number | null, adesso = Date.now()): Decisione {
  if (!ordine?.richiestaId) return { azione: 'ordina', motivo: 'assente' };
  const e = eta(ordine.avviato, adesso);
  // data illeggibile: meglio ripagare che servire un documento di eta' ignota
  if (!Number.isFinite(e)) return { azione: 'ordina', motivo: 'scaduto' };
  if (ordine.stato === 'pronto' && ordine.file?.length) {
    if (ttl != null && e > ttl) return { azione: 'ordina', motivo: 'scaduto' };
    return { azione: 'archivio', ordine };
  }
  if (ordine.stato === 'errore') return { azione: 'ordina', motivo: 'fallito' };
  if (e > ATTESA_MAX_DOC) return { azione: 'ordina', motivo: 'bloccato' };
  return { azione: 'attendi', ordine };
}

/**
 * La ricerca gia' pagata si puo' usare per l'esercizio richiesto? Ritorna il
 * resultId da mandare nel PATCH, oppure null se serve una ricerca nuova.
 */
export function resultIdRiusabile(
  ricerca: RicercaBilanci | undefined,
  balanceSheetId: string,
  adesso = Date.now(),
): string | null {
  if (!ricerca || ricerca.usata) return null;
  const e = eta(ricerca.quando, adesso);
  if (!Number.isFinite(e) || e > VITA_RICERCA) return null;
  return ricerca.anni.find((a) => a.balanceSheetId === balanceSheetId)?.resultId ?? null;
}

/** Gli anni da mostrare senza ripagare la ricerca, oppure null se l'elenco e' troppo vecchio. */
export function anniValidi(ricerca: RicercaBilanci | undefined, adesso = Date.now()): AnnoBilancio[] | null {
  if (!ricerca?.anni?.length) return null;
  const e = eta(ricerca.quando, adesso);
  return Number.isFinite(e) && e <= TTL_ELENCO_ANNI ? ricerca.anni : null;
}

/** Nome del file che il browser salva: leggibile in una cartella pratica. */
export function nomeFile(ragioneSociale: string, etichetta: string, estensione: string): string {
  const rs = String(ragioneSociale ?? '').replace(/[^\w\s.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'azienda';
  return `${etichetta} - ${rs}.${estensione.replace(/^\./, '') || 'pdf'}`;
}
