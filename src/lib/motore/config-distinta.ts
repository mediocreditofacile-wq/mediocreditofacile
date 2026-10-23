// Configurazione di una carrozzeria sul settore "distinta" (Led Office): i canali
// di quotazione, la societa' che firma i documenti, la checklist della pratica e le
// categorie del catalogo.
//
// Modulo puro: niente database, niente dati, niente rete. Lo importano il server
// e, per la checklist, anche il browser. I lettori dei canali (leggiCanali,
// CanaleConfig) e quelli elementari (oggetto, testo, elencoTesti, nonNull) sono
// condivisi col settore mezzi (config-mezzi.ts, calcolo-mezzi.ts, carrozzeria.ts).
// I valori stanno in app.carrozzeria come jsonb scritto dal Pannello MCF o dal
// seed, con le chiavi in camelCase come nei tipi qui sotto.
//
// Regola di lettura, uguale per tutti: un valore che non si legge si scarta, non si
// indovina. Un elemento con un campo scritto male esce dall'elenco (un canale con
// una soglia illeggibile non resta in giro senza soglia); un contenitore del tipo
// sbagliato o senza niente di leggibile da' null, e la carrozzeria ricade sul
// comportamento di sempre.

export type IdCanale = 'econocom' | 'grenke' | 'pagarent';

/** Un canale di quotazione, con le condizioni che lo rendono applicabile al cliente */
export interface CanaleConfig {
  canale: IdCanale;
  attivo: boolean;
  /** Listino del canale (src/lib/tabelle-canoni.ts), risolto dal server */
  tabella: string;
  /** Percentuale sul bene, fra 0 e 50. La vede solo l'admin MCF */
  maggiorazionePerc: number;
  fatturatoMin?: number;
  importoMin?: number;
  soloCapitali?: boolean;
  /** Codici forma giuridica del Registro esclusi dal canale */
  formeEscluse?: string[];
  anniMin?: number;
  /** Prefissi ATECO a sole cifre */
  settoriEsclusi?: string[];
  /** Sopra questo importo la proposta del canale esce come provvisoria */
  sogliaProvvisorio?: number;
  // Condizioni sul bene (settore mezzi): il canale vale solo per certi beni
  /** Codici dei venditori i cui beni il canale quota. Assente = tutti */
  venditori?: string[];
  /** Categorie del catalogo che il canale non quota */
  categorieEscluse?: string[];
  /** Il canale non quota i mezzi targati */
  escludiTargati?: boolean;
}

/** La societa' che firma i documenti verso il cliente */
export interface SocietaFornitrice {
  ragioneSociale: string;
  piva: string;
  rea: string;
  indirizzo: string;
  telefono: string;
  email: string;
  pec: string;
  /** Percorso del logo sullo store Blob (brand/...), null = nessun logo */
  logo: string | null;
}

export type ClasseChecklist = 'capitali' | 'persone' | 'individuale';

export interface VoceChecklist {
  nome: string;
  obbligatoria: boolean;
  /** La voce si chiede solo sopra questo importo dei beni (esclusivo) */
  sopraImporto?: number;
  /** La voce si chiede solo a queste forme. Assente = a tutte */
  forme?: ClasseChecklist[];
}

export interface ChecklistConfig {
  voci: VoceChecklist[];
  /** Formati ammessi per i documenti caricati */
  formati: ('pdf' | 'jpg')[];
}

export interface Categoria {
  nome: string;
  /** Prefissi ATECO a sole cifre. Vuoto = tipica per ogni settore */
  settoriTipici: string[];
  /** Le righe della categoria contano come postazioni di lavoro */
  postazione: boolean;
  /** Le righe della categoria sono LEDwall: serve la spunta sull'installazione */
  ledwall: boolean;
}

/** I canali che il motore sa instradare, nell'ordine del pannello */
export const CANALI: readonly IdCanale[] = ['econocom', 'grenke', 'pagarent'];
const CLASSI: readonly ClasseChecklist[] = ['capitali', 'persone', 'individuale'];
const FORMATI: readonly string[] = ['pdf', 'jpg'];

/** Tetto della maggiorazione: oltre il 50% e' quasi certamente un errore di battitura */
const MAGGIORAZIONE_MAX = 50;

// --- lettori elementari -----------------------------------------------------
// Ognuno ritorna il valore letto oppure null.

export const oggetto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export const testo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export const booleano = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

const numeroNonNegativo = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export function elencoTesti(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const letti = v.map(testo);
  return letti.every((t): t is string => t !== null) ? letti : null;
}

/** "62.0" -> "620". Un prefisso senza cifre non si legge: lo scarto ricade sull'elemento intero */
function prefissiAteco(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const letti = v.map((p) => (typeof p === 'string' ? p.replace(/\D/g, '') : ''));
  return letti.every((p) => p !== '') ? letti : null;
}

/** Un campo facoltativo: assente o null va bene, presente e illeggibile no */
function facoltativo<T>(v: unknown, leggi: (x: unknown) => T | null): { ok: boolean; valore?: T } {
  if (v === undefined || v === null) return { ok: true };
  const letto = leggi(v);
  return letto === null ? { ok: false } : { ok: true, valore: letto };
}

export const nonNull = <T>(x: T | null): x is T => x !== null;

// --- canali -----------------------------------------------------------------

const CONDIZIONI_CANALE: readonly [keyof CanaleConfig, (x: unknown) => unknown][] = [
  ['fatturatoMin', numeroNonNegativo],
  ['importoMin', numeroNonNegativo],
  ['soloCapitali', booleano],
  ['formeEscluse', elencoTesti],
  ['anniMin', numeroNonNegativo],
  ['settoriEsclusi', prefissiAteco],
  ['sogliaProvvisorio', numeroNonNegativo],
  ['venditori', elencoTesti],
  ['categorieEscluse', elencoTesti],
  ['escludiTargati', booleano],
];

function leggiCanale(x: unknown): CanaleConfig | null {
  const o = oggetto(x);
  if (!o) return null;
  const canale = CANALI.find((c) => c === o.canale);
  const tabella = testo(o.tabella);
  const m = o.maggiorazionePerc;
  if (!canale || !tabella || typeof o.attivo !== 'boolean') return null;
  if (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m > MAGGIORAZIONE_MAX) return null;

  const letto: CanaleConfig = { canale, attivo: o.attivo, tabella, maggiorazionePerc: m };
  for (const [chiave, leggi] of CONDIZIONI_CANALE) {
    const c = facoltativo(o[chiave], leggi);
    if (!c.ok) return null;
    if (c.valore !== undefined) (letto as unknown as Record<string, unknown>)[chiave] = c.valore;
  }
  return letto;
}

/** I canali nell'ordine in cui sono scritti (l'ordine e' la priorita'). Non-array = null */
export function leggiCanali(v: unknown): CanaleConfig[] | null {
  return Array.isArray(v) ? v.map(leggiCanale).filter(nonNull) : null;
}

// --- societa' fornitrice ----------------------------------------------------

export function leggiSocieta(v: unknown): SocietaFornitrice | null {
  const o = oggetto(v);
  if (!o) return null;
  const ragioneSociale = testo(o.ragioneSociale);
  const piva = testo(o.piva);
  const logo = facoltativo(o.logo, testo);
  // Indirizzo, recapiti e REA possono essere vuoti ma non di un altro tipo
  const altri = [o.rea, o.indirizzo, o.telefono, o.email, o.pec];
  if (!ragioneSociale || !piva || !logo.ok || !altri.every((a) => typeof a === 'string')) return null;
  const [rea, indirizzo, telefono, email, pec] = (altri as string[]).map((a) => a.trim());
  return { ragioneSociale, piva, rea, indirizzo, telefono, email, pec, logo: logo.valore ?? null };
}

// --- checklist --------------------------------------------------------------

function leggiForme(v: unknown): ClasseChecklist[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const letti = v.map((f) => CLASSI.find((c) => c === f) ?? null);
  return letti.every(nonNull) ? letti : null;
}

function leggiVoce(x: unknown): VoceChecklist | null {
  const o = oggetto(x);
  if (!o) return null;
  const nome = testo(o.nome);
  const obbligatoria = booleano(o.obbligatoria);
  const sopra = facoltativo(o.sopraImporto, numeroNonNegativo);
  const forme = facoltativo(o.forme, leggiForme);
  if (!nome || obbligatoria === null || !sopra.ok || !forme.ok) return null;
  const voce: VoceChecklist = { nome, obbligatoria };
  if (sopra.valore !== undefined) voce.sopraImporto = sopra.valore;
  if (forme.valore !== undefined) voce.forme = forme.valore;
  return voce;
}

/** Senza nessuna voce leggibile o nessun formato ammesso da' null: si torna alla checklist di sempre */
export function leggiChecklist(v: unknown): ChecklistConfig | null {
  const o = oggetto(v);
  if (!o || !Array.isArray(o.voci) || !Array.isArray(o.formati)) return null;
  const voci = o.voci.map(leggiVoce).filter(nonNull);
  const formati = [...new Set(o.formati)].filter((f): f is 'pdf' | 'jpg' => FORMATI.includes(f as string));
  return voci.length > 0 && formati.length > 0 ? { voci, formati } : null;
}

/**
 * Le voci da chiedere a un cliente di quella forma per quell'importo dei beni.
 * Nell'ordine in cui sono scritte. Nel dubbio si chiede di piu': con la forma non
 * classificata restano tutte le voci di forma, con un importo che non si legge
 * restano quelle "sopra importo". Meglio un documento in piu' che uno perso.
 */
export function vociChecklist(
  c: ChecklistConfig,
  classe: ClasseChecklist | 'non-classificata',
  beni: number,
): VoceChecklist[] {
  return c.voci.filter((v) => {
    if (v.forme && classe !== 'non-classificata' && !v.forme.includes(classe)) return false;
    if (v.sopraImporto !== undefined && Number.isFinite(beni) && beni <= v.sopraImporto) return false;
    return true;
  });
}

// --- categorie --------------------------------------------------------------

function leggiCategoria(x: unknown): Categoria | null {
  const o = oggetto(x);
  if (!o) return null;
  const nome = testo(o.nome);
  const settoriTipici = prefissiAteco(o.settoriTipici);
  const postazione = booleano(o.postazione);
  const ledwall = booleano(o.ledwall);
  if (!nome || !settoriTipici || postazione === null || ledwall === null) return null;
  return { nome, settoriTipici, postazione, ledwall };
}

export function leggiCategorie(v: unknown): Categoria[] | null {
  return Array.isArray(v) ? v.map(leggiCategoria).filter(nonNull) : null;
}
