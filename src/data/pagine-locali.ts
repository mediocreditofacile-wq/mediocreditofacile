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
 * Risolve la chiave del frontmatter in una pagina del registro.
 * Fallisce in build se la chiave non esiste: meglio un errore in fase di
 * pubblicazione che un articolo online con un link territoriale rotto.
 */
export function risolviPaginaLocale(chiave: string): PaginaLocale {
  const pagina = PAGINE_LOCALI.find((p) => p.chiave === chiave);
  if (!pagina) {
    const disponibili = PAGINE_LOCALI.map((p) => p.chiave).join(', ') || 'nessuna';
    throw new Error(
      `[pagine-locali] Territorio "${chiave}" non presente nel registro. ` +
        `Chiavi disponibili: ${disponibili}. ` +
        `Crea prima la pagina servizio del territorio e aggiungila a src/data/pagine-locali.ts.`
    );
  }
  return pagina;
}

/** Testo del link contestuale, declinato sull'ambito geografico. */
export function frasePaginaLocale(p: PaginaLocale): string {
  const preposizione = p.ambito === 'comune' ? 'a' : 'in';
  return `${p.servizio.charAt(0).toUpperCase()}${p.servizio.slice(1)} ${preposizione} ${p.nome}`;
}
