// Quali documenti della pratica vanno in allegato alla mail a MCF (22/10/2026, deciso da
// Alberto: prima la mail li elencava soltanto e si scaricavano dal portale).
//
// Resend accetta mail fino a 40 MB, allegati compresi e gia' codificati in base64, che
// pesa un terzo in piu' del file. Ai documenti del cliente restano quindi 28 MB di
// file: con la codifica fanno circa 37 MB, e il resto lo lasciano alla proposta per il
// locatore e al testo. Si allegano nell'ordine, lo ZIP unico per primo; quello che non
// ci sta resta nel portale e la mail lo dice per nome.
//
// Modulo puro: la lettura dallo store la fa pratica-distinta.ts.

import { VOCE_ZIP, type DocumentoVoce } from './pratica-distinta-regole';

/** I byte di file del cliente che una mail porta in allegato */
export const LIMITE_ALLEGATI_BYTES = 28 * 1024 * 1024;

/** Lo ZIP unico prima, poi l'ordine di caricamento */
export function ordineAllegati<T extends Pick<DocumentoVoce, 'voce'>>(documenti: T[]): T[] {
  return [...documenti.filter((d) => d.voce === VOCE_ZIP), ...documenti.filter((d) => d.voce !== VOCE_ZIP)];
}

/**
 * Riempie la mail finche' i byte stanno nel limite. `byte` e' la dimensione vera del file
 * letto dallo store, non quella dichiarata dal browser. Un file che non ci sta non ferma
 * i successivi: un documento piccolo dopo uno grande parte lo stesso.
 */
export function scegliAllegati<T extends { byte: number }>(letti: T[], limite = LIMITE_ALLEGATI_BYTES): { allegati: T[]; esclusi: T[] } {
  const allegati: T[] = [];
  const esclusi: T[] = [];
  let usati = 0;
  for (const d of letti) {
    if (d.byte > 0 && usati + d.byte <= limite) {
      allegati.push(d);
      usati += d.byte;
    } else esclusi.push(d);
  }
  return { allegati, esclusi };
}

/** Il nome del file in allegato: quello caricato, con un numero se due documenti si chiamano uguale */
export function nomiUnici(nomi: string[]): string[] {
  const visti = new Map<string, number>();
  return nomi.map((n) => {
    const nome = n.trim() || 'documento';
    const chiave = nome.toLowerCase();
    const volte = (visti.get(chiave) ?? 0) + 1;
    visti.set(chiave, volte);
    if (volte === 1) return nome;
    const punto = nome.lastIndexOf('.');
    return punto > 0 ? `${nome.slice(0, punto)} (${volte})${nome.slice(punto)}` : `${nome} (${volte})`;
  });
}
