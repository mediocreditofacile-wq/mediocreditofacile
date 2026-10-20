// La distinta nel browser (settore "distinta", oggi Led Office): le regole pure che
// servono alle schermate del commerciale. Ricerca nel catalogo, indirizzi di
// consegna, motivazioni che seguono le righe, righe da mandare al server, voci
// della checklist e campi che mancano alle due proposte.
// Spec mcf_spec-ledoffice-motore_v1, paragrafi 7 e 9.
//
// Niente DOM, niente rete: si testa da solo. Il server ricontrolla tutto, qui si
// anticipa soltanto quello che dira'. Non importa config-distinta.ts: quel modulo
// porta anche i canali, che nel browser non devono entrare.

import { controllaCellulare, controllaDatiCliente, controllaEmail, type EsitoDatiCliente } from '../../lib/dati-cliente-pratica';
import { controllaIban } from '../../lib/iban';

// --- catalogo ------------------------------------------------------------------

/** Minuscole, senza accenti, spazi ripuliti: "Unità" e "UNITA" si trovano a vicenda */
function normalizza(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Le voci del catalogo di quella categoria (null o vuota: tutte) che contengono ogni
 * parola del testo, in qualunque ordine, nel nome, nel codice o nella descrizione.
 * Il nome della categoria non conta: "tablet" non deve tirare dentro tutta la
 * categoria "Periferiche e tablet". L'ordine resta quello del catalogo.
 */
export function filtraCatalogo(voci: any[], categoria: string | null, testo: string): any[] {
  const parole = normalizza(testo).split(' ').filter(Boolean);
  return voci.filter((v) => {
    if (categoria && v?.attributi?.categoria !== categoria) return false;
    if (!parole.length) return true;
    const dove = normalizza(`${v?.nome ?? ''} ${v?.codice ?? ''} ${v?.descrizione ?? ''}`);
    return parole.every((p) => dove.includes(p));
  });
}

/**
 * Stessa regola del server (eScaduta in distinta.ts): una validita' assente non
 * scade, una data storta si', e si scade il giorno dopo valido_fino. `oggi` e'
 * il giorno AAAA-MM-GG in ora italiana (giornoItaliano).
 */
export function prezzoDaRiconfermare(validoFino: unknown, oggi: string): boolean {
  if (validoFino === undefined || validoFino === null || (typeof validoFino === 'string' && validoFino.trim() === '')) return false;
  if (typeof validoFino !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(validoFino)) return true;
  return validoFino < oggi;
}

// --- consegna ------------------------------------------------------------------

export interface OpzioneConsegna {
  tipo: 'sede' | 'unita';
  indirizzo: string;
  etichetta: string;
}

/** Per il confronto: spazi ripuliti e maiuscole, come fa il server in consegnaDa */
const confrontabile = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Dove si puo' consegnare senza uscire dagli indirizzi del Registro: la sede legale
 * e poi le unita' locali. Le ricerche fatte prima del 20/10/2026 non hanno le unita'
 * locali. Gli indirizzi vuoti o gia' in elenco si scartano. "Altro indirizzo" lo
 * aggiunge la pagina.
 */
export function opzioniConsegna(scheda: { sede: string | null; unitaLocali: string[] }): OpzioneConsegna[] {
  const opzioni: OpzioneConsegna[] = [];
  const visti = new Set<string>();
  const aggiungi = (tipo: OpzioneConsegna['tipo'], indirizzo: unknown) => {
    if (typeof indirizzo !== 'string' || !indirizzo.trim()) return;
    const chiave = confrontabile(indirizzo);
    if (visti.has(chiave)) return;
    visti.add(chiave);
    opzioni.push({ tipo, indirizzo, etichetta: `${tipo === 'sede' ? 'Sede legale' : 'Unità locale'}: ${indirizzo}` });
  };
  aggiungi('sede', scheda?.sede);
  for (const u of scheda?.unitaLocali ?? []) aggiungi('unita', u);
  return opzioni;
}

// --- motivazioni ---------------------------------------------------------------

/**
 * Le motivazioni per riga hanno la chiave riga-N, con N l'indice della riga. Quando
 * se ne toglie una, la sua motivazione sparisce e quelle dopo scalano di uno: un
 * testo non deve mai finire sotto un altro bene. 'perdita' e 'addetti' restano.
 */
export function motivazioniDopoTolta(motivazioni: Record<string, string>, indice: number): Record<string, string> {
  const nuove: Record<string, string> = {};
  for (const [chiave, testo] of Object.entries(motivazioni)) {
    const m = /^riga-(\d+)$/.exec(chiave);
    if (!m) { nuove[chiave] = testo; continue; }
    const n = Number(m[1]);
    if (n === indice) continue;
    nuove[`riga-${n > indice ? n - 1 : n}`] = testo;
  }
  return nuove;
}

// --- righe verso il server -------------------------------------------------------

/**
 * Un importo o una quantita' scritti dal commerciale, letti all'italiana: il punto
 * separa le migliaia ("1.500" sono millecinquecento), la virgola i decimali. Un punto
 * che non separa gruppi di tre cifre ("1500.50") vale come decimale. Quello che non
 * si legge e' NaN, mai zero. Al server va il numero, non il testo: "1.500" per lui e'
 * ambiguo e lo rifiuta.
 */
export function leggiNumero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').replace(/[€\s]/g, '');
  let pulito: string;
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(s) || /^-?\d+,\d+$/.test(s)) pulito = s.replace(/\./g, '').replace(',', '.');
  // Il primo gruppo non comincia con lo zero: "0.500" e' 0,5, non 500
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) pulito = s.replace(/\./g, '');
  else if (/^-?\d+(\.\d+)?$/.test(s)) pulito = s;
  else return NaN;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : NaN;
}

export interface RigaBrowser {
  /** Null sulle righe fuori listino */
  codice: string | null;
  descrizione: string;
  categoria: string;
  quantita: number;
  prezzo: number;
}

export type ErroreRiga = 'distinta_vuota' | 'quantita_non_valida' | 'prezzo_non_valido' | 'descrizione_mancante' | 'categoria_non_valida';

export type EsitoRighe =
  | { ok: true; righe: Record<string, unknown>[] }
  /** `riga` e' l'indice da zero; null se l'errore e' di tutta la distinta */
  | { ok: false; riga: number | null; errore: ErroreRiga };

/** Lo stesso tetto del server (MAX_QUANTITA in distinta.ts) */
const MAX_QUANTITA = 10_000;

/**
 * Le righe nel corpo che il server si aspetta. Quantita' e prezzo come numeri, mai
 * come testo: il server rifiuta "1.500" perche' non sa se sono mille e cinquecento o
 * uno e mezzo. Di listino: codice, quantita', prezzo (descrizione e categoria le
 * prende dal catalogo). Fuori listino: niente chiave codice, nemmeno vuota, perche'
 * per il server una riga con un codice e' di listino e quel codice deve esistere.
 * Si ferma alla prima riga che non regge.
 */
export function righePerServer(righe: RigaBrowser[]): EsitoRighe {
  if (!righe.length) return { ok: false, riga: null, errore: 'distinta_vuota' };
  const corpo: Record<string, unknown>[] = [];
  for (const [i, r] of righe.entries()) {
    const fuori = !r.codice;
    if (fuori && !String(r.descrizione ?? '').trim()) return { ok: false, riga: i, errore: 'descrizione_mancante' };
    if (fuori && !String(r.categoria ?? '').trim()) return { ok: false, riga: i, errore: 'categoria_non_valida' };
    if (!Number.isInteger(r.quantita) || r.quantita < 1 || r.quantita > MAX_QUANTITA) {
      return { ok: false, riga: i, errore: 'quantita_non_valida' };
    }
    if (!Number.isFinite(r.prezzo) || r.prezzo <= 0) return { ok: false, riga: i, errore: 'prezzo_non_valido' };
    corpo.push(fuori
      ? { descrizione: r.descrizione.trim(), categoria: r.categoria, quantita: r.quantita, prezzo: r.prezzo }
      : { codice: r.codice, quantita: r.quantita, prezzo: r.prezzo });
  }
  return { ok: true, righe: corpo };
}

// --- checklist della pratica -----------------------------------------------------

export type ClasseBrowser = 'capitali' | 'persone' | 'individuale' | 'non-classificata';

/**
 * La classe della forma giuridica dal testo della scheda. Il server la prende dal
 * codice del Registro (classeForma); il browser ha solo il testo, quindi quando non
 * lo riconosce dice "non classificata" e la checklist chiede di piu', come il server.
 */
export function classeDaForma(forma: string | null | undefined): ClasseBrowser {
  const f = normalizza(forma).toUpperCase();
  if (!f) return 'non-classificata';
  if (/INDIVIDUAL/.test(f)) return 'individuale';
  if (/RESPONSABILIT|AZION|S\.R\.L|S\.P\.A|COOPERATIV|CONSORZI/.test(f)) return 'capitali';
  if (/NOME COLLETTIVO|ACCOMANDITA|SOCIETA'? SEMPLICE|DI FATTO|S\.N\.C|S\.A\.S/.test(f)) return 'persone';
  return 'non-classificata';
}

export interface VoceChecklistBrowser {
  nome: string;
  obbligatoria: boolean;
  sopraImporto?: number;
  forme?: ('capitali' | 'persone' | 'individuale')[];
}

/**
 * Le voci da chiedere a quel cliente per quel totale dei beni. E' la regola di
 * vociChecklist (config-distinta.ts, sul server), riscritta qui perche' il browser
 * non importa quel modulo; un test le confronta. Nel dubbio si chiede di piu'.
 */
export function vociDaChiedere<T extends VoceChecklistBrowser>(voci: T[], classe: ClasseBrowser, beni: number): T[] {
  return voci.filter((v) => {
    if (v.forme && classe !== 'non-classificata' && !v.forme.includes(classe)) return false;
    if (v.sopraImporto !== undefined && Number.isFinite(beni) && beni <= v.sopraImporto) return false;
    return true;
  });
}

// --- quello che manca alle due proposte --------------------------------------------

/** I nomi dei campi, con le chiavi di leggiDatiVendita (dati-vendita.ts) */
export const ETICHETTE_VENDITA: Record<string, string> = {
  'amministratore.nome': "nome dell'amministratore",
  'amministratore.nascita': "data di nascita dell'amministratore",
  'amministratore.codiceFiscale': "codice fiscale dell'amministratore",
  'amministratore.residenza': "residenza dell'amministratore",
  telefono: 'telefono del firmatario',
  email: 'email del firmatario',
  'riferimento.nome': 'persona di riferimento',
  'riferimento.telefono': 'telefono della persona di riferimento',
  iban: 'IBAN',
  sdi_o_pec: 'codice SDI o PEC',
};

/**
 * Cosa manca per la proposta di vendita (e per quella che va a MCF): l'indirizzo di
 * consegna e i campi che leggiDatiVendita non accetta, nell'ordine del modulo.
 */
export function mancantiProposte(venditaMancanti: string[], indirizzoConsegna: string): string[] {
  const nomi = venditaMancanti.map((k) => ETICHETTE_VENDITA[k] ?? k);
  return String(indirizzoConsegna ?? '').trim() ? nomi : ['indirizzo di consegna', ...nomi];
}

// --- il conto in corso -------------------------------------------------------------

/**
 * I turni delle richieste del conto. Ogni cambio della distinta apre un turno nuovo,
 * e una risposta vale solo se il suo turno e' ancora l'ultimo: una risposta partita
 * prima di togliere una riga porterebbe motivazioni con gli indici di prima, e un
 * testo finirebbe sotto un altro bene.
 */
export function turni() {
  let ultimo = 0;
  return {
    nuovo: () => ++ultimo,
    vale: (turno: number) => turno === ultimo,
  };
}

// --- contatti della pratica ----------------------------------------------------------

/**
 * Cellulare, email del referente e IBAN prima dell'invio della pratica. Senza una
 * proposta di vendita servono tutti e tre (controllaDatiCliente, regola del
 * 16/10/2026). Con una proposta di vendita un campo vuoto resta vuoto: il server lo
 * prende dai dati di vendita della proposta. Quello che e' scritto deve reggere.
 */
export function controllaContatti(
  d: { telefono: string; email: string; iban: string },
  dallaProposta: boolean,
): EsitoDatiCliente {
  const telefono = String(d.telefono ?? '').trim();
  const email = String(d.email ?? '').trim();
  const iban = String(d.iban ?? '').trim();
  if (!dallaProposta) return controllaDatiCliente({ telefono, email, iban });
  const motivo = (telefono ? controllaCellulare(telefono) : null) ?? (email ? controllaEmail(email) : null);
  if (motivo) return { ok: false, ...motivo };
  if (!iban) return { ok: true, telefono, email, iban: '' };
  const letto = controllaIban(iban);
  if (!letto.ok) return { ok: false, errore: 'iban_non_valido', messaggio: letto.messaggio };
  return { ok: true, telefono, email, iban: letto.iban };
}
