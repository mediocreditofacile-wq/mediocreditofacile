// Origini ammesse per le API che servono il tool Marotta.
//
// Il tool oggi e' servito dallo stesso dominio, ma una PWA installata quando
// stava su Netlify continua a chiamare da li': si tengono aperte le due origini
// note, non il mondo intero come faceva /api/cerved.
//
// Sta in un file suo perche' lo usano piu' endpoint: una lista di origini
// duplicata e' una lista che prima o poi diverge.

export const ORIGINI_MAROTTA = [
  'https://www.mediocreditofacile.it',
  'https://mcf-marotta.netlify.app',
];

export function headersMarotta(origin: string | null): Record<string, string> {
  const consentita = origin && ORIGINI_MAROTTA.includes(origin) ? origin : ORIGINI_MAROTTA[0];
  return {
    'Access-Control-Allow-Origin': consentita,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}
