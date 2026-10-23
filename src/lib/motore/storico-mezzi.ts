// Lo Storico dei preventivi del settore mezzi (Bergamelli): quello che serve alla pratica.
//
// La pratica dei mezzi parte da un preventivo salvato (pratica-mezzi.ts), anche fatto ieri
// o in un'altra sessione: la pagina deve sapere quali prodotti, partner e durate offriva.
// Da app.proposta.numeri, che e' lo schermo dell'agente coi nomi che la configurazione
// consente, si tengono le durate del noleggio, chiave, nome, motivo e durate di ogni
// colonna del leasing e la ragione sociale del venditore. Mai `dati`, che ha la mappa
// colonna -> partner; mai rate, spese o totali, che alla pratica non servono.
//
// Funzione pura: legge solo quello che le si passa. Un valore illeggibile (un preventivo
// rovinato) diventa "niente", mai un'eccezione che romperebbe tutto lo Storico.

export interface ColonnaStorico {
  /** La lettera della colonna: A, B, C */
  chiave: string;
  /** Il nome del partner come e' salvato: null se i nomi sono spenti */
  nome: string | null;
  /** Perche' la colonna non quota; null se quota */
  motivo: string | null;
  durate: number[];
}

export interface ColonneMezziStorico {
  /** Null se il preventivo non quotava il noleggio (mezzo targato, nessun canale) */
  noleggio: { durate: number[] } | null;
  leasing: ColonnaStorico[];
  venditore: string | null;
}

const oggetto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const testoONull = (v: unknown) => (typeof v === 'string' ? v : null);

/** Le durate di un elenco di righe; le voci senza una durata numerica non contano */
function durate(righe: unknown): number[] {
  if (!Array.isArray(righe)) return [];
  return righe.flatMap((r) => {
    const d = oggetto(r)?.durata;
    return typeof d === 'number' && Number.isFinite(d) ? [d] : [];
  });
}

/** Le colonne di un preventivo di mezzi salvato, dalle tre parti di `numeri` lette dallo Storico */
export function colonneMezziStorico(riga: { noleggio?: unknown; leasing?: unknown; venditore?: unknown }): ColonneMezziStorico {
  const rate = durate(oggetto(riga.noleggio)?.rate);
  const leasing = Array.isArray(riga.leasing)
    ? riga.leasing.flatMap((v) => {
      const c = oggetto(v);
      if (!c || typeof c.chiave !== 'string') return [];
      return [{ chiave: c.chiave, nome: testoONull(c.nome), motivo: testoONull(c.motivo), durate: durate(c.righe) }];
    })
    : [];
  return { noleggio: rate.length ? { durate: rate } : null, leasing, venditore: testoONull(riga.venditore) };
}
