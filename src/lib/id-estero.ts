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
// Paesi Bassi: WW-advanced accetta SOLO la partita IVA (BTW-id). La
// documentazione parla genericamente di "VAT number, tax code, company number or
// company ID", ma la prova vera del 20/10/2026 col numero KVK 56286333
// (Knibbelberg B.V.) ha risposto: vatCode not valid, must match one of these
// regex: ["^NL\d{9}B\d{2}$"]. E quella risposta d'errore si paga 0,11 euro come
// una buona, quindi il KVK si ferma qui, prima della chiamata.

export type EsitoIdEstero =
  | { ok: true; id: string; tipo: 'partita-iva' | 'libero' }
  | { ok: false; errore: string };

/** KVK: numero della Camera di Commercio olandese, 8 cifre. Openapi non lo accetta. */
const KVK = /^\d{8}$/;
/** Partita IVA olandese (BTW-id): NL, 9 cifre, la lettera B, 2 cifre. Es. NL852057775B01. La regex e' quella di Openapi. */
const BTW = /^NL\d{9}B\d{2}$/;

export const FORMATO_NL = 'partita IVA olandese, NL + 9 cifre + B + 2 cifre (es. NL852057775B01)';

export function normalizzaIdEstero(paese: string, grezzo: string): EsitoIdEstero {
  const P = paese.trim().toUpperCase();
  const id = grezzo.trim();
  if (P !== 'NL') return { ok: true, id, tipo: 'libero' };

  // Spazi, punti e trattini sono solo impaginazione: "NL 8520.57.775 B01" e' lo stesso codice
  const pulito = id.replace(/[\s.\-]/g, '').toUpperCase();
  if (BTW.test(pulito)) return { ok: true, id: pulito, tipo: 'partita-iva' };
  // Senza prefisso si rimette: Openapi vuole il formato europeo, con NL davanti
  if (BTW.test(`NL${pulito}`)) return { ok: true, id: `NL${pulito}`, tipo: 'partita-iva' };

  if (KVK.test(pulito)) {
    return {
      ok: false,
      errore: `Per i Paesi Bassi Openapi accetta solo la ${FORMATO_NL}: il numero KVK lo rifiuta, e la risposta si paga lo stesso. La partita IVA sta in fattura o sul sito del cliente, e si controlla sul VIES.`,
    };
  }
  // Errore frequente: una cifra al posto della B (NL852057775801 invece di NL852057775B01)
  if (/^NL\d{12}$/.test(pulito)) {
    return {
      ok: false,
      errore: `La partita IVA olandese ha la lettera B in dodicesima posizione (NL + 9 cifre + B + 2 cifre): forse è ${pulito.slice(0, 11)}B${pulito.slice(12)}. Controlla il codice prima di cercare.`,
    };
  }
  return { ok: false, errore: `Codice olandese non riconosciuto. Serve la ${FORMATO_NL}.` };
}
