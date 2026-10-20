// I controlli del Pannello MCF (spec mcf_spec-ledoffice-motore_v1, paragrafo 10):
// configurazione del settore distinta, clienti segnalati, pratiche esterne.
//
// Modulo puro, senza database: lo usa /api/motore/admin e si prova da solo. Contiene
// nomi di canali e locatori: solo server, mai dal browser degli agenti.
//
// La regola e' una: quello che l'admin manda si salva com'e' o non si salva. I lettori
// di config-distinta scartano in silenzio un elemento scritto male, ed e' giusto alla
// lettura (un canale con una soglia illeggibile non resta in giro senza soglia); al
// salvataggio invece lo scarto in silenzio farebbe danni: una voce di checklist
// sparita smette di chiedere un documento. Quindi qui si rilegge cio' che e' arrivato
// con lo stesso lettore, e se il lettore scarterebbe o cambierebbe qualcosa il
// salvataggio si rifiuta con un messaggio che dice cosa.

import {
  leggiCanali,
  leggiCategorie,
  leggiChecklist,
  leggiSocieta,
  type CanaleConfig,
  type Categoria,
  type ChecklistConfig,
  type IdCanale,
  type SocietaFornitrice,
  type VoceChecklist,
} from './config-distinta';
import { dataValidita, numero } from './catalogo-import';
import { pivaValida, pulisciPiva } from '../piva';

export type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

const no = (errore: string): { ok: false; errore: string } => ({ ok: false, errore });

/** I canali col loro nome, per i messaggi e il pannello. Solo admin */
export const NOMI_CANALE: Record<IdCanale, string> = { econocom: 'Econocom', grenke: 'Grenke', pagarent: 'Pagarent' };

/** I canali delle pratiche lavorate fuori dal portale: gli stessi del seed */
export const CANALI_ESTERNI = ['pagarent', 'reterent', 'grenke', 'ifis'] as const;
export const NOMI_CANALE_ESTERNO: Record<(typeof CANALI_ESTERNI)[number], string> = {
  pagarent: 'Pagarent', reterent: 'Rete Rent', grenke: 'Grenke', ifis: 'Ifis',
};

export const MOTIVI_SEGNALAZIONE = ['insoluto', 'sofferenze', 'altro'] as const;
export const EFFETTI_SEGNALAZIONE = ['blocco', 'rosso'] as const;

const NON_SALVATO = 'Nessuna modifica salvata.';

/**
 * Una scelta di un menu (settore, regole del semaforo): il valore se e' fra quelli
 * ammessi, altrimenti null, che per chi salva vuol dire "lascia quello che c'e'".
 * Un valore sconosciuto non diventa mai il default al posto di quello salvato.
 */
export function sceltaDaElenco(inviato: unknown, ammessi: readonly string[]): string | null {
  return typeof inviato === 'string' && ammessi.includes(inviato) ? inviato : null;
}

// --- confronto fra cio' che e' arrivato e cio' che il lettore ne tiene ----------------

/** Chiavi in ordine, null e undefined tolti: cosi' "assente" e "null" sono la stessa cosa */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v !== null && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined && x !== null) o[k] = canonico(x);
    }
    return o;
  }
  return v;
}

const uguali = (a: unknown, b: unknown) =>
  JSON.stringify(canonico(a ?? undefined)) === JSON.stringify(canonico(b ?? undefined));

const mostra = (v: unknown) => (Array.isArray(v) ? v.map(String).join(', ') : String(v));

const oggetto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Il primo campo che il lettore toglierebbe o cambierebbe, detto a parole. Null = nessuno */
function differenza(inviato: Record<string, unknown>, letto: object, etichette: Record<string, string>): string | null {
  const l = letto as Record<string, unknown>;
  for (const k of new Set([...Object.keys(inviato), ...Object.keys(l)])) {
    if (uguali(inviato[k], l[k])) continue;
    if (!(k in etichette)) return `campo «${k}» non previsto: non si salverebbe`;
    if (l[k] === undefined || l[k] === null) return `${etichette[k]} «${mostra(inviato[k])}»: non si salverebbe`;
    return `${etichette[k]}: si salverebbe «${mostra(l[k])}» invece di «${mostra(inviato[k])}»`;
  }
  return null;
}

/**
 * Perche' il lettore scarta un elemento: prima i campi obbligatori, controllati a mano;
 * poi quelli facoltativi, provando a rileggere l'elemento senza ciascuno di loro.
 */
function campoFacoltativoIlleggibile(
  o: Record<string, unknown>,
  leggiUno: (x: unknown) => unknown,
  etichette: Record<string, string>,
): string {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined || o[k] === null) continue;
    if (leggiUno({ ...o, [k]: undefined }) !== null) {
      return `${etichette[k] ?? `campo «${k}»`} «${mostra(o[k])}»: non si legge`;
    }
  }
  return 'non si legge';
}

const numeroFra = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

// --- canali -----------------------------------------------------------------------

const ETICHETTE_CANALE: Record<string, string> = {
  canale: 'canale', attivo: 'interruttore acceso/spento', tabella: 'listino', maggiorazionePerc: 'maggiorazione',
  fatturatoMin: 'fatturato minimo', importoMin: 'importo minimo dei beni', soloCapitali: 'solo società di capitali',
  formeEscluse: 'forme giuridiche escluse', anniMin: 'anni di attività minimi', settoriEsclusi: 'settori esclusi',
  sogliaProvvisorio: 'soglia del bilancio provvisorio',
};

const leggiUnCanale = (x: unknown) => leggiCanali([x])?.[0] ?? null;

function perche(o: Record<string, unknown>): string {
  if (typeof o.attivo !== 'boolean') return 'interruttore acceso/spento: non si legge';
  if (typeof o.tabella !== 'string' || !o.tabella.trim()) return 'listino: manca';
  if (!numeroFra(o.maggiorazionePerc, 0, 50)) {
    return `maggiorazione «${mostra(o.maggiorazionePerc)}»: serve un numero fra 0 e 50`;
  }
  return campoFacoltativoIlleggibile(o, leggiUnCanale, ETICHETTE_CANALE);
}

/** I canali come li ha mandati il pannello, nell'ordine (l'ordine e' la priorita') */
export function controllaCanali(v: unknown, tabellaEsiste: (id: string) => boolean): Esito<CanaleConfig[]> {
  if (!Array.isArray(v)) return no(`I canali devono essere un elenco. ${NON_SALVATO}`);
  if (v.length === 0) return no(`Serve almeno un canale. ${NON_SALVATO}`);
  const letti: CanaleConfig[] = [];
  for (const [i, x] of v.entries()) {
    const o = oggetto(x);
    const nome = (o && NOMI_CANALE[o.canale as IdCanale]) || `Canale n. ${i + 1}`;
    if (!o) return no(`${nome}: non si legge. ${NON_SALVATO}`);
    if (!NOMI_CANALE[o.canale as IdCanale]) return no(`${nome}: canale sconosciuto «${mostra(o.canale)}». ${NON_SALVATO}`);
    const letto = leggiUnCanale(o);
    if (!letto) return no(`${nome}, ${perche(o)}. ${NON_SALVATO}`);
    const diversa = differenza(o, letto, ETICHETTE_CANALE);
    if (diversa) return no(`${nome}, ${diversa}. ${NON_SALVATO}`);
    if (!tabellaEsiste(letto.tabella)) return no(`${nome}, listino «${letto.tabella}»: non esiste. ${NON_SALVATO}`);
    if (letti.some((c) => c.canale === letto.canale)) return no(`${nome} compare due volte. ${NON_SALVATO}`);
    letti.push(letto);
  }
  return { ok: true, valore: letti };
}

// --- societa' fornitrice ----------------------------------------------------------

const ETICHETTE_SOCIETA: Record<string, string> = {
  ragioneSociale: 'ragione sociale', piva: 'partita IVA', rea: 'REA', indirizzo: 'indirizzo',
  telefono: 'telefono', email: 'email', pec: 'PEC', logo: 'logo',
};

/** La societa' che firma i documenti. Il logo lo tiene chi salva: il pannello non lo cambia */
export function controllaSocieta(v: unknown): Esito<SocietaFornitrice> {
  const o = oggetto(v);
  if (!o) return no(`Società fornitrice: dati non leggibili. ${NON_SALVATO}`);
  if (typeof o.ragioneSociale !== 'string' || !o.ragioneSociale.trim()) return no(`Società fornitrice, ragione sociale: manca. ${NON_SALVATO}`);
  if (typeof o.piva !== 'string' || !pivaValida(o.piva)) {
    return no(`Società fornitrice, partita IVA «${mostra(o.piva)}»: non valida, servono 11 cifre con la cifra di controllo giusta. ${NON_SALVATO}`);
  }
  for (const k of ['rea', 'indirizzo', 'telefono', 'email', 'pec']) {
    if (typeof o[k] !== 'string') return no(`Società fornitrice, ${ETICHETTE_SOCIETA[k]} «${mostra(o[k])}»: non è un testo. ${NON_SALVATO}`);
  }
  const letta = leggiSocieta(o);
  if (!letta) return no(`Società fornitrice, logo: non si legge. ${NON_SALVATO}`);
  const diversa = differenza(o, letta, ETICHETTE_SOCIETA);
  if (diversa) return no(`Società fornitrice, ${diversa}. ${NON_SALVATO}`);
  return { ok: true, valore: letta };
}

// --- categorie --------------------------------------------------------------------

const ETICHETTE_CATEGORIA: Record<string, string> = {
  nome: 'nome', settoriTipici: 'settori tipici', postazione: 'flag postazione', ledwall: 'flag LEDwall',
};

export function controllaCategorie(v: unknown): Esito<Categoria[]> {
  if (!Array.isArray(v)) return no(`Le categorie devono essere un elenco. ${NON_SALVATO}`);
  if (v.length === 0) return no(`Serve almeno una categoria. ${NON_SALVATO}`);
  const lette: Categoria[] = [];
  for (const [i, x] of v.entries()) {
    const o = oggetto(x);
    const nome = (o && typeof o.nome === 'string' && o.nome.trim()) || `Categoria n. ${i + 1}`;
    if (!o) return no(`${nome}: non si legge. ${NON_SALVATO}`);
    const letta = leggiCategorie([o])?.[0] ?? null;
    if (!letta) {
      const motivo = typeof o.nome !== 'string' || !o.nome.trim() ? 'nome: manca'
        : !Array.isArray(o.settoriTipici) || o.settoriTipici.some((p) => typeof p !== 'string' || !/\d/.test(p))
          ? `settori tipici «${mostra(o.settoriTipici)}»: non si leggono, servono prefissi ATECO a cifre`
          : typeof o.postazione !== 'boolean' ? 'flag postazione: non si legge' : 'flag LEDwall: non si legge';
      return no(`${nome}, ${motivo}. ${NON_SALVATO}`);
    }
    const diversa = differenza(o, letta, ETICHETTE_CATEGORIA);
    if (diversa) return no(`${nome}, ${diversa}. ${NON_SALVATO}`);
    if (lette.some((c) => c.nome === letta.nome)) return no(`La categoria ${nome} compare due volte. ${NON_SALVATO}`);
    lette.push(letta);
  }
  return { ok: true, valore: lette };
}

/**
 * Le categorie usate da voci accese del catalogo che nel nuovo elenco non ci sono piu'.
 * Una voce con una categoria sconosciuta ferma la distinta (distinta.ts): prima si
 * cambiano le voci, poi si toglie la categoria.
 */
export function categorieOrfane(
  categorie: Pick<Categoria, 'nome'>[],
  catalogo: { attivo: boolean; attributi: Record<string, unknown> }[],
): string[] {
  const nomi = new Set(categorie.map((c) => c.nome));
  const orfane = catalogo
    .filter((v) => v.attivo && typeof v.attributi.categoria === 'string' && !nomi.has(v.attributi.categoria))
    .map((v) => v.attributi.categoria as string);
  return [...new Set(orfane)];
}

// --- checklist --------------------------------------------------------------------

const ETICHETTE_VOCE: Record<string, string> = {
  nome: 'nome', obbligatoria: 'obbligatoria', sopraImporto: 'importo minimo', forme: 'forme',
};

const leggiUnaVoce = (x: unknown) => leggiChecklist({ voci: [x], formati: ['pdf'] })?.voci[0] ?? null;

export function controllaChecklist(v: unknown): Esito<ChecklistConfig> {
  const o = oggetto(v);
  if (!o || !Array.isArray(o.voci) || !Array.isArray(o.formati)) return no(`Checklist non leggibile. ${NON_SALVATO}`);
  const altre = Object.keys(o).filter((k) => k !== 'voci' && k !== 'formati' && o[k] !== undefined && o[k] !== null);
  if (altre.length) return no(`Checklist: campo «${altre[0]}» non previsto, non si salverebbe. ${NON_SALVATO}`);
  if (o.voci.length === 0) return no(`Serve almeno una voce nella checklist. ${NON_SALVATO}`);
  if (o.formati.length === 0) return no(`Serve almeno un formato ammesso. ${NON_SALVATO}`);

  const voci: VoceChecklist[] = [];
  for (const [i, x] of o.voci.entries()) {
    const voce = oggetto(x);
    const nome = (voce && typeof voce.nome === 'string' && voce.nome.trim()) || `voce n. ${i + 1}`;
    if (!voce) return no(`Checklist, ${nome}: non si legge. ${NON_SALVATO}`);
    const letta = leggiUnaVoce(voce);
    if (!letta) {
      const motivo = typeof voce.nome !== 'string' || !voce.nome.trim() ? 'nome: manca'
        : typeof voce.obbligatoria !== 'boolean' ? 'obbligatoria sì/no: non si legge'
          : voce.forme !== undefined && voce.forme !== null && !leggiUnaVoce({ ...voce, sopraImporto: undefined })
            ? `forme «${mostra(voce.forme)}»: non si leggono (capitali, persone, individuale)`
            : `importo minimo «${mostra(voce.sopraImporto)}»: non si legge`;
      return no(`Checklist, ${nome}, ${motivo}. ${NON_SALVATO}`);
    }
    const diversa = differenza(voce, letta, ETICHETTE_VOCE);
    if (diversa) return no(`Checklist, ${nome}, ${diversa}. ${NON_SALVATO}`);
    if (voci.some((x) => x.nome === letta.nome)) return no(`Checklist: la voce ${nome} compare due volte. ${NON_SALVATO}`);
    voci.push(letta);
  }

  const formati: ('pdf' | 'jpg')[] = [];
  for (const f of o.formati) {
    if (f !== 'pdf' && f !== 'jpg') return no(`Checklist: formato «${mostra(f)}» non ammesso (pdf, jpg). ${NON_SALVATO}`);
    if (formati.includes(f)) return no(`Checklist: formato «${f}» ripetuto. ${NON_SALVATO}`);
    formati.push(f);
  }
  // Ultima prova: il lettore intero deve dare esattamente lo stesso risultato
  const letta = leggiChecklist({ voci, formati });
  if (!letta || !uguali(letta, { voci, formati })) return no(`Checklist non leggibile. ${NON_SALVATO}`);
  return { ok: true, valore: letta };
}

// --- clienti segnalati ------------------------------------------------------------

export interface Segnalazione {
  piva: string;
  ragioneSociale: string | null;
  motivo: (typeof MOTIVI_SEGNALAZIONE)[number];
  effetto: (typeof EFFETTI_SEGNALAZIONE)[number];
  nota: string | null;
}

const testoONull = (v: unknown, max: number) => {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '';
  return t || null;
};

const PIVA_NON_VALIDA = 'Partita IVA non valida: servono 11 cifre con la cifra di controllo giusta.';

export function controllaSegnalazione(v: unknown): Esito<Segnalazione> {
  const o = oggetto(v) ?? {};
  const piva = pulisciPiva(String(o.piva ?? ''));
  if (!pivaValida(piva)) return no(PIVA_NON_VALIDA);
  const motivo = MOTIVI_SEGNALAZIONE.find((m) => m === o.motivo);
  if (!motivo) return no('Motivo non ammesso: insoluto, sofferenze o altro.');
  const effetto = EFFETTI_SEGNALAZIONE.find((x) => x === o.effetto);
  if (!effetto) return no('Effetto non ammesso: blocco o rosso.');
  return {
    ok: true,
    valore: { piva, ragioneSociale: testoONull(o.ragioneSociale, 200), motivo, effetto, nota: testoONull(o.nota, 1000) },
  };
}

// --- pratiche esterne -------------------------------------------------------------

export interface PraticaEsternaNuova {
  piva: string;
  ragioneSociale: string | null;
  canale: (typeof CANALI_ESTERNI)[number] | null;
  /** AAAA-MM-GG */
  data: string;
  esito: string | null;
  importo: number | null;
}

/** Il giorno di oggi in Italia, AAAA-MM-GG */
const giornoItaliano = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);

const vuoto = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export function controllaPraticaEsterna(v: unknown, oggi: Date = new Date()): Esito<PraticaEsternaNuova> {
  const o = oggetto(v) ?? {};
  const piva = pulisciPiva(String(o.piva ?? ''));
  if (!pivaValida(piva)) return no(PIVA_NON_VALIDA);
  const data = dataValidita(o.data);
  if (!data) return no('Data non valida: scrivila come GG/MM/AAAA.');
  if (data > giornoItaliano(oggi)) return no('La data non può essere futura.');
  let canale: PraticaEsternaNuova['canale'] = null;
  if (!vuoto(o.canale)) {
    canale = CANALI_ESTERNI.find((c) => c === o.canale) ?? null;
    if (!canale) return no(`Canale non ammesso: ${Object.values(NOMI_CANALE_ESTERNO).join(', ')}, oppure nessuno.`);
  }
  let importo: number | null = null;
  if (!vuoto(o.importo)) {
    const n = numero(o.importo);
    if (!(n > 0 && n <= 100_000_000)) return no("Importo non valido: un numero maggiore di zero, o vuoto se non c'è.");
    importo = Math.round(n * 100) / 100;
  }
  return {
    ok: true,
    valore: { piva, ragioneSociale: testoONull(o.ragioneSociale, 200), canale, data, esito: testoONull(o.esito, 200), importo },
  };
}
