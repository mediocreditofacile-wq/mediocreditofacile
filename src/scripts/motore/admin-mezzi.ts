// Pezzi puri del Pannello MCF per il settore mezzi (Bergamelli): niente DOM e niente
// rete, cosi' si provano da soli. Li usa admin.ts, che il browser scarica solo quando
// entra l'admin.
//
// La configurazione dei mezzi si modifica come JSON in un campo di testo: contiene
// partite IVA e spread, quindi arriva solo all'admin. Il controllo vero lo fa il
// server (pannello-mcf.ts, controllaMezzi); qui si legge il JSON per non chiamarlo
// con un testo che non e' nemmeno JSON.

import type { CanaleConfig } from '../../lib/motore/config-distinta';

/** La configurazione salvata nel campo di testo: a capo con due spazi. Niente salvato = campo vuoto */
export function configInTesto(mezzi: unknown): string {
  return mezzi === null || mezzi === undefined ? '' : JSON.stringify(mezzi, null, 2);
}

export type LetturaConfig = { ok: true; valore: unknown } | { ok: false; errore: string };

/**
 * Il testo del campo come JSON. Un errore di scrittura si dice qui, con la posizione che
 * il browser da', e non parte nessuna richiesta. Se il JSON e' valido ma non e' quello
 * giusto (un elenco, un campo di troppo) lo dice il server.
 */
export function configDaTesto(testo: string): LetturaConfig {
  if (!testo.trim()) return { ok: false, errore: 'La configurazione è vuota. Nessuna modifica salvata.' };
  try {
    return { ok: true, valore: JSON.parse(testo) };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'testo non leggibile';
    return { ok: false, errore: `Il testo non è un JSON valido (${motivo}). Nessuna modifica salvata.` };
  }
}

/**
 * La nota sotto la configurazione del settore mezzi. Cinque campi li' non contano per il
 * calcolo: il noleggio lo decidono i canali, il leasing i partner della configurazione dei
 * mezzi. I campi restano nel modulo e si salvano come sempre, cosi' il salvataggio e'
 * lo stesso per ogni settore; la nota dice che cosa non fanno. Null sugli altri settori.
 */
export function notaConfigurazione(settore: string): string | null {
  if (settore !== 'mezzi') return null;
  return 'Sui mezzi listino del noleggio, listino affiancato, partner del leasing e "Leasing da" non contano: '
    + 'il noleggio lo decidono i canali di quotazione qui sotto, il leasing i partner della sezione "Venditori, categorie e leasing". '
    + '"Proponi anche il leasing" non spegne il leasing dei mezzi: cambia solo il testo della mail di invito.';
}

/**
 * Le condizioni sul bene di un canale come righe di testo, con i nomi del pannello.
 * Si mostrano e non si cambiano da qui. Una condizione che non cambia niente
 * (categorie escluse vuote, esclusione dei targati spenta) non compare; "venditori"
 * vuoto si', perche' vuol dire che il canale non quota nessun bene.
 */
export function condizioniSulBene(c: Pick<CanaleConfig, 'venditori' | 'categorieEscluse' | 'escludiTargati'>): string[] {
  const righe: string[] = [];
  if (c.venditori !== undefined) righe.push(`venditori: ${c.venditori.length ? c.venditori.join(', ') : 'nessuno'}`);
  if (c.categorieEscluse?.length) righe.push(`categorie escluse: ${c.categorieEscluse.join(', ')}`);
  if (c.escludiTargati === true) righe.push('esclude i mezzi targati: sì');
  return righe;
}

/**
 * Il canale come va salvato: quello che aveva, senza i campi che il pannello sa
 * modificare, piu' quello che il pannello ha letto dai campi.
 *
 * Cosi' un campo che il pannello non mostra come modificabile (le condizioni sul bene
 * dei mezzi) resta com'era, mentre uno che il pannello conosce e l'admin ha svuotato
 * sparisce davvero invece di tornare dal salvato.
 */
export function canaleConservato(
  salvato: Record<string, unknown>,
  chiaviDelPannello: readonly string[],
  dalPannello: Record<string, unknown>,
): Record<string, unknown> {
  const resto = Object.fromEntries(Object.entries(salvato).filter(([k]) => !chiaviDelPannello.includes(k)));
  return { ...resto, ...dalPannello };
}
