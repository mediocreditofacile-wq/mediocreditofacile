// Strato comune del portale del motore: stato, formattazione, chiamate alle API.
// Nel browser non c'e' niente di riservato: coefficienti, listini e dati dei
// clienti arrivano dalle API, che ricavano il fornitore dalla sessione.

import { TESTI_PREFILTRO } from '../../lib/motore/prefiltro';

export interface Stato {
  slug: string;
  settore: string;
  ruolo: 'admin' | 'referente' | 'agente';
  vedeTutto: boolean;
  utente: { id: string; nome: string; email: string } | null;
  carrozzeria: any;
  catalogo: any[];
  /** La ricerca su cui si sta lavorando */
  ricerca: { id: string; scheda: any; info: any; credito: any; eventi?: string | null } | null;
  /** L'ultima proposta calcolata, con l'input che l'ha prodotta */
  proposta: { input: any; esito: any } | null;
  /** L'ultimo preventivo salvato su questa ricerca: la pratica ci si aggancia */
  ultimoPreventivo: string | null;
}

export const stato: Stato = {
  slug: '',
  settore: 'generico',
  ruolo: 'agente',
  vedeTutto: false,
  utente: null,
  carrozzeria: null,
  catalogo: [],
  ricerca: null,
  proposta: null,
  ultimoPreventivo: null,
};

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Senza useGrouping 'always' l'italiano scrive 8001 invece di 8.001 */
export const num = (v: unknown, dec = 0) =>
  (Number(v) || 0).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });

export const euro = (v: unknown, dec = 0) => (v == null || v === '' ? '—' : `${num(v, dec)} €`);

/** Un prezzo di listino com'e': coi centesimi quando ci sono (il carrello Caddy a 186,32), tondo altrimenti */
export const euroEsatto = (v: unknown) => euro(v, Math.abs((Number(v) || 0) % 1) < 0.005 ? 0 : 2);

export const data = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Messaggi tecnici tradotti: l'agente non deve leggere codici di errore
const MESSAGGI: Record<string, string> = {
  sessione_assente: "La sessione è scaduta. Rifai l'accesso.",
  utente_disattivato: 'Questo accesso è stato disattivato. Scrivi al tuo referente.',
  nessuna_organizzazione: 'Questo accesso non è più attivo su nessun portale.',
  fornitore_non_tuo: 'Questo accesso non è abilitato su questo portale.',
  fornitore_sospeso: 'Il portale è temporaneamente sospeso.',
  permesso_negato: 'Non hai i permessi per questa operazione.',
  invito_scaduto: "L'invito è scaduto. Chiedi al tuo referente di rimandarlo.",
  invito_gia_usato: 'Questo invito è già stato usato. Prova ad accedere con la tua password.',
  invito_inesistente: 'Invito non valido.',
  gia_membro: 'Questa persona è già nella rete.',
  invito_gia_aperto: "C'è già un invito aperto per questa email.",
  email_non_valida: "L'indirizzo email non sembra valido.",
  password_troppo_corta: 'La password deve avere almeno dieci caratteri.',
  origine_non_valida: 'Richiesta bloccata per sicurezza. Ricarica la pagina.',
  hai_gia_accesso: 'Questa email ha già un accesso: prova a entrare, o recupera la password.',
  richiesta_gia_inviata: 'La tua richiesta è già in attesa. Ti scriviamo appena viene attivata.',
  fornitore_sconosciuto: 'Portale non riconosciuto. Controlla il link che hai ricevuto.',
  richiesta_non_trovata: 'Richiesta non trovata, o già gestita.',
  invito_non_trovato: 'Invito non trovato, o già accettato.',
  invio_rimandato: 'La posta non lo ha accettato adesso: resta in coda e riparte col giro automatico.',
  invio_fallito: "L'invio non è riuscito. Controlla l'indirizzo email.",
  piva_non_valida: 'La partita IVA non è valida: controlla le 11 cifre.',
  piva_non_trovata: 'Nessuna azienda con questa partita IVA nel Registro imprese.',
  tetto_raggiunto: 'Le verifiche del mese per questo portale sono finite. Scrivi a Mediocredito Facile.',
  servizio_non_disponibile: 'Il servizio di verifica non risponde adesso. Riprova tra qualche minuto.',
  ricerca_non_trovata: 'Ricerca non trovata. Rifai la verifica del cliente.',
  voce_non_trovata: 'Questa voce del catalogo non è più disponibile.',
  prezzo_non_valido: 'Il prezzo non è valido.',
  calcolo_non_riuscito: 'Il calcolo non è riuscito. Riprova, e se si ripete scrivi a Mediocredito Facile.',
  non_sul_motore: 'Portale non configurato.',
  proposta_bloccata: 'Su questo importo non si genera un preventivo: carica la pratica e la guarda Mediocredito Facile.',
  preventivo_non_riuscito: 'Il preventivo non è stato salvato. Riprova tra poco.',
  bozza_non_valida: 'Il modulo è scaduto. Ricarica la pagina e riprova.',
  importo_non_valido: "L'importo non è valido.",
  durata_non_valida: 'La durata non è valida.',
  cellulare_mancante: "Scrivi il cellulare del referente del cliente: serve insieme all'email.",
  cellulare_non_valido: 'Il cellulare del referente non sembra un numero: controlla le cifre.',
  email_mancante: "Scrivi l'email del referente del cliente: serve insieme al cellulare.",
  iban_mancante: "Scrivi l'IBAN del conto aziendale del cliente: senza, la pratica non si apre.",
  iban_non_valido: "L'IBAN del cliente non è valido: ricontrollalo sul documento del cliente.",
  pratica_non_riuscita: 'La pratica non è stata inviata. Riprova, e se si ripete scrivi a Mediocredito Facile.',
  stato_non_valido: 'Stato non valido.',
  nessuna_pratica: 'Seleziona almeno una pratica.',
  voce_non_valida: 'Alla voce mancano codice, nome o prezzo.',
  azione_sconosciuta: 'Operazione non riconosciuta.',
  accessorio_non_valido: 'Un accessorio non è più disponibile o non è di questa macchina: rifai la scelta.',
  // Settore distinta: righe della fornitura e pratica
  distinta_vuota: 'Aggiungi almeno un bene alla fornitura.',
  troppe_righe: 'Una fornitura arriva al massimo a 60 righe.',
  quantita_non_valida: 'La quantità deve essere un numero intero da 1 in su.',
  categoria_non_valida: 'Scegli la categoria del bene.',
  descrizione_mancante: 'Scrivi la descrizione del bene.',
  proposta_mancante: 'Per caricare la pratica serve una proposta salvata: prima scarica il preventivo e la proposta di vendita.',
  proposta_non_valida: 'La proposta indicata non è di questo cliente o non si può usare: rifai il preventivo dalla scheda Proposte.',
  consegna_mancante: "Manca l'indirizzo di consegna: indica dove vanno consegnati i beni.",
  documenti_mancanti: 'Mancano dei documenti obbligatori.',
  cliente_bloccato: TESTI_PREFILTRO.bloccato,
  configurazione_mancante: 'Il portale non è configurato per le pratiche. Scrivi a Mediocredito Facile.',
};
export const traduci = (codice: string) => MESSAGGI[codice] ?? 'Qualcosa non ha funzionato. Riprova.';

export async function apiJson(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  let corpo: any = null;
  try { corpo = await res.json(); } catch { /* risposta senza corpo */ }
  return { res, corpo };
}

/** URL di un'API del motore col fornitore della pagina */
export const api = (percorso: string, extra: Record<string, string> = {}) =>
  `/api/motore/${percorso}?${new URLSearchParams({ f: stato.slug, ...extra })}`;

/** Messaggio in un riquadro: errore o conferma */
export function messaggio(el: HTMLElement, testo: string, ok: boolean) {
  el.textContent = testo;
  el.className = `mt-msg ${ok ? 'mt-msg--ok' : 'mt-msg--errore'}`;
  el.hidden = !testo;
}

/** Apre un tab. Lo usano i bottoni che portano da una sezione all'altra. */
export function apriTab(nome: string) {
  document.querySelectorAll<HTMLButtonElement>('.mt-tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.tab === nome));
  });
  document.querySelectorAll<HTMLElement>('.mt-pannello').forEach((p) => {
    p.hidden = p.dataset.pannello !== nome;
  });
  document.dispatchEvent(new CustomEvent('mt:tab', { detail: nome }));
}

export const ETICHETTA_SEMAFORO: Record<string, string> = {
  'verde-scuro': 'In linea con i criteri',
  'verde-chiaro': 'Buone basi',
  verde: 'Verosimile',
  giallo: 'Da istruire',
  rosso: 'Difficile',
  // Settore macchine: proposta fatta prima della verifica della partita IVA
  'non-verificato': 'Cliente non verificato',
  // Settore distinta (prefiltro): cliente segnato da MCF, niente distinta e niente pratica
  bloccato: 'Non lavorabile dal portale',
};
