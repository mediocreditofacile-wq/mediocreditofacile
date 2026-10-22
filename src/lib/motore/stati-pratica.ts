// Gli stati della pratica sul motore dei portali e chi legge cosa.
//
// Dal 22/10/2026 (SQL 012) MCF segna anche su quale canale ha caricato la pratica:
// inserita su PagaRent, su ReteRent o tramite un fornitore esterno. Il nome del canale
// lo vede solo MCF: a referente e agente lo stato arriva gia' ridotto a "inserita"
// (statoPerRuolo, storiaPerRuolo), e le etichette coi nomi stanno solo qui, sul
// server, e nella risposta all'admin. Il codice della pagina, che e' lo stesso per
// tutti, non le contiene (regola Led Office del 20/10/2026: mai il nome di un
// locatore al commerciale).
//
// ATTENZIONE: non importare questo file da src/scripts/, porterebbe i nomi nel bundle.

export const STATI = [
  'ricevuta',
  'in-lavorazione',
  'inserita-pagarent',
  'inserita-reterent',
  'inserita-esterno',
  'in-delibera',
  'approvata',
  'declinata',
] as const;
export type StatoPratica = (typeof STATI)[number];

/** Lo stato che vede chi non e' MCF al posto dei tre "inserita-..." */
export const STATO_INSERITA = 'inserita';

/** Le etichette che vede MCF, nell'ordine del menu */
export const ETICHETTA_STATO: Record<StatoPratica, string> = {
  'ricevuta': 'Ricevuta',
  'in-lavorazione': 'In lavorazione',
  'inserita-pagarent': 'Inserita PagaRent',
  'inserita-reterent': 'Inserita ReteRent',
  'inserita-esterno': 'Inserita fornitore esterno',
  'in-delibera': 'In delibera',
  'approvata': 'Approvata',
  'declinata': 'Declinata',
};

export const statoValido = (s: unknown): s is StatoPratica => STATI.includes(s as StatoPratica);

/** Lo stato come lo legge il ruolo: per referente e agente i tre "inserita-..." diventano "inserita" */
export function statoPerRuolo(stato: string, admin: boolean): string {
  return admin || !stato.startsWith(`${STATO_INSERITA}-`) ? stato : STATO_INSERITA;
}

/** La storia dei cambi di stato con la stessa riduzione, sui campi "da" e "a" */
export function storiaPerRuolo(storia: unknown, admin: boolean): unknown {
  if (admin || !Array.isArray(storia)) return storia;
  return storia.map((x) => {
    if (!x || typeof x !== 'object') return x;
    const r = { ...(x as Record<string, unknown>) };
    for (const k of ['da', 'a']) if (typeof r[k] === 'string') r[k] = statoPerRuolo(r[k] as string, false);
    return r;
  });
}

/** Il menu degli stati per l'admin: [codice, etichetta], nell'ordine */
export const statiPerAdmin = (): [string, string][] => STATI.map((s) => [s, ETICHETTA_STATO[s]]);
