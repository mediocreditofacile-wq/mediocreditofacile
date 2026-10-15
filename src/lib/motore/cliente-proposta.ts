// Il cliente di una proposta. Con la verifica della partita IVA e' la scheda;
// sul settore macchine le proposte si fanno anche prima, e allora il cliente e'
// il nome che l'agente scrive a mano: nessuna partita IVA, niente di inventato.

import type { RicercaSalvata } from './calcolo-proposta';

export interface ClienteProposta {
  nome: string;
  piva: string | null;
  sede: string | null;
  /** Forma giuridica dal registro; null prima della verifica */
  forma: string | null;
  /** True se viene da una ricerca: ragione sociale e partita IVA sono quelle del registro */
  verificato: boolean;
}

export function clienteDellaProposta(ricerca: RicercaSalvata | null, intestatario: unknown): ClienteProposta {
  if (ricerca) {
    const s = ricerca.dati_credito.scheda;
    return {
      nome: s.ragioneSociale || ricerca.ragione_sociale || 'Cliente', piva: ricerca.piva, sede: s.sede ?? null,
      forma: s.formaGiuridica ?? null, verificato: true,
    };
  }
  const nome = String(intestatario ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { nome, piva: null, sede: null, forma: null, verificato: false };
}
