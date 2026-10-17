// Quali route di Better Auth restano chiuse sull'handler /api/auth/*.
//
// Modulo puro, testato in rotte-auth.test.ts.
//
// Le route /api/auth/organization/* (cambio ruolo, inviti, rimozione membri,
// modifica e cancellazione dell'organizzazione, elenco dei membri) il sito non
// le usa: inviti e rapporti li gestiscono src/lib/inviti.ts, /api/portale-invito
// e /api/portale-utenti, con le regole del portale. Lasciarle aperte permetteva
// a un referente di nominare altri referenti e cancellare membri (scansione
// Claude Security del 17/10/2026, F5). Le chiamate server-side auth.api.*
// non passano da qui e non sono toccate.

/** Prefisso, in segmenti, delle route chiuse */
const CHIUSE = ['api', 'auth', 'organization'];

/**
 * True se il percorso cade sotto /api/auth/organization. Il confronto lavora
 * sui segmenti decodificati e in minuscolo, cosi' doppie barre, barre finali,
 * maiuscole o caratteri codificati non lo aggirano.
 */
export function rottaAuthChiusa(pathname: string): boolean {
  let percorso = pathname;
  try {
    // Prima si decodifica e poi si divide: una barra scritta come %2F conta
    // come separatore, non come parte del nome.
    percorso = decodeURIComponent(pathname);
  } catch {
    // Codifica malformata: si confronta il percorso cosi' com'e'.
  }
  const segmenti = percorso.toLowerCase().split('/').filter((s) => s !== '');
  return CHIUSE.every((atteso, i) => segmenti[i] === atteso);
}
