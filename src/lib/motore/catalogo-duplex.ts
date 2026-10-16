// Il catalogo Duplex di /tools/duplex nella forma del motore dei portali:
// macchine con famiglia e allestimento, accessori con famiglia, passo e massimo
// (e allestimento, quando valgono per una sola versione). Da dove vengono i
// prezzi lo dice il campo _fonte in testa ai due JSON.
// Lo usano il seed (scripts/seed-motore-duplex.ts) e i test. Dopo il primo
// caricamento il catalogo vive nel database e si cambia dal Pannello MCF.

import accessori from '../../data/duplex-accessori.json';
import listino from '../../data/duplex-listino.json';

export interface VoceSeed {
  codice: string;
  nome: string;
  descrizione: string | null;
  prezzo: number;
  attributi: Record<string, unknown>;
  ordine: number;
}

interface Macchina { id: string; label: string; prezzo: number; alimentazione: string | null }
interface Accessorio { id: string; label: string; prezzo: number; step: number; max: number; note?: string; allestimento?: string }

/** "Duplex 340 a cavo" -> "Duplex 340": la stessa regola del simulatore di /tools/duplex */
const famigliaDi = (label: string) => label.replace(/ (a (cavo|batteria)|steam)$/i, '');

export function vociDuplex(): VoceSeed[] {
  const macchine = (listino.macchine as Macchina[]).map((m, i) => ({
    codice: m.id.toUpperCase(),
    nome: m.label,
    descrizione: null,
    prezzo: m.prezzo,
    attributi: { famiglia: famigliaDi(m.label), allestimento: m.alimentazione },
    ordine: i,
  }));
  const acc = Object.entries(accessori.famiglie as Record<string, { spazzole: Accessorio[]; extra: Accessorio[] }>)
    .flatMap(([famiglia, f]) => [...f.spazzole, ...f.extra].map((a) => ({ famiglia, a })))
    .map(({ famiglia, a }, i) => ({
      codice: a.id.toUpperCase(),
      nome: a.label,
      descrizione: null,
      prezzo: a.prezzo,
      attributi: {
        tipo: 'accessorio', famiglia,
        // La batteria di scorta solo sulla versione a batteria (src/lib/allestimento-accessorio.ts)
        ...(a.allestimento ? { allestimento: a.allestimento } : {}),
        passo: a.step, massimo: a.max, ...(a.note ? { nota: a.note } : {}),
      },
      ordine: 100 + i,
    }));
  return [...macchine, ...acc];
}
