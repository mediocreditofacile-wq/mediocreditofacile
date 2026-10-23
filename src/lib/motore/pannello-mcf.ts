// I controlli del Pannello MCF (spec mcf_spec-ledoffice-motore_v1, paragrafo 10):
// configurazione del settore distinta, clienti segnalati, pratiche esterne.
//
// Modulo puro, senza database: lo usa /api/motore/admin e si prova da solo. Contiene
// nomi di canali e locatori, e per i mezzi partite IVA e spread: solo server, mai dal
// browser degli agenti.
//
// La regola e' una: quello che l'admin manda si salva com'e' o non si salva. I lettori
// di config-distinta scartano in silenzio un elemento scritto male, ed e' giusto alla
// lettura (un canale con una soglia illeggibile non resta in giro senza soglia); al
// salvataggio invece lo scarto in silenzio farebbe danni: una voce di checklist
// sparita smette di chiedere un documento. Quindi qui si rilegge cio' che e' arrivato
// con lo stesso lettore, e se il lettore scarterebbe o cambierebbe qualcosa il
// salvataggio si rifiuta con un messaggio che dice cosa.

import { CANALI_ESTERNI, NOMI_CANALE, type CanaleEsterno } from './nomi-canale';
import {
  CANALI,
  leggiCanali,
  leggiCategorie,
  leggiChecklist,
  leggiSocieta,
  type CanaleConfig,
  type Categoria,
  type ChecklistConfig,
  type IdCanale,
  type SocietaFornitrice,
  type VoceChecklist,
} from './config-distinta';
import { dataValidita, numero } from './catalogo-import';
import { ANTICIPO_MAX_MEZZI, condizioneDaSpread, leggiConfigMezzi, type ConfigMezzi, type PartnerConfronto } from './config-mezzi';
import { PARTNERS_LEASING_MOTORE, getCondizioniPerDurata } from '../../data/leasing';
import { pivaValida, pulisciPiva } from '../piva';

export type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

const no = (errore: string): { ok: false; errore: string } => ({ ok: false, errore });


export const MOTIVI_SEGNALAZIONE = ['insoluto', 'sofferenze', 'altro'] as const;
export const EFFETTI_SEGNALAZIONE = ['blocco', 'rosso'] as const;

const NON_SALVATO = 'Nessuna modifica salvata.';

/**
 * Una scelta di un menu (settore, regole del semaforo): il valore se e' fra quelli
 * ammessi, altrimenti null, che per chi salva vuol dire "lascia quello che c'e'".
 * Un valore sconosciuto non diventa mai il default al posto di quello salvato.
 */
export function sceltaDaElenco(inviato: unknown, ammessi: readonly string[]): string | null {
  return typeof inviato === 'string' && ammessi.includes(inviato) ? inviato : null;
}

// --- confronto fra cio' che e' arrivato e cio' che il lettore ne tiene ----------------

/** Chiavi in ordine, null e undefined tolti: cosi' "assente" e "null" sono la stessa cosa */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v !== null && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined && x !== null) o[k] = canonico(x);
    }
    return o;
  }
  return v;
}

const uguali = (a: unknown, b: unknown) =>
  JSON.stringify(canonico(a ?? undefined)) === JSON.stringify(canonico(b ?? undefined));

const mostra = (v: unknown) => (Array.isArray(v) ? v.map(String).join(', ') : String(v));

const oggetto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Il primo campo che il lettore toglierebbe o cambierebbe, detto a parole. Null = nessuno */
function differenza(inviato: Record<string, unknown>, letto: object, etichette: Record<string, string>): string | null {
  const l = letto as Record<string, unknown>;
  for (const k of new Set([...Object.keys(inviato), ...Object.keys(l)])) {
    if (uguali(inviato[k], l[k])) continue;
    if (!(k in etichette)) return `campo «${k}» non previsto: non si salverebbe`;
    if (l[k] === undefined || l[k] === null) return `${etichette[k]} «${mostra(inviato[k])}»: non si salverebbe`;
    return `${etichette[k]}: si salverebbe «${mostra(l[k])}» invece di «${mostra(inviato[k])}»`;
  }
  return null;
}

/**
 * Perche' il lettore scarta un elemento: prima i campi obbligatori, controllati a mano;
 * poi quelli facoltativi, provando a rileggere l'elemento senza ciascuno di loro.
 */
function campoFacoltativoIlleggibile(
  o: Record<string, unknown>,
  leggiUno: (x: unknown) => unknown,
  etichette: Record<string, string>,
): string {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined || o[k] === null) continue;
    if (leggiUno({ ...o, [k]: undefined }) !== null) {
      return `${etichette[k] ?? `campo «${k}»`} «${mostra(o[k])}»: non si legge`;
    }
  }
  return 'non si legge';
}

const numeroFra = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

// --- canali -----------------------------------------------------------------------

const ETICHETTE_CANALE: Record<string, string> = {
  canale: 'canale', attivo: 'interruttore acceso/spento', tabella: 'listino', maggiorazionePerc: 'maggiorazione',
  fatturatoMin: 'fatturato minimo', importoMin: 'importo minimo dei beni', soloCapitali: 'solo società di capitali',
  formeEscluse: 'forme giuridiche escluse', anniMin: 'anni di attività minimi', settoriEsclusi: 'settori esclusi',
  sogliaProvvisorio: 'soglia del bilancio provvisorio',
  // Condizioni sul bene (settore mezzi)
  venditori: 'venditori', categorieEscluse: 'categorie escluse', escludiTargati: 'esclude i mezzi targati',
  escludiUsati: 'esclude i mezzi usati',
};

const leggiUnCanale = (x: unknown) => leggiCanali([x])?.[0] ?? null;

function perche(o: Record<string, unknown>): string {
  if (typeof o.attivo !== 'boolean') return 'interruttore acceso/spento: non si legge';
  if (typeof o.tabella !== 'string' || !o.tabella.trim()) return 'listino: manca';
  if (!numeroFra(o.maggiorazionePerc, 0, 50)) {
    return `maggiorazione «${mostra(o.maggiorazionePerc)}»: serve un numero fra 0 e 50`;
  }
  return campoFacoltativoIlleggibile(o, leggiUnCanale, ETICHETTE_CANALE);
}

/** I canali come li ha mandati il pannello, nell'ordine (l'ordine e' la priorita') */
export function controllaCanali(v: unknown, tabellaEsiste: (id: string) => boolean): Esito<CanaleConfig[]> {
  if (!Array.isArray(v)) return no(`I canali devono essere un elenco. ${NON_SALVATO}`);
  if (v.length === 0) return no(`Serve almeno un canale. ${NON_SALVATO}`);
  const letti: CanaleConfig[] = [];
  for (const [i, x] of v.entries()) {
    const o = oggetto(x);
    const id = o?.canale as IdCanale;
    const noto = CANALI.includes(id);
    const nome = noto ? NOMI_CANALE[id] : `Canale n. ${i + 1}`;
    if (!o) return no(`${nome}: non si legge. ${NON_SALVATO}`);
    if (!noto) return no(`${nome}: canale sconosciuto «${mostra(o.canale)}». ${NON_SALVATO}`);
    const letto = leggiUnCanale(o);
    if (!letto) return no(`${nome}, ${perche(o)}. ${NON_SALVATO}`);
    const diversa = differenza(o, letto, ETICHETTE_CANALE);
    if (diversa) return no(`${nome}, ${diversa}. ${NON_SALVATO}`);
    if (!tabellaEsiste(letto.tabella)) return no(`${nome}, listino «${letto.tabella}»: non esiste. ${NON_SALVATO}`);
    if (letti.some((c) => c.canale === letto.canale)) return no(`${nome} compare due volte. ${NON_SALVATO}`);
    letti.push(letto);
  }
  return { ok: true, valore: letti };
}

// --- societa' fornitrice ----------------------------------------------------------

const ETICHETTE_SOCIETA: Record<string, string> = {
  ragioneSociale: 'ragione sociale', piva: 'partita IVA', rea: 'REA', indirizzo: 'indirizzo',
  telefono: 'telefono', email: 'email', pec: 'PEC', logo: 'logo',
};

/** La societa' che firma i documenti. Il logo lo tiene chi salva: il pannello non lo cambia */
export function controllaSocieta(v: unknown): Esito<SocietaFornitrice> {
  const o = oggetto(v);
  if (!o) return no(`Società fornitrice: dati non leggibili. ${NON_SALVATO}`);
  if (typeof o.ragioneSociale !== 'string' || !o.ragioneSociale.trim()) return no(`Società fornitrice, ragione sociale: manca. ${NON_SALVATO}`);
  if (typeof o.piva !== 'string' || !pivaValida(o.piva)) {
    return no(`Società fornitrice, partita IVA «${mostra(o.piva)}»: non valida, servono 11 cifre con la cifra di controllo giusta. ${NON_SALVATO}`);
  }
  for (const k of ['rea', 'indirizzo', 'telefono', 'email', 'pec']) {
    if (typeof o[k] !== 'string') return no(`Società fornitrice, ${ETICHETTE_SOCIETA[k]} «${mostra(o[k])}»: non è un testo. ${NON_SALVATO}`);
  }
  const letta = leggiSocieta(o);
  if (!letta) return no(`Società fornitrice, logo: non si legge. ${NON_SALVATO}`);
  const diversa = differenza(o, letta, ETICHETTE_SOCIETA);
  if (diversa) return no(`Società fornitrice, ${diversa}. ${NON_SALVATO}`);
  return { ok: true, valore: letta };
}

// --- categorie --------------------------------------------------------------------

const ETICHETTE_CATEGORIA: Record<string, string> = {
  nome: 'nome', settoriTipici: 'settori tipici', postazione: 'flag postazione', ledwall: 'flag LEDwall',
};

export function controllaCategorie(v: unknown): Esito<Categoria[]> {
  if (!Array.isArray(v)) return no(`Le categorie devono essere un elenco. ${NON_SALVATO}`);
  if (v.length === 0) return no(`Serve almeno una categoria. ${NON_SALVATO}`);
  const lette: Categoria[] = [];
  for (const [i, x] of v.entries()) {
    const o = oggetto(x);
    const nome = (o && typeof o.nome === 'string' && o.nome.trim()) || `Categoria n. ${i + 1}`;
    if (!o) return no(`${nome}: non si legge. ${NON_SALVATO}`);
    const letta = leggiCategorie([o])?.[0] ?? null;
    if (!letta) {
      const motivo = typeof o.nome !== 'string' || !o.nome.trim() ? 'nome: manca'
        : !Array.isArray(o.settoriTipici) || o.settoriTipici.some((p) => typeof p !== 'string' || !/\d/.test(p))
          ? `settori tipici «${mostra(o.settoriTipici)}»: non si leggono, servono prefissi ATECO a cifre`
          : typeof o.postazione !== 'boolean' ? 'flag postazione: non si legge' : 'flag LEDwall: non si legge';
      return no(`${nome}, ${motivo}. ${NON_SALVATO}`);
    }
    const diversa = differenza(o, letta, ETICHETTE_CATEGORIA);
    if (diversa) return no(`${nome}, ${diversa}. ${NON_SALVATO}`);
    if (lette.some((c) => c.nome === letta.nome)) return no(`La categoria ${nome} compare due volte. ${NON_SALVATO}`);
    lette.push(letta);
  }
  return { ok: true, valore: lette };
}

/**
 * Le categorie usate da voci accese del catalogo che nel nuovo elenco non ci sono piu'.
 * Una voce con una categoria sconosciuta ferma la distinta (distinta.ts): prima si
 * cambiano le voci, poi si toglie la categoria.
 */
export function categorieOrfane(
  categorie: Pick<Categoria, 'nome'>[],
  catalogo: { attivo: boolean; attributi: Record<string, unknown> }[],
): string[] {
  const nomi = new Set(categorie.map((c) => c.nome));
  const orfane = catalogo
    .filter((v) => v.attivo && typeof v.attributi.categoria === 'string' && !nomi.has(v.attributi.categoria))
    .map((v) => v.attributi.categoria as string);
  return [...new Set(orfane)];
}

// --- checklist --------------------------------------------------------------------

const ETICHETTE_VOCE: Record<string, string> = {
  nome: 'nome', obbligatoria: 'obbligatoria', sopraImporto: 'importo minimo', forme: 'forme',
};

const leggiUnaVoce = (x: unknown) => leggiChecklist({ voci: [x], formati: ['pdf'] })?.voci[0] ?? null;

export function controllaChecklist(v: unknown): Esito<ChecklistConfig> {
  const o = oggetto(v);
  if (!o || !Array.isArray(o.voci) || !Array.isArray(o.formati)) return no(`Checklist non leggibile. ${NON_SALVATO}`);
  const altre = Object.keys(o).filter((k) => k !== 'voci' && k !== 'formati' && o[k] !== undefined && o[k] !== null);
  if (altre.length) return no(`Checklist: campo «${altre[0]}» non previsto, non si salverebbe. ${NON_SALVATO}`);
  if (o.voci.length === 0) return no(`Serve almeno una voce nella checklist. ${NON_SALVATO}`);
  if (o.formati.length === 0) return no(`Serve almeno un formato ammesso. ${NON_SALVATO}`);

  const voci: VoceChecklist[] = [];
  for (const [i, x] of o.voci.entries()) {
    const voce = oggetto(x);
    const nome = (voce && typeof voce.nome === 'string' && voce.nome.trim()) || `voce n. ${i + 1}`;
    if (!voce) return no(`Checklist, ${nome}: non si legge. ${NON_SALVATO}`);
    const letta = leggiUnaVoce(voce);
    if (!letta) {
      const motivo = typeof voce.nome !== 'string' || !voce.nome.trim() ? 'nome: manca'
        : typeof voce.obbligatoria !== 'boolean' ? 'obbligatoria sì/no: non si legge'
          : voce.forme !== undefined && voce.forme !== null && !leggiUnaVoce({ ...voce, sopraImporto: undefined })
            ? `forme «${mostra(voce.forme)}»: non si leggono (capitali, persone, individuale)`
            : `importo minimo «${mostra(voce.sopraImporto)}»: non si legge`;
      return no(`Checklist, ${nome}, ${motivo}. ${NON_SALVATO}`);
    }
    const diversa = differenza(voce, letta, ETICHETTE_VOCE);
    if (diversa) return no(`Checklist, ${nome}, ${diversa}. ${NON_SALVATO}`);
    if (voci.some((x) => x.nome === letta.nome)) return no(`Checklist: la voce ${nome} compare due volte. ${NON_SALVATO}`);
    voci.push(letta);
  }

  const formati: ('pdf' | 'jpg')[] = [];
  for (const f of o.formati) {
    if (f !== 'pdf' && f !== 'jpg') return no(`Checklist: formato «${mostra(f)}» non ammesso (pdf, jpg). ${NON_SALVATO}`);
    if (formati.includes(f)) return no(`Checklist: formato «${f}» ripetuto. ${NON_SALVATO}`);
    formati.push(f);
  }
  // Ultima prova: il lettore intero deve dare esattamente lo stesso risultato
  const letta = leggiChecklist({ voci, formati });
  if (!letta || !uguali(letta, { voci, formati })) return no(`Checklist non leggibile. ${NON_SALVATO}`);
  return { ok: true, valore: letta };
}

// --- configurazione dei mezzi -----------------------------------------------------
//
// Il lettore (config-mezzi.ts) da' null a tutta la configurazione appena un venditore
// non si legge, e non dice quale: su un JSON di cento righe un "non si legge" non serve
// a niente. Qui ogni campo si controlla a mano e il messaggio dice dove sta lo sbaglio
// (quale venditore, quale partner, quale spread). Solo dopo la configurazione si
// rilegge con il lettore vero e si confronta, come per i canali: un campo che il lettore
// non conosce o cambierebbe non sparisce in silenzio.

const ETICHETTE_MEZZI: Record<string, string> = {
  venditori: 'venditori', categorie: 'categorie', leasing: 'leasing', mostraNomiPartner: 'nomi dei partner a schermo',
};
const ETICHETTE_VENDITORE: Record<string, string> = {
  codice: 'codice', ragioneSociale: 'ragione sociale', piva: 'partita IVA', indirizzo: 'indirizzo',
  telefono: 'telefono', email: 'email', pec: 'PEC', categorie: 'categorie',
};
const ETICHETTE_CATEGORIA_MEZZO: Record<string, string> = { nome: 'nome', targato: 'domanda sul targato' };
const ETICHETTE_LEASING: Record<string, string> = { anticipoPerc: 'anticipo', partner: 'partner' };
const ETICHETTE_PARTNER: Record<string, string> = {
  partner: 'partner', spreadFinoA48: 'spread fino a 48 mesi', spreadDa60: 'spread da 60 mesi',
  soloUsato: 'solo sui mezzi usati',
};

// Stessa regola del lettore: se cambia la' deve cambiare qui, e un test lo fa notare
const CODICE_VENDITORE = /^[a-z0-9-]{2,30}$/;
const PARTNER_CONFRONTO: readonly PartnerConfronto[] = ['sella', 'credem', 'alba', 'aleasing'];
const NOMI_PARTNER: Record<string, string> = { aleasing: 'A-Leasing' };
const nomePartner = (p: string) => NOMI_PARTNER[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

/** 3.1 -> "3,10": lo spread come si scrive nei listini */
function spreadATesto(n: number): string {
  const [intero, decimali = ''] = String(Math.round(n * 1000) / 1000).split('.');
  return `${intero},${decimali.padEnd(2, '0')}`;
}

/** Il primo campo con un valore che l'oggetto non prevede: stesse parole di differenza() */
function campoNonPrevisto(o: Record<string, unknown>, etichette: Record<string, string>): string | null {
  const k = Object.keys(o).find((c) => !(c in etichette) && o[c] !== undefined && o[c] !== null);
  return k === undefined ? null : `campo «${k}» non previsto: non si salverebbe`;
}

/** Il codice di un venditore com'e' scritto, ripulito dagli spazi; null se manca */
const codiceDi = (x: unknown): string | null => {
  const c = oggetto(x)?.codice;
  return typeof c === 'string' && c.trim() ? c.trim() : null;
};

/** Il primo sbaglio nei venditori, a parole. Null = nessuno. I messaggi non portano il suffisso */
function sbagliVenditori(v: unknown): string | null {
  if (!Array.isArray(v)) return 'I venditori devono essere un elenco';
  if (v.length === 0) return 'Serve almeno un venditore';
  const codici = new Set<string>();
  for (const [i, x] of v.entries()) {
    const o = oggetto(x);
    const nome = codiceDi(x) ? `Venditore ${codiceDi(x)}` : `Venditore n. ${i + 1}`;
    if (!o) return `${nome}: non si legge`;
    if (o.codice === undefined || o.codice === null) return `${nome}, codice: manca`;
    if (typeof o.codice !== 'string' || !CODICE_VENDITORE.test(o.codice)) {
      return `${nome}, codice «${mostra(o.codice)}»: servono da 2 a 30 caratteri fra minuscole, cifre e trattino`;
    }
    if (codici.has(o.codice)) return `Il venditore ${o.codice} compare due volte`;
    codici.add(o.codice);
    if (typeof o.ragioneSociale !== 'string' || !o.ragioneSociale.trim()) return `${nome}, ragione sociale: manca`;
    if (typeof o.piva !== 'string' || !pivaValida(o.piva.trim())) {
      return `${nome}, partita IVA «${mostra(o.piva)}»: non valida, servono 11 cifre con la cifra di controllo giusta`;
    }
    for (const k of ['indirizzo', 'telefono', 'email', 'pec']) {
      if (o[k] === undefined) return `${nome}, ${ETICHETTE_VENDITORE[k]}: manca (se non c'è, scrivi "")`;
      if (typeof o[k] !== 'string') return `${nome}, ${ETICHETTE_VENDITORE[k]} «${mostra(o[k])}»: non è un testo`;
    }
    if (!Array.isArray(o.categorie) || o.categorie.some((c) => typeof c !== 'string' || !c.trim())) {
      return `${nome}, categorie «${mostra(o.categorie)}»: serve un elenco di nomi, vuoto per il venditore di tutto il resto`;
    }
  }
  return null;
}

/** Il primo sbaglio nelle categorie con la domanda sul targato */
function sbagliCategorieMezzi(v: unknown): string | null {
  if (!Array.isArray(v)) return 'Le categorie devono essere un elenco';
  if (v.length === 0) return 'Serve almeno una categoria';
  const nomi = new Set<string>();
  for (const [i, x] of v.entries()) {
    const o = oggetto(x);
    const nome = typeof o?.nome === 'string' && o.nome.trim() ? o.nome.trim() : null;
    const dove = nome ? `Categoria ${nome}` : `Categoria n. ${i + 1}`;
    if (!o) return `${dove}: non si legge`;
    if (!nome) return `${dove}, nome: manca`;
    const t = o.targato;
    if (t !== undefined && t !== null && typeof t !== 'boolean') {
      return `${dove}, targato «${mostra(t)}»: serve true, false oppure null (null: la domanda si fa sempre)`;
    }
    if (nomi.has(nome)) return `La categoria ${nome} compare due volte`;
    nomi.add(nome);
  }
  return null;
}

/** Venditori e categorie gia' letti bene: ora devono stare insieme */
function sbagliCoerenza(venditori: Record<string, unknown>[], categorie: Record<string, unknown>[]): string | null {
  const note = new Set(categorie.map((c) => String(c.nome).trim()));
  const codice = (x: Record<string, unknown>) => String(x.codice).trim();
  const elenco = (x: Record<string, unknown>) => (x.categorie as string[]).map((c) => c.trim());
  const predefiniti = venditori.filter((x) => elenco(x).length === 0);
  if (predefiniti.length === 0) {
    return 'Manca il venditore di tutto il resto: uno dei venditori deve avere l\'elenco delle categorie vuoto ("categorie": [])';
  }
  if (predefiniti.length > 1) {
    return `I venditori senza categorie sono più di uno (${predefiniti.map(codice).join(', ')}): il venditore di tutto il resto deve essere uno solo`;
  }
  const assegnate = new Map<string, string>();
  for (const x of venditori) {
    for (const c of elenco(x)) {
      if (!note.has(c)) return `Venditore ${codice(x)}, categoria «${c}»: non è fra le categorie`;
      const gia = assegnate.get(c);
      if (gia) return `La categoria «${c}» è assegnata a due venditori (${gia} e ${codice(x)})`;
      assegnate.set(c, codice(x));
    }
  }
  return null;
}

/** Il primo sbaglio nel leasing: anticipo, partner e spread (che devono esistere nei listini) */
function sbagliLeasingMezzi(v: unknown): string | null {
  const o = oggetto(v);
  if (!o) return 'Leasing: dati non leggibili';
  const a = o.anticipoPerc;
  if (typeof a !== 'number' || !Number.isFinite(a) || a < 0 || a > ANTICIPO_MAX_MEZZI) {
    return `Leasing, anticipo «${mostra(a)}»: serve un numero fra 0 e ${ANTICIPO_MAX_MEZZI} (percentuale dei beni)`;
  }
  if (!Array.isArray(o.partner)) return 'Leasing, partner: serve un elenco (vuoto: nessun confronto con il leasing)';
  const visti = new Set<string>();
  for (const [i, x] of o.partner.entries()) {
    const p = oggetto(x);
    if (!p) return `Leasing, partner n. ${i + 1}: non si legge`;
    const id = PARTNER_CONFRONTO.find((c) => c === p.partner);
    if (!id) return `Leasing, partner n. ${i + 1} «${mostra(p.partner)}»: sono ammessi ${PARTNER_CONFRONTO.map(nomePartner).join(', ')}`;
    const nome = nomePartner(id);
    if (visti.has(id)) return `Leasing, ${nome} compare due volte`;
    visti.add(id);
    const solo = p.soloUsato;
    if (solo !== undefined && solo !== null && typeof solo !== 'boolean') {
      return `Leasing, ${nome}, solo sui mezzi usati «${mostra(solo)}»: serve true o false (true: compare solo se un bene è usato)`;
    }
    // Le condizioni di A-Leasing vengono da preventivi sull'usato: sul nuovo non si propone
    if (id === 'aleasing' && solo !== true) {
      return `Leasing, ${nome}: va solo sui mezzi usati, serve "soloUsato": true (le sue condizioni vengono da due preventivi sull'usato)`;
    }
    const listino = PARTNERS_LEASING_MOTORE.find((l) => l.key === id)!;
    // Una durata per lato del cambio di listino di Alba (48 mesi e 60 mesi)
    for (const [campo, durata, quando] of [['spreadFinoA48', 36, 'fino a 48 mesi'], ['spreadDa60', 60, 'da 60 mesi']] as const) {
      const s = p[campo];
      if (s === undefined || s === null) return `Leasing, ${nome}, spread ${quando}: manca`;
      if (typeof s !== 'number' || !Number.isFinite(s)) return `Leasing, ${nome}, spread ${quando} «${mostra(s)}»: serve un numero`;
      if (!condizioneDaSpread(listino, durata, s)) {
        const presenti = [...new Set(getCondizioniPerDurata(listino, durata).map((c) => c.spread))].map(spreadATesto).join('; ');
        return `Leasing, ${nome}, spread ${quando} «${spreadATesto(s)}»: il listino non lo prevede (ci sono ${presenti})`;
      }
    }
  }
  return null;
}

/**
 * La configurazione del settore mezzi come l'ha mandata il pannello: venditori, categorie
 * col targato, leasing e nomi dei partner. Si salva com'e' o non si salva.
 */
export function controllaMezzi(v: unknown): Esito<ConfigMezzi> {
  const o = oggetto(v);
  if (!o) {
    return no(`Configurazione dei mezzi: dati non leggibili, serve un oggetto con venditori, categorie, leasing e nomi dei partner. ${NON_SALVATO}`);
  }
  const sbaglio = sbagliVenditori(o.venditori) ?? sbagliCategorieMezzi(o.categorie)
    ?? sbagliCoerenza(o.venditori as Record<string, unknown>[], o.categorie as Record<string, unknown>[])
    ?? sbagliLeasingMezzi(o.leasing)
    ?? (o.mostraNomiPartner === undefined || o.mostraNomiPartner === null
      ? 'Nomi dei partner a schermo: manca (true o false)'
      : typeof o.mostraNomiPartner !== 'boolean'
        ? `Nomi dei partner a schermo «${mostra(o.mostraNomiPartner)}»: serve true o false`
        : null);
  if (sbaglio) return no(`${sbaglio}. ${NON_SALVATO}`);

  // Ultima prova: il lettore vero, poi il confronto livello per livello
  const letta = leggiConfigMezzi(o);
  const venditori = o.venditori as Record<string, unknown>[];
  const categorie = o.categorie as Record<string, unknown>[];
  const leasing = o.leasing as Record<string, unknown>;
  const partner = leasing.partner as Record<string, unknown>[];
  if (!letta || letta.venditori.length !== venditori.length || letta.categorie.length !== categorie.length
    || letta.leasing.partner.length !== partner.length) {
    return no(`Configurazione dei mezzi: non si legge. ${NON_SALVATO}`);
  }
  for (const [i, x] of venditori.entries()) {
    const diversa = differenza(x, letta.venditori[i], ETICHETTE_VENDITORE);
    if (diversa) return no(`Venditore ${codiceDi(x)}, ${diversa}. ${NON_SALVATO}`);
  }
  for (const [i, x] of categorie.entries()) {
    const diversa = differenza(x, letta.categorie[i], ETICHETTE_CATEGORIA_MEZZO);
    if (diversa) return no(`Categoria ${String(x.nome).trim()}, ${diversa}. ${NON_SALVATO}`);
  }
  const nonPrevistoLeasing = campoNonPrevisto(leasing, ETICHETTE_LEASING);
  if (nonPrevistoLeasing) return no(`Leasing, ${nonPrevistoLeasing}. ${NON_SALVATO}`);
  for (const [i, x] of partner.entries()) {
    const diversa = differenza(x, letta.leasing.partner[i], ETICHETTE_PARTNER);
    if (diversa) return no(`Leasing, ${nomePartner(String(x.partner))}, ${diversa}. ${NON_SALVATO}`);
  }
  const nonPrevisto = campoNonPrevisto(o, ETICHETTE_MEZZI);
  if (nonPrevisto) return no(`Configurazione dei mezzi, ${nonPrevisto}. ${NON_SALVATO}`);
  return { ok: true, valore: letta };
}

// --- clienti segnalati ------------------------------------------------------------

export interface Segnalazione {
  piva: string;
  ragioneSociale: string | null;
  motivo: (typeof MOTIVI_SEGNALAZIONE)[number];
  effetto: (typeof EFFETTI_SEGNALAZIONE)[number];
  nota: string | null;
}

const testoONull = (v: unknown, max: number) => {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '';
  return t || null;
};

const PIVA_NON_VALIDA = 'Partita IVA non valida: servono 11 cifre con la cifra di controllo giusta.';

export function controllaSegnalazione(v: unknown): Esito<Segnalazione> {
  const o = oggetto(v) ?? {};
  const piva = pulisciPiva(String(o.piva ?? ''));
  if (!pivaValida(piva)) return no(PIVA_NON_VALIDA);
  const motivo = MOTIVI_SEGNALAZIONE.find((m) => m === o.motivo);
  if (!motivo) return no('Motivo non ammesso: insoluto, sofferenze o altro.');
  const effetto = EFFETTI_SEGNALAZIONE.find((x) => x === o.effetto);
  if (!effetto) return no('Effetto non ammesso: blocco o rosso.');
  return {
    ok: true,
    valore: { piva, ragioneSociale: testoONull(o.ragioneSociale, 200), motivo, effetto, nota: testoONull(o.nota, 1000) },
  };
}

// --- pratiche esterne -------------------------------------------------------------

export interface PraticaEsternaNuova {
  piva: string;
  ragioneSociale: string | null;
  canale: CanaleEsterno | null;
  /** AAAA-MM-GG */
  data: string;
  esito: string | null;
  importo: number | null;
}

/** Il giorno di oggi in Italia, AAAA-MM-GG */
const giornoItaliano = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);

const vuoto = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function controllaPraticaEsterna(v: unknown, oggi: Date = new Date()): Esito<PraticaEsternaNuova> {
  const o = oggetto(v) ?? {};
  const piva = pulisciPiva(String(o.piva ?? ''));
  if (!pivaValida(piva)) return no(PIVA_NON_VALIDA);
  const data = dataValidita(o.data);
  if (!data) return no('Data non valida: scrivila come GG/MM/AAAA.');
  if (data > giornoItaliano(oggi)) return no('La data non può essere futura.');
  let canale: PraticaEsternaNuova['canale'] = null;
  if (!vuoto(o.canale)) {
    canale = CANALI_ESTERNI.find((c) => c === o.canale) ?? null;
    if (!canale) return no(`Canale non ammesso: ${CANALI_ESTERNI.map((c) => NOMI_CANALE[c]).join(', ')}, oppure nessuno.`);
  }
  let importo: number | null = null;
  if (!vuoto(o.importo)) {
    const n = numero(o.importo);
    if (!(n > 0 && n <= 100_000_000)) return no("Importo non valido: un numero maggiore di zero, o vuoto se non c'è.");
    importo = Math.round(n * 100) / 100;
  }
  return {
    ok: true,
    valore: { piva, ragioneSociale: testoONull(o.ragioneSociale, 200), canale, data, esito: testoONull(o.esito, 200), importo },
  };
}
