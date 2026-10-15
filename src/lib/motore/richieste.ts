// Le richieste di verifica che MCF addebita al fornitore del motore. Regola di
// Alberto del 15/10/2026: una richiesta e' un cliente (partita IVA) nel mese,
// e il mese e' quello italiano. La stessa partita IVA verificata di nuovo nello
// stesso mese si vede nello storico ma non conta: a MCF non costa (e' in
// archivio) e al fornitore non si addebita due volte.
//
// Modulo puro. Gli euro (prezzo per richiesta, spesa, margine) li vede solo
// l'admin MCF: qui ci sono solo i conteggi.

const FUSO = 'Europe/Rome';
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export interface Verifica {
  id: string;
  piva: string;
  creato: string | Date;
}

/** AAAA-MM del momento, in ora italiana */
export function meseDi(quando: string | Date): string {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(quando));
  const v = (t: string) => parti.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}`;
}

/** Il mese chiesto dalla pagina, se e' un AAAA-MM valido; altrimenti il mese corrente */
export function meseRichiesto(valore: unknown, oggi: Date = new Date()): string {
  const s = String(valore ?? '');
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : meseDi(oggi);
}

export function etichettaMese(mese: string): string {
  const [a, m] = mese.split('-').map(Number);
  return `${MESI[m - 1]} ${a}`;
}

/** Le verifiche che contano: la prima di ogni partita IVA in ogni mese */
export function verificheContate(verifiche: Verifica[]): Set<string> {
  const ordinate = [...verifiche].sort((a, b) => new Date(a.creato).getTime() - new Date(b.creato).getTime());
  const viste = new Set<string>();
  const contate = new Set<string>();
  for (const v of ordinate) {
    const chiave = `${meseDi(v.creato)}|${v.piva}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    contate.add(v.id);
  }
  return contate;
}

/** Richieste per mese, dal piu' recente */
export function riepilogoMesi(verifiche: Verifica[]): { mese: string; richieste: number }[] {
  const perMese = new Map<string, Set<string>>();
  for (const v of verifiche) {
    const m = meseDi(v.creato);
    if (!perMese.has(m)) perMese.set(m, new Set());
    perMese.get(m)!.add(v.piva);
  }
  return [...perMese.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([mese, piva]) => ({ mese, richieste: piva.size }));
}

/** Il mese prima di AAAA-MM */
export function mesePrecedenteDi(mese: string): string {
  const [a, m] = mese.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Solo per l'admin MCF: quanto si addebita al fornitore (richieste per prezzo)
 * e il margine sulla spesa Openapi dello stesso mese, al centesimo.
 */
export function contoRichieste(richieste: number, prezzo: number | null, spesaEuro: number | null) {
  if (prezzo === null) return { importo: null, margine: null };
  const importo = Math.round(richieste * prezzo * 100) / 100;
  return { importo, margine: spesaEuro === null ? null : Math.round((importo - spesaEuro) * 100) / 100 };
}
