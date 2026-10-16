// Chi vede quale pratica sui portali partner ad accesso nominale (oggi STILO).
//
// Modulo puro, senza database ne' Blob, cosi' le regole si testano da sole
// (pratiche-visibilita.test.ts). Le usa src/lib/pratiche-nominali.ts per la
// lista, il download dei documenti e il cambio di stato.
//
// La regola, decisa da Alberto il 13/10/2026: MCF e il referente del fornitore
// vedono tutte le pratiche, ogni agente solo quelle che ha caricato lui. Le
// pratiche caricate prima del passaggio agli accessi personali non hanno un
// autore, quindi restano a referente e MCF.

export interface AutorePratica {
  userId: string;
  email: string;
  nome: string;
}

export interface Lettore {
  userId: string;
  /** Referente o admin MCF: vede tutto il fornitore */
  vedeTutto: boolean;
}

export interface PraticaConAutore {
  autore?: Partial<AutorePratica> | null;
  documenti?: { pathname?: string }[] | null;
}

export function praticaVisibile(pratica: PraticaConAutore, lettore: Lettore): boolean {
  if (lettore.vedeTutto) return true;
  const autore = pratica.autore?.userId;
  return Boolean(autore) && autore === lettore.userId;
}

/** Gli id di Better Auth sono alfanumerici: qualunque altra cosa non entra in un percorso */
const ID_SICURO = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * Cartella in cui un utente carica i documenti delle sue pratiche. Una per
 * persona: all'invio si accettano solo documenti di quella cartella, cosi'
 * nessuno aggancia alla propria pratica un file caricato da un collega.
 */
export function cartellaDocumenti(slug: string, userId: string): string {
  if (!ID_SICURO.test(userId)) throw new Error('id_utente_non_valido');
  return `pratiche/${slug}/docs/${userId}/`;
}

/**
 * Un documento si scarica solo se compare fra quelli di una pratica che il
 * lettore puo' vedere. Non basta che stia nella cartella del fornitore: le
 * carte d'identita' dei clienti di un agente non sono affare dell'altro.
 */
export function documentoVisibile(
  pratiche: PraticaConAutore[],
  percorso: string,
  slug: string,
  lettore: Lettore,
): boolean {
  if (!percorso || percorso.includes('..') || !percorso.startsWith(`pratiche/${slug}/`)) return false;
  return pratiche.some(
    (p) => praticaVisibile(p, lettore) && (p.documenti ?? []).some((d) => d?.pathname === percorso),
  );
}

/**
 * Una pratica come compare nelle liste del portale ("Le tue richieste"): senza
 * l'IBAN del cliente, a nessun ruolo. L'IBAN serve a MCF per aprire la pratica,
 * e MCF lo legge nella mail e nel record; nella lista lo vedrebbe anche il
 * collega o chiunque abbia la password condivisa del portale.
 */
export function praticaPerElenco<T extends object>(pratica: T): T {
  const cliente = (pratica as { cliente?: unknown }).cliente;
  if (!cliente || typeof cliente !== 'object' || !('iban' in cliente)) return pratica;
  const { iban: _, ...resto } = cliente as Record<string, unknown>;
  return { ...pratica, cliente: resto };
}
