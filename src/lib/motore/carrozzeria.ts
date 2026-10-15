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

export type Settore = 'fotovoltaico' | 'generico' | 'macchine';
/** Regole del semaforo: credit policy del tool Marotta, oppure criteri del locatore (Duplex) */
export type RegoleSemaforo = 'credit-policy' | 'locatore';
const SETTORI: Settore[] = ['fotovoltaico', 'generico', 'macchine'];

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
}

const SELECT = `
  SELECT f.slug, f.nome, f.citta, f.prefisso, f.organization_id, f.tabella_canoni,
         f.brand_logo, f.brand_colore, f.brand_accento, f.attivo,
         c.settore, c.etichetta_bene, c.partner_leasing, c.soglia_leasing,
         c.tetto_mese_euro, c.demo, c.documenti_extra, c.tabella_alternativa, c.regole_semaforo, c.leasing
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
    regoleSemaforo: r.regole_semaforo === 'locatore' ? 'locatore' : 'credit-policy',
    leasing: r.leasing !== false,
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
