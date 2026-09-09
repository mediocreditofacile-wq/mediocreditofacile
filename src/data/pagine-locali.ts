/**
 * Registro delle pagine servizio territoriali.
 *
 * Ogni articolo del blog dichiara nel frontmatter il campo `territorio` con una
 * chiave di questo registro, e il template mette il link alla pagina locale
 * corrispondente. La ragione sta nella misura di visibilità sugli assistenti AI
 * del settembre 2026: i motori aprivano i nostri articoli senza mai nominarci,
 * mentre citavano fornitori con pagine geolocalizzate. L'articolo spiega la
 * materia, la pagina locale dice chi la fa e dove: servono collegati.
 *
 * Per aggiungere un territorio: si crea la pagina servizio, si aggiunge la voce
 * qui, e da quel momento gli articoli possono puntarci. Il livello puo' essere
 * regione, provincia o comune — un articolo su una pratica di Adria linka Adria,
 * uno che parla di Veneto in generale linka il Veneto.
 */

import { REGIONI, SERVIZI, slugTerritoriale, type ChiaveServizio } from './territori';

export type AmbitoLocale = 'regione' | 'provincia' | 'comune';

export interface PaginaLocale {
  /** Chiave da scrivere nel frontmatter dell'articolo. */
  chiave: string;
  /** Percorso della pagina servizio. */
  url: string;
  /** Nome del territorio come va letto in una frase. */
  nome: string;
  ambito: AmbitoLocale;
  /** Servizio di cui parla la pagina, per costruire il testo del link. */
  servizio: string;
}

export const PAGINE_LOCALI: PaginaLocale[] = [
  {
    chiave: 'puglia',
    url: '/noleggio-operativo-fotovoltaico-puglia',
    nome: 'Puglia',
    ambito: 'regione',
    servizio: 'noleggio operativo fotovoltaico',
  },
];

/**
 * Il cluster dell'articolo sceglie quale delle tre pagine del territorio
 * linkare: un pezzo sul leasing manda alla pagina leasing di quella regione,
 * non alla prima disponibile.
 */
const CLUSTER_A_SERVIZIO: Record<string, ChiaveServizio> = {
  noleggio: 'noleggio-operativo',
  fotovoltaico: 'noleggio-operativo',
  leasing: 'leasing',
  finanziamenti: 'finanziamenti',
  agevolazioni: 'finanziamenti',
  'casi-studio': 'noleggio-operativo',
};

/**
 * Risolve la chiave del frontmatter in una pagina locale.
 *
 * Cerca prima fra le pagine territoriali di src/data/territori.ts, che sono la
 * fonte principale, e usa il cluster dell'articolo per scegliere il servizio;
 * se quella regione non copre quel servizio ripiega su un altro dei suoi. Solo
 * dopo guarda PAGINE_LOCALI, che tiene le pagine territoriali con un taglio
 * loro, fuori dalla tripletta.
 *
 * Fallisce in build se la chiave non esiste da nessuna parte: meglio un errore
 * in pubblicazione che un articolo online con un link territoriale rotto.
 */
export function risolviPaginaLocale(chiave: string, cluster?: string): PaginaLocale {
  const regione = REGIONI.find((r) => r.chiave === chiave);
  if (regione) {
    const preferito = cluster ? CLUSTER_A_SERVIZIO[cluster] : undefined;
    const servizio = (preferito && regione.contenuti[preferito] ? preferito : null)
      ?? (Object.keys(SERVIZI) as ChiaveServizio[]).find((k) => regione.contenuti[k]);
    if (servizio) {
      return {
        chiave,
        url: slugTerritoriale(servizio, regione),
        nome: regione.nome,
        ambito: 'regione',
        servizio: SERVIZI[servizio].nome,
      };
    }
  }

  const pagina = PAGINE_LOCALI.find((p) => p.chiave === chiave);
  if (!pagina) {
    const disponibili = [...REGIONI.map((r) => r.chiave), ...PAGINE_LOCALI.map((p) => p.chiave)]
      .join(', ') || 'nessuna';
    throw new Error(
      `[pagine-locali] Territorio "${chiave}" non presente in nessun registro. ` +
        `Chiavi disponibili: ${disponibili}. ` +
        `Crea prima la pagina servizio del territorio (src/data/territori.ts per la ` +
        `tripletta regionale, src/data/pagine-locali.ts per una pagina a taglio proprio).`
    );
  }
  return pagina;
}

/** Testo del link contestuale, declinato sull'ambito geografico. */
export function frasePaginaLocale(p: PaginaLocale): string {
  const preposizione = p.ambito === 'comune' ? 'a' : 'in';
  return `${p.servizio.charAt(0).toUpperCase()}${p.servizio.slice(1)} ${preposizione} ${p.nome}`;
}
