// Configurazione di una carrozzeria sul settore "mezzi" (Bergamelli): i venditori
// che firmano le offerte, le categorie con la domanda sul targato e le condizioni
// del leasing che MCF applica ai partner di confronto.
//
// Modulo senza database e senza rete. Legge pero' gli spread di src/data/leasing.ts
// per controllare che le condizioni scritte esistano davvero nei listini: dal
// browser si importano SOLO i tipi (import type), mai le funzioni, altrimenti gli
// spread finiscono nel bundle. I valori stanno in app.carrozzeria.mezzi come jsonb
// scritto dal Pannello MCF o dal seed, con le chiavi in camelCase come nei tipi.
//
// Regola di lettura, quella di config-distinta.ts: un valore che non si legge non si
// indovina. Un partner del leasing o una categoria scritti male escono dall'elenco.
// Un venditore illeggibile (codice sbagliato o doppio, P.IVA che non torna, campo
// mancante) NON si scarta: fa cadere l'intera configurazione, perche' il venditore
// decide la societa' che firma le offerte al cliente e, scartandolo, le sue categorie
// passerebbero in silenzio al venditore di default. Lo stesso per un contenitore che
// non regge (nessun venditore di default, una categoria assegnata due volte, un
// anticipo fuori scala): null e la carrozzeria non parte.

import {
  getCondizioniPerDurata,
  PARTNERS_LEASING_MOTORE,
  type CondizioneLeasing,
  type PartnerLeasing,
} from '../../data/leasing';
import { pivaValida } from '../piva';
import { elencoTesti, nonNull, oggetto, testo } from './config-distinta';

/** Chi firma l'offerta di una categoria di beni. `categorie` vuoto = venditore di tutto il resto */
export interface Venditore {
  codice: string;
  ragioneSociale: string;
  piva: string;
  indirizzo: string;
  telefono: string;
  email: string;
  pec: string;
  categorie: string[];
}

/** `targato` null = la domanda "il mezzo e' targato?" va sempre fatta */
export interface CategoriaMezzo {
  nome: string;
  targato: boolean | null;
}

export type PartnerConfronto = 'sella' | 'credem' | 'alba' | 'aleasing';

/**
 * Gli spread applicati a un partner: uno fino a 48 mesi, uno da 60 in su (Alba cambia
 * listino). `soloUsato` vero = il partner compare solo se almeno un bene e' usato
 * (A-Leasing); falso o assente = sempre.
 */
export interface LeasingPartnerConfig {
  partner: PartnerConfronto;
  spreadFinoA48: number;
  spreadDa60: number;
  soloUsato?: boolean;
}

export interface ConfigMezzi {
  venditori: Venditore[];
  categorie: CategoriaMezzo[];
  leasing: { anticipoPerc: number; partner: LeasingPartnerConfig[] };
  /** A schermo, mai nei PDF: false = nessun nome di partner verso il browser */
  mostraNomiPartner: boolean;
}

/** La parte della configurazione che il browser puo' vedere: niente P.IVA, recapiti, spread */
export interface MezziBrowser {
  venditori: { codice: string; ragioneSociale: string; categorie: string[] }[];
  categorie: CategoriaMezzo[];
  anticipoPerc: number;
  mostraNomiPartner: boolean;
}

/** Oltre il 30% di anticipo e' quasi certamente un errore di battitura (o "1.000" letto male) */
export const ANTICIPO_MAX_MEZZI = 30;

const CODICE_VENDITORE = /^[a-z0-9-]{2,30}$/;
const PARTNER: readonly PartnerConfronto[] = ['sella', 'credem', 'alba', 'aleasing'];
const TOLLERANZA_SPREAD = 0.001;

// Le due durate con cui si controlla uno spread: una per lato del cambio di listino di Alba
const DURATA_FINO_A_48 = 36;
const DURATA_DA_60 = 60;

/**
 * La condizione del listino del partner, per quella durata, con quello spread.
 * Null se il listino non la prevede: lo spread di un partner non si inventa.
 */
export function condizioneDaSpread(partner: PartnerLeasing, durata: number, spread: number): CondizioneLeasing | null {
  return getCondizioniPerDurata(partner, durata).find((c) => Math.abs(c.spread - spread) < TOLLERANZA_SPREAD) ?? null;
}

/** Tiene la prima occorrenza di ogni chiave e scarta le successive */
function senzaDoppi<T>(elementi: T[], chiave: (e: T) => string): T[] {
  const viste = new Set<string>();
  return elementi.filter((e) => {
    const k = chiave(e);
    if (viste.has(k)) return false;
    viste.add(k);
    return true;
  });
}

// --- venditori --------------------------------------------------------------

function leggiVenditore(x: unknown): Venditore | null {
  const o = oggetto(x);
  if (!o) return null;
  const ragioneSociale = testo(o.ragioneSociale);
  const piva = testo(o.piva);
  const categorie = elencoTesti(o.categorie);
  // Il codice e' un identificativo: si controlla com'e' scritto, senza ripulirlo
  const codice = typeof o.codice === 'string' && CODICE_VENDITORE.test(o.codice) ? o.codice : null;
  // Indirizzo e recapiti possono essere vuoti ma non di un altro tipo
  const recapiti = [o.indirizzo, o.telefono, o.email, o.pec];
  if (!codice || !ragioneSociale || !piva || !pivaValida(piva) || !categorie) return null;
  if (!recapiti.every((r) => typeof r === 'string')) return null;
  const [indirizzo, telefono, email, pec] = (recapiti as string[]).map((r) => r.trim());
  return { codice, ragioneSociale, piva, indirizzo, telefono, email, pec, categorie };
}

// --- categorie --------------------------------------------------------------

function leggiCategoria(x: unknown): CategoriaMezzo | null {
  const o = oggetto(x);
  if (!o) return null;
  const nome = testo(o.nome);
  const t = o.targato;
  // Assente o null = la domanda si fa sempre; presente e non booleano non si legge
  if (!nome || (t !== undefined && t !== null && typeof t !== 'boolean')) return null;
  return { nome, targato: t ?? null };
}

// --- leasing ----------------------------------------------------------------

function leggiPartner(x: unknown): LeasingPartnerConfig | null {
  const o = oggetto(x);
  if (!o) return null;
  const partner = PARTNER.find((p) => p === o.partner);
  const listino = PARTNERS_LEASING_MOTORE.find((p) => p.key === partner);
  const { spreadFinoA48, spreadDa60, soloUsato } = o;
  if (!partner || !listino || typeof spreadFinoA48 !== 'number' || typeof spreadDa60 !== 'number') return null;
  // Lo spread deve esistere fra le condizioni del listino di quella durata
  if (!condizioneDaSpread(listino, DURATA_FINO_A_48, spreadFinoA48)) return null;
  if (!condizioneDaSpread(listino, DURATA_DA_60, spreadDa60)) return null;
  // Assente o null = sempre, e non si scrive; un booleano resta com'e'; il resto non si legge
  if (soloUsato !== undefined && soloUsato !== null && typeof soloUsato !== 'boolean') return null;
  return { partner, spreadFinoA48, spreadDa60, ...(typeof soloUsato === 'boolean' ? { soloUsato } : {}) };
}

function leggiLeasing(v: unknown): ConfigMezzi['leasing'] | null {
  const o = oggetto(v);
  if (!o || !Array.isArray(o.partner)) return null;
  const a = o.anticipoPerc;
  if (typeof a !== 'number' || !Number.isFinite(a) || a < 0 || a > ANTICIPO_MAX_MEZZI) return null;
  const partner = senzaDoppi(o.partner.map(leggiPartner).filter(nonNull), (p) => p.partner);
  return { anticipoPerc: a, partner };
}

// --- configurazione ---------------------------------------------------------

export function leggiConfigMezzi(v: unknown): ConfigMezzi | null {
  const o = oggetto(v);
  if (!o || !Array.isArray(o.venditori) || !Array.isArray(o.categorie)) return null;
  if (typeof o.mostraNomiPartner !== 'boolean') return null;
  const leasing = leggiLeasing(o.leasing);
  if (!leasing) return null;

  // Nessun venditore si scarta: uno illeggibile o con il codice di un altro da' null
  const venditori = o.venditori.map(leggiVenditore);
  if (!venditori.every(nonNull)) return null;
  if (new Set(venditori.map((x) => x.codice)).size !== venditori.length) return null;
  const categorie = senzaDoppi(o.categorie.map(leggiCategoria).filter(nonNull), (c) => c.nome);

  // Il venditore di tutto il resto deve esistere ed essere uno: ogni bene ha un solo firmatario
  if (venditori.filter((x) => x.categorie.length === 0).length !== 1) return null;

  // Una categoria sta al piu' da un venditore, e solo se e' una categoria che esiste
  const note = new Set(categorie.map((c) => c.nome));
  const assegnate = new Set<string>();
  for (const venditore of venditori) {
    for (const c of venditore.categorie) {
      if (!note.has(c) || assegnate.has(c)) return null;
      assegnate.add(c);
    }
  }
  return { venditori, categorie, leasing, mostraNomiPartner: o.mostraNomiPartner };
}

/** Il venditore che firma i beni di quella categoria: quello che la elenca, altrimenti il default */
export function venditoreDiCategoria(c: ConfigMezzi, categoria: string): Venditore | null {
  return (
    c.venditori.find((v) => v.categorie.includes(categoria)) ??
    c.venditori.find((v) => v.categorie.length === 0) ??
    null
  );
}
