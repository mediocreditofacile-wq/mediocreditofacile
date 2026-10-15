// Quale semaforo per quale fornitore del motore.
//
// ATTENZIONE — FILE SERVER-ONLY (lo usano proposte e ricerca).
//
// credit-policy: le regole del tool Marotta (src/lib/credit-policy.ts). Sui settori
//   generico e fotovoltaico il giallo chiede anticipo o maggiorazione e il rosso
//   blocca la proposta; sul settore macchine il listino e' unico per tutta la rete,
//   quindi il semaforo informa e non cambia niente.
// locatore: i criteri del locatore (semaforo-locatore.ts), quattro colori, mai un
//   effetto sui numeri.

import { valutaCredito, type EsitoCredito } from '../credit-policy';
import type { Carrozzeria } from './carrozzeria';
import { datiLocatore, type DatiCreditoMotore } from './merito';
import type { DatiBilancio } from './proposte';
import { valutaLocatore, type EsitoLocatore, type StatoEventi } from './semaforo-locatore';

export interface Valutazione {
  /** 'verde' | 'giallo' | 'rosso' oppure i quattro colori del locatore */
  semaforo: string;
  credito: EsitoCredito | null;
  locatore: EsitoLocatore | null;
  markup: number;
  anticipo: number;
  /** Nessuna proposta standard: solo la credit policy sui settori che la applicano */
  blocca: boolean;
}

export function valuta(
  k: Carrozzeria,
  d: DatiBilancio & Partial<DatiCreditoMotore>,
  importo: number | null,
  eventi: StatoEventi,
  oggi?: Date,
): Valutazione {
  if (k.regoleSemaforo === 'locatore') {
    const l = valutaLocatore(datiLocatore(d), importo, eventi, oggi);
    return { semaforo: l.semaforo, credito: null, locatore: l, markup: 0, anticipo: 0, blocca: false };
  }
  const c = valutaCredito({ ...d, importo, oggi });
  const neutro = k.settore === 'macchine';
  return {
    semaforo: c.semaforo,
    credito: c,
    locatore: null,
    markup: neutro ? 0 : c.markup,
    anticipo: neutro ? 0 : c.anticipo,
    blocca: !neutro && c.semaforo === 'rosso',
  };
}

/** Il semaforo come lo disegna il portale, nello stesso formato per le due regole */
export function semaforoPerSchermo(v: Valutazione) {
  if (v.locatore) {
    return {
      semaforo: v.semaforo,
      etichetta: v.locatore.etichetta as string | null,
      righe: v.locatore.righe,
      criteri: v.locatore.criteri as unknown[],
      massimale: null as number | null,
      provvisorio: v.locatore.provvisorio,
      eventi: v.locatore.eventi as StatoEventi | null,
      indicazioneMassima: v.locatore.indicazioneMassima,
      indicazioneBase: v.locatore.indicazioneBase as string | null,
    };
  }
  return {
    semaforo: v.semaforo,
    etichetta: null as string | null,
    righe: [] as string[],
    criteri: (v.credito?.criteri ?? []) as unknown[],
    massimale: v.credito?.massimale ?? null,
    provvisorio: false,
    eventi: null as StatoEventi | null,
    indicazioneMassima: null as number | null,
    indicazioneBase: null as string | null,
  };
}
