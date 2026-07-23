// Registro dei portali partner (aree riservate /tools/<slug> con caricamento pratiche).
//
// ATTENZIONE: questo file e' per uso SERVER-SIDE (API routes). Non importarlo da
// codice che gira nel browser: conterrebbe le password di TUTTI i partner nel bundle
// di una singola pagina. Ogni pagina .astro tiene la propria password nel suo script.
//
// Per aggiungere un partner: una voce qui + pagina /tools/<slug>.astro + endpoint
// /api/submit-<slug>.ts, e lo slug nella lista noindex della sitemap.

export interface PortalePartner {
  /** Slug del portale: usato nell'URL, nel prefisso dei blob e come id pratica */
  slug: string;
  /** Ragione sociale mostrata nelle mail e nella stampa */
  nome: string;
  /** Password del gate partner, usata anche come bearer per le API */
  password: string;
  /** Prefisso della pratica: EE- per Expo Energia, ST- per Stilo */
  prefissoPratica: string;
}

export const PORTALI_PARTNER: Record<string, PortalePartner> = {
  'expo-energia': {
    slug: 'expo-energia',
    nome: 'Expo Energia Srl',
    password: 'expoenergia',
    prefissoPratica: 'EE',
  },
  stilo: {
    slug: 'stilo',
    nome: 'STILO S.R.L.',
    password: 'stilosrl',
    prefissoPratica: 'ST',
  },
};

/** Partner di default: le chiamate senza parametro restano compatibili con Expo Energia */
export const PARTNER_DEFAULT = 'expo-energia';

export function getPartner(slug: string | null | undefined): PortalePartner | null {
  return PORTALI_PARTNER[slug ?? PARTNER_DEFAULT] ?? null;
}

/** Cartella dei documenti e dei record pratica di un partner sullo store Blob */
export function pathPrefix(slug: string): string {
  return `pratiche/${slug}/`;
}

/**
 * Autorizzazione di una richiesta: ritorna il ruolo se la chiave e' valida.
 * - password del partner -> 'partner' (vede solo le proprie pratiche)
 * - EXPO_PORTAL_ADMIN_KEY -> 'admin' (vede tutto e aggiorna gli stati)
 */
export function ruoloDaChiave(
  chiave: string,
  partner: PortalePartner,
  adminKey: string | undefined,
): 'partner' | 'admin' | null {
  if (adminKey && chiave === adminKey) return 'admin';
  if (chiave && chiave === partner.password) return 'partner';
  return null;
}

export const STATI_PRATICA = ['Ricevuta', 'In lavorazione', 'In delibera', 'Approvata', 'Declinata'];
