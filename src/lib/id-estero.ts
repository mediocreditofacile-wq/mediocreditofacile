// Identificativo di una controparte estera, prima che parta la chiamata.
//
// Modulo puro e client-safe: lo usano /api/azienda-estera (che decide cosa
// mandare a Openapi) e la pagina /tools/valutazione (che avvisa prima di
// spendere). Una ricerca con un codice malformato non e' gratis: Openapi
// fattura anche le risposte d'errore, solo il "non trovato" (204) non costa.
//
// Per ora la regola c'e' solo per i Paesi Bassi. Gli altri paesi passano come
// sono stati scritti, salvo gli spazi ai bordi: ogni registro ha il suo formato.
//
// Openapi WW-advanced/{paese}/{id} accetta, dice la documentazione, "VAT number,
// tax code, company number or company ID", senza esempi olandesi (letta il
// 20/10/2026 su console.openapi.com, spec company.openapi.json). Quale dei due
// codici olandesi risponda davvero si sapra' dalla prima ricerca vera.

export type EsitoIdEstero =
  | { ok: true; id: string; tipo: 'kvk' | 'partita-iva' | 'libero' }
  | { ok: false; errore: string };

/** KVK: numero della Camera di Commercio olandese, 8 cifre */
const KVK = /^\d{8}$/;
/** Partita IVA olandese (BTW-id): NL, 9 cifre, la lettera B, 2 cifre. Es. NL852057775B01 */
const BTW = /^NL\d{9}B\d{2}$/;

export const FORMATO_NL = 'Numero KVK (8 cifre, es. 56286333) o partita IVA NL + 9 cifre + B + 2 cifre (es. NL852057775B01)';

export function normalizzaIdEstero(paese: string, grezzo: string): EsitoIdEstero {
  const P = paese.trim().toUpperCase();
  const id = grezzo.trim();
  if (P !== 'NL') return { ok: true, id, tipo: 'libero' };

  // Spazi, punti e trattini sono solo impaginazione: "NL 8520.57.775 B01" e' lo stesso codice
  const pulito = id.replace(/[\s.\-]/g, '').toUpperCase();
  if (KVK.test(pulito)) return { ok: true, id: pulito, tipo: 'kvk' };
  if (BTW.test(pulito)) return { ok: true, id: pulito, tipo: 'partita-iva' };
  // Senza prefisso si rimette: il formato europeo della partita IVA lo vuole
  if (BTW.test(`NL${pulito}`)) return { ok: true, id: `NL${pulito}`, tipo: 'partita-iva' };

  // Errore frequente: una cifra al posto della B (NL852057775801 invece di NL852057775B01)
  if (/^NL\d{12}$/.test(pulito)) {
    return {
      ok: false,
      errore: `La partita IVA olandese ha la lettera B in dodicesima posizione (NL + 9 cifre + B + 2 cifre): forse è ${pulito.slice(0, 11)}B${pulito.slice(12)}. Controlla il codice prima di cercare.`,
    };
  }
  return { ok: false, errore: `Codice olandese non riconosciuto. Serve il ${FORMATO_NL}.` };
}
