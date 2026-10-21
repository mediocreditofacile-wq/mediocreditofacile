// La plancia di MCF (/tools/credenziali) ordinata come l'indice Portali Clienti.
//
// Funzione pura: riceve le credenziali (server-only) e i due array dell'indice
// (client-safe) e li aggancia per percorso. La chiama /api/credenziali, quindi
// le password restano dietro la chiave e non finiscono mai nel bundle.

import type { AccessoPortale } from '../data/credenziali-portali';
import type { PortaleCard } from '../data/portali-clienti';

/** 'mancante' = voce dell'indice senza credenziali registrate: non deve succedere, il test lo impedisce */
export interface VocePlancia extends Omit<AccessoPortale, 'tipo'> {
  tipo: AccessoPortale['tipo'] | 'mancante';
  settore?: string;
}

export interface SezionePlancia {
  id: 'pratiche' | 'aree' | 'fuori' | 'interni';
  titolo: string;
  /** La scheda della pagina in cui compare la sezione */
  scheda: 'clienti' | 'interni';
  voci: VocePlancia[];
}

// '/tools/marotta/' e '/tools/marotta' sono lo stesso portale
const chiave = (percorso: string) => percorso.replace(/\/+$/, '');

export function componiPlancia(
  credenziali: AccessoPortale[],
  pratiche: PortaleCard[],
  aree: PortaleCard[],
): { sezioni: SezionePlancia[]; senzaCredenziali: string[] } {
  const perPercorso = new Map(credenziali.map((c) => [chiave(c.percorso), c]));
  const usate = new Set<string>();
  const senzaCredenziali: string[] = [];

  const dallIndice = (elenco: PortaleCard[]): VocePlancia[] =>
    elenco.map((p) => {
      const c = perPercorso.get(chiave(p.href));
      if (!c) {
        senzaCredenziali.push(p.href);
        return { nome: p.nome, percorso: p.href, tipo: 'mancante', settore: p.settore };
      }
      usate.add(chiave(c.percorso));
      return { ...c, settore: p.settore };
    });

  const sezioni: SezionePlancia[] = [
    { id: 'pratiche', titolo: 'Portali pratiche', scheda: 'clienti', voci: dallIndice(pratiche) },
    { id: 'aree', titolo: 'Aree riservate', scheda: 'clienti', voci: dallIndice(aree) },
    {
      id: 'fuori',
      titolo: "Fuori dall'indice",
      scheda: 'clienti',
      voci: credenziali.filter((c) => c.tipo !== 'interno' && !usate.has(chiave(c.percorso))),
    },
    { id: 'interni', titolo: 'Strumenti interni MCF', scheda: 'interni', voci: credenziali.filter((c) => c.tipo === 'interno') },
  ];

  return { sezioni, senzaCredenziali };
}
