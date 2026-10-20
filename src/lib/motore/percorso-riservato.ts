// La cartella riservata a MCF dentro l'archivio dei preventivi e delle pratiche, e la
// regola con cui /api/motore/doc decide da dove si puo' consegnare un file.
// Spec mcf_spec-ledoffice-motore_v1, paragrafo 8.
//
// La proposta per il locatore (quella con la riga servizi, che porta la maggiorazione
// del canale) si salva in preventivi/<slug>/<id>/mcf/ e il suo percorso sta solo in
// `riservato.documenti` della proposta, mai in `documenti`. Qui la regola che chiude
// la porta: una cartella mcf e' solo dell'admin MCF, anche se il percorso e' indovinato.
//
// Modulo puro, senza database: lo usano il preventivo e /api/motore/doc, e si testa da solo.
// Il nome del file riservato ha anche un pezzo casuale (nomeNonIndovinabile): il
// percorso vero sta solo nel `riservato`, e dall'id della proposta non si ricava.

/** Il nome della cartella riservata a MCF */
export const CARTELLA_RISERVATA = 'mcf';

/** Dove si salva un file riservato della proposta: preventivi/<slug>/<id>/mcf/<file> */
export function percorsoRiservato(slug: string, id: string, filename: string): string {
  return `preventivi/${slug}/${id}/${CARTELLA_RISERVATA}/${filename}`;
}

/** Il pezzo casuale del nome: 16 cifre esadecimali, cioe' 8 byte da crypto */
const CASUALE = /^[0-9a-f]{16}$/;

/**
 * Il nome con cui un file riservato si salva sullo store: quello leggibile col pezzo
 * casuale prima dell'estensione (proposta-locatore-<id>-<16 esadecimali>.pdf). L'id
 * della proposta lo vede anche l'agente nello Storico: senza il pezzo casuale il
 * percorso si ricaverebbe da li'. La porta la chiude percorsoConsentito; questo e' il
 * secondo lucchetto. Il pezzo casuale lo passa chi chiama (randomBytes), cosi' il
 * modulo resta puro; uno che non e' di 16 esadecimali e' un errore di chi chiama.
 */
export function nomeNonIndovinabile(filename: string, casuale: string): string {
  if (!CASUALE.test(casuale)) throw new Error('pezzo casuale non valido');
  const punto = filename.lastIndexOf('.');
  return punto > 0 ? `${filename.slice(0, punto)}-${casuale}${filename.slice(punto)}` : `${filename}-${casuale}`;
}

/**
 * Da dove /api/motore/doc puo' consegnare un percorso:
 *  - 'documenti': dai `documenti` di una proposta o di una pratica visibile all'utente;
 *  - 'riservato': solo l'admin MCF, dal `riservato.documenti` di una proposta o pratica
 *    del fornitore;
 *  - null: da nessuna parte.
 * Fuori dalle cartelle del fornitore (preventivi/<slug>/, pratiche/<slug>/) e con una
 * risalita ('..') non si consegna niente, nemmeno all'admin. Una cartella mcf a
 * qualunque profondita' (maiuscole comprese, anche dopo una barra doppia) e' riservata:
 * per referente e agente la risposta e' null prima ancora di cercare nel database.
 */
export function percorsoConsentito(percorso: string, slug: string, admin: boolean): 'documenti' | 'riservato' | null {
  if (!percorso || !slug || percorso.includes('..') || percorso.includes('\\')) return null;
  const radice = [`preventivi/${slug}/`, `pratiche/${slug}/`].find((r) => percorso.startsWith(r));
  if (!radice) return null;

  // Le cartelle fra la radice e il nome del file
  const cartelle = percorso.slice(radice.length).split('/').slice(0, -1);
  if (cartelle.some((c) => c.toLowerCase() === CARTELLA_RISERVATA)) return admin ? 'riservato' : null;
  return 'documenti';
}
