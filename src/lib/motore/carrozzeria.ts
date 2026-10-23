// La carrozzeria di un fornitore sul motore dei portali: chi e', come si
// presenta, cosa vende e su quali canali si quota.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database.
//
// Il fornitore vive in app.fornitore (organizzazione, prefisso, listino del
// noleggio, marchio), la configurazione del motore in app.carrozzeria, il
// catalogo in app.catalogo_voce. Un fornitore senza riga in app.carrozzeria
// non e' sul motore: e' il caso di Green-Go, che ha il suo portale.

import { query, queryUna } from '../db';
import { PARTNERS_LEASING, type PartnerLeasing } from '../../data/leasing';
import {
  leggiCanali,
  leggiCategorie,
  leggiChecklist,
  leggiSocieta,
  type CanaleConfig,
  type Categoria,
  type ChecklistConfig,
  type SocietaFornitrice,
} from './config-distinta';
import { leggiConfigMezzi, type ConfigMezzi, type MezziBrowser } from './config-mezzi';

/**
 * 'distinta': il commerciale compone una distinta di beni dal catalogo (Led Office).
 * 'mezzi': macchine e mezzi d'opera con piu' venditori, noleggio e confronto leasing (Bergamelli)
 */
export type Settore = 'fotovoltaico' | 'generico' | 'macchine' | 'distinta' | 'mezzi';
/**
 * Regole del semaforo: credit policy del tool Marotta, criteri del locatore (Duplex)
 * oppure prefiltro (Led Office: quattro esiti, mai un numero cambiato)
 */
export type RegoleSemaforo = 'credit-policy' | 'locatore' | 'prefiltro';
const SETTORI: Settore[] = ['fotovoltaico', 'generico', 'macchine', 'distinta', 'mezzi'];

export interface Carrozzeria {
  slug: string;
  nome: string;
  citta: string | null;
  prefisso: string;
  organizationId: string;
  /** Listino del noleggio operativo (src/lib/tabelle-canoni.ts) */
  tabellaCanoni: string;
  brand: { logo: string | null; colore: string | null; accento: string | null };
  settore: Settore;
  etichettaBene: string;
  partnerLeasing: PartnerLeasing['key'];
  /** Sotto questo imponibile il leasing non si propone. 0 = sempre. */
  sogliaLeasing: number;
  tettoMeseEuro: number;
  demo: boolean;
  documentiExtra: string[];
  attivo: boolean;
  /** Listino del noleggio affiancato al principale (la Grace Period di Duplex). Null = nessuno */
  tabellaAlternativa: string | null;
  regoleSemaforo: RegoleSemaforo;
  /** false = solo noleggio operativo */
  leasing: boolean;
  /** Euro per richiesta di verifica addebitati al fornitore. Solo admin MCF. Null = non si fattura */
  prezzoVerifica: number | null;
  /**
   * Canali di quotazione in ordine di priorita'. Null = listino unico di tabellaCanoni.
   * Contiene maggiorazioni e nomi di tabella: mai verso referente e agente.
   */
  canali: CanaleConfig[] | null;
  /** La societa' che firma i documenti verso il cliente. Null = il fornitore stesso */
  societaFornitrice: SocietaFornitrice | null;
  /** Checklist della pratica propria del fornitore. Null = quella di sempre */
  checklist: ChecklistConfig | null;
  /** Categorie del catalogo con settori tipici e flag. Null = nessuna */
  categorie: Categoria[] | null;
  /**
   * Settore mezzi: venditori, categorie col targato, condizioni del leasing. Null = la
   * carrozzeria non vende mezzi. Contiene P.IVA, recapiti e spread: mai verso il browser
   * cosi' com'e' (vedi carrozzeriaPerBrowser).
   */
  mezzi: ConfigMezzi | null;
}

export interface VoceCatalogo {
  id: number;
  codice: string;
  nome: string;
  descrizione: string | null;
  prezzo: number;
  /** Dipendono dal settore: kwp, kwh_accumulo, installazione sul fotovoltaico */
  attributi: Record<string, unknown>;
  ordine: number;
  attivo: boolean;
}

export interface RigaCarrozzeria {
  slug: string;
  nome: string;
  citta: string | null;
  prefisso: string;
  organization_id: string;
  tabella_canoni: string;
  brand_logo: string | null;
  brand_colore: string | null;
  brand_accento: string | null;
  attivo: boolean;
  settore: string;
  etichetta_bene: string;
  partner_leasing: string;
  soglia_leasing: string;
  tetto_mese_euro: string;
  demo: boolean;
  documenti_extra: unknown;
  tabella_alternativa: string | null;
  regole_semaforo: string;
  leasing: boolean;
  prezzo_verifica: string | null;
  // jsonb: arrivano dal database come oggetti gia' decodificati, null se la carrozzeria non li
  // usa. La SELECT li nomina, quindi lo SQL 011 va applicato PRIMA di pubblicare questo
  // codice: senza quelle colonne la query fallisce per tutti i fornitori del motore, non
  // le salta (in produzione dal 20/10/2026). Facoltativi qui solo per le righe finte dei test.
  canali?: unknown;
  societa_fornitrice?: unknown;
  checklist?: unknown;
  categorie?: unknown;
  // Come le quattro sopra, dallo SQL 013: la SELECT nomina c.mezzi, quindi lo SQL va
  // applicato PRIMA di pubblicare questo codice
  mezzi?: unknown;
}

const SELECT = `
  SELECT f.slug, f.nome, f.citta, f.prefisso, f.organization_id, f.tabella_canoni,
         f.brand_logo, f.brand_colore, f.brand_accento, f.attivo,
         c.settore, c.etichetta_bene, c.partner_leasing, c.soglia_leasing,
         c.tetto_mese_euro, c.demo, c.documenti_extra, c.tabella_alternativa, c.regole_semaforo, c.leasing,
         c.prezzo_verifica, c.canali, c.societa_fornitrice, c.checklist, c.categorie, c.mezzi
    FROM app.fornitore f
    JOIN app.carrozzeria c ON c.slug = f.slug`;

export function carrozzeriaDaRiga(r: RigaCarrozzeria): Carrozzeria {
  const partner = PARTNERS_LEASING.find((p) => p.key === r.partner_leasing)?.key ?? 'alba';
  return {
    slug: r.slug,
    nome: r.nome,
    citta: r.citta,
    prefisso: r.prefisso,
    organizationId: r.organization_id,
    tabellaCanoni: r.tabella_canoni,
    brand: { logo: r.brand_logo, colore: r.brand_colore, accento: r.brand_accento },
    settore: SETTORI.includes(r.settore as Settore) ? (r.settore as Settore) : 'generico',
    etichettaBene: r.etichetta_bene,
    partnerLeasing: partner,
    sogliaLeasing: Number(r.soglia_leasing) || 0,
    tettoMeseEuro: Number(r.tetto_mese_euro) || 0,
    demo: r.demo,
    documentiExtra: Array.isArray(r.documenti_extra) ? (r.documenti_extra as unknown[]).map(String) : [],
    attivo: r.attivo,
    tabellaAlternativa: r.tabella_alternativa || null,
    regoleSemaforo:
      r.regole_semaforo === 'locatore' ? 'locatore' : r.regole_semaforo === 'prefiltro' ? 'prefiltro' : 'credit-policy',
    leasing: r.leasing !== false,
    prezzoVerifica: r.prezzo_verifica === null || r.prezzo_verifica === undefined ? null : Number(r.prezzo_verifica),
    canali: leggiCanali(r.canali),
    societaFornitrice: leggiSocieta(r.societa_fornitrice),
    checklist: leggiChecklist(r.checklist),
    categorie: leggiCategorie(r.categorie),
    mezzi: leggiConfigMezzi(r.mezzi),
  };
}

export async function carrozzeriaDaSlug(slug: string): Promise<Carrozzeria | null> {
  const r = await queryUna<RigaCarrozzeria>(`${SELECT} WHERE f.slug = $1`, [slug]);
  return r ? carrozzeriaDaRiga(r) : null;
}

/** Tutte le carrozzerie, per il pannello MCF */
export async function elencoCarrozzerie(): Promise<Carrozzeria[]> {
  const righe = await query<RigaCarrozzeria>(`${SELECT} ORDER BY f.nome`);
  return righe.map(carrozzeriaDaRiga);
}

/**
 * La parte della carrozzeria che il browser puo' vedere: nome, marchio, settore e,
 * sul settore distinta, le categorie del catalogo coi loro due flag e la checklist
 * della pratica; sul settore mezzi i venditori (codice, ragione sociale, categorie), le
 * categorie col targato, l'anticipo e se mostrare i nomi dei partner. Restano qui il
 * listino del noleggio, il partner del leasing, i canali con le maggiorazioni, la
 * societa' fornitrice, i settori tipici delle categorie (la regola 6 la applica il
 * server) e, dei mezzi, partite IVA, recapiti e spread: sono la ratio interna di MCF.
 * Ogni campo e' copiato a mano, cosi' un campo nuovo della carrozzeria non esce
 * da solo verso il browser.
 */
export function carrozzeriaPerBrowser(c: Carrozzeria) {
  return {
    slug: c.slug,
    nome: c.nome,
    citta: c.citta,
    settore: c.settore,
    etichettaBene: c.etichettaBene,
    sogliaLeasing: c.sogliaLeasing,
    leasing: c.leasing,
    demo: c.demo,
    colore: c.brand.colore,
    accento: c.brand.accento,
    documentiExtra: c.documentiExtra,
    categorie: c.categorie?.map(({ nome, postazione, ledwall }) => ({ nome, postazione, ledwall })) ?? null,
    checklist: c.checklist
      ? {
          voci: c.checklist.voci.map((v) => ({
            nome: v.nome,
            obbligatoria: v.obbligatoria,
            ...(v.sopraImporto !== undefined ? { sopraImporto: v.sopraImporto } : {}),
            ...(v.forme ? { forme: [...v.forme] } : {}),
          })),
          formati: [...c.checklist.formati],
        }
      : null,
    mezzi: c.mezzi ? mezziPerBrowser(c.mezzi) : null,
  };
}

/** Il blocco mezzi per il browser, copiato campo per campo: niente P.IVA, recapiti, partner e spread */
function mezziPerBrowser(m: ConfigMezzi): MezziBrowser {
  return {
    venditori: m.venditori.map(({ codice, ragioneSociale, categorie }) => ({
      codice,
      ragioneSociale,
      categorie: [...categorie],
    })),
    categorie: m.categorie.map(({ nome, targato }) => ({ nome, targato })),
    anticipoPerc: m.leasing.anticipoPerc,
    mostraNomiPartner: m.mostraNomiPartner,
  };
}

/** Il partner leasing della carrozzeria, come oggetto di src/data/leasing.ts */
export function partnerLeasingDi(c: Carrozzeria): PartnerLeasing {
  return PARTNERS_LEASING.find((p) => p.key === c.partnerLeasing) ?? PARTNERS_LEASING[1];
}

interface RigaVoce {
  id: string;
  codice: string;
  nome: string;
  descrizione: string | null;
  prezzo: string;
  attributi: Record<string, unknown> | null;
  ordine: number;
  attivo: boolean;
}

const voce = (r: RigaVoce): VoceCatalogo => ({
  id: Number(r.id),
  codice: r.codice,
  nome: r.nome,
  descrizione: r.descrizione,
  prezzo: Number(r.prezzo),
  attributi: r.attributi ?? {},
  ordine: r.ordine,
  attivo: r.attivo,
});

export async function catalogo(slug: string, soloAttive = true): Promise<VoceCatalogo[]> {
  const righe = await query<RigaVoce>(
    `SELECT id, codice, nome, descrizione, prezzo, attributi, ordine, attivo
       FROM app.catalogo_voce
      WHERE fornitore_slug = $1 ${soloAttive ? 'AND attivo = true' : ''}
      ORDER BY ordine, nome`,
    [slug],
  );
  return righe.map(voce);
}

export async function voceCatalogo(slug: string, codice: string): Promise<VoceCatalogo | null> {
  const r = await queryUna<RigaVoce>(
    `SELECT id, codice, nome, descrizione, prezzo, attributi, ordine, attivo
       FROM app.catalogo_voce WHERE fornitore_slug = $1 AND codice = $2`,
    [slug, codice],
  );
  return r ? voce(r) : null;
}

/** Il prodotto di una pratica: col leasing spento sulla carrozzeria si carica solo noleggio */
export function prodottoAmmesso(k: Carrozzeria, richiesto: unknown): 'noleggio' | 'leasing' {
  return richiesto === 'leasing' && k.leasing ? 'leasing' : 'noleggio';
}

/** Cosa porta via l'agente, per la pagina di accesso: il leasing solo se la carrozzeria lo propone */
export function proposteOfferte(k: Pick<Carrozzeria, 'leasing'>): string {
  return k.leasing ? 'proposte di noleggio operativo e di leasing' : 'proposte di noleggio operativo';
}
