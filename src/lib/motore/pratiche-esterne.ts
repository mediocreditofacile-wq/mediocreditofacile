// Le pratiche lavorate prima del portale (app.pratica_esterna) nella scheda Pratiche.
//
// Decisione di Alberto del 21/10/2026: le vedono MCF e il referente, non i
// commerciali, come le pratiche senza autore dei portali pratiche (STILO). Il
// canale e' il nome di un locatore: esce solo per MCF, gia' tradotto qui sul
// server, perche' nomi-canale.ts non deve finire nel bundle del browser.

import { nomeCanale } from './nomi-canale';

/** Una riga di app.pratica_esterna come la legge la query dello storico (type, non interface: query<T> vuole un QueryResultRow) */
export type RigaEsterna = {
  id: string;
  piva: string;
  ragione_sociale: string | null;
  canale: string | null;
  /** AAAA-MM-GG: la tabella ha solo il giorno */
  data: string;
  esito: string | null;
  importo: string | number | null;
};

export interface PraticaEsterna {
  id: string;
  piva: string;
  ragione_sociale: string | null;
  data: string;
  esito: string | null;
  importo: number | null;
  /** Solo per MCF */
  canale?: string | null;
}

export function praticheEsternePerRuolo(righe: RigaEsterna[], ruolo: string, vedeTutto: boolean): PraticaEsterna[] {
  if (!vedeTutto) return [];
  return righe.map((r) => {
    const p: PraticaEsterna = {
      id: r.id,
      piva: r.piva,
      ragione_sociale: r.ragione_sociale,
      data: r.data,
      esito: r.esito,
      importo: r.importo == null ? null : Number(r.importo),
    };
    if (ruolo === 'admin') p.canale = nomeCanale(r.canale);
    return p;
  });
}
