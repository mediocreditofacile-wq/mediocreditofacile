// La pratica del settore mezzi (Bergamelli). Spec mcf_spec-bergamelli-motore_v2.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database e, dal preventivo salvato, la mappa
// colonna -> partner del leasing, che non esce mai verso il browser.
//
// /api/motore/pratica, sulle carrozzerie col settore mezzi, passa TUTTA la richiesta da
// creaPraticaMezzi, qualunque cosa mandi il browser: il percorso generico prende
// l'importo dal browser e tratta il preventivo come facoltativo. Qui invece una pratica
// parte solo da un preventivo salvato, dello stesso cliente e dello stesso fornitore, e
// da quello si rilegge tutto:
//  - l'importo e' il totale dei beni del preventivo (`app.proposta.prezzo`), mai quello
//    del browser;
//  - il prodotto e' noleggio o leasing, e la durata dev'essere una di quelle che il
//    preventivo aveva quotato per quel prodotto. Sul leasing il browser sceglie la
//    colonna (A, B, C) e il server la risolve nel partner con la mappa salvata: un
//    partner o una durata che il preventivo non aveva sono un 400;
//  - il venditore e' quello che firma l'offerta (ragione sociale dal preventivo);
//  - il rosso del semaforo non blocca: la pratica parte marcata "da rivalutare". Vale il
//    rosso salvato col preventivo oppure gli eventi negativi presenti sulla ricerca
//    riletta all'invio (arrivati dopo il preventivo: la verifica gira in background).
//
// Cosa va dove: il nome del partner e il venditore stanno in `app.pratica.dati.extra` e
// nella mail a MCF, che sono solo di MCF (nessuna lista legge `dati`). Al commerciale la
// risposta dice soltanto { ok, id }, o { ok: false, error } con un codice.
//
// La scelta (`sceltaPratica`) e' una funzione pura: legge solo quello che le si passa, e
// una forma che non e' di un preventivo di mezzi (un altro settore, un JSON rovinato) e'
// un errore, non un'eccezione.

import { PARTNERS_LEASING } from '../../data/leasing';
import { controllaDatiCliente } from '../dati-cliente-pratica';
import { queryUna } from '../db';
import { ricercaVisibile } from './calcolo-proposta';
import type { PartnerConfronto } from './config-mezzi';
import { bozzaValida, creaPratica, documentiDellaBozza, FORME, type ExtraPratica } from './pratica';
import { filtroVisibilita, type EsitoMotore } from './sessione';

type Sessione = Extract<EsitoMotore, { ok: true }>;

/** La voce in piu' della checklist sul leasing: la banca la vuole sempre, qualunque sia l'importo */
export const VOCE_BILANCIO_ANALITICO =
  "Bilancio analitico dell'ultimo esercizio (bilancio di verifica o situazione contabile dettagliata)";

const PARTNER_NOTI: readonly PartnerConfronto[] = ['sella', 'credem', 'alba'];

// --- la scelta ----------------------------------------------------------------

type ErroreScelta = 'prodotto_non_valido' | 'durata_non_valida' | 'partner_non_valido';

export type EsitoScelta =
  | {
    ok: true;
    prodotto: 'noleggio' | 'leasing';
    durata: number;
    /** Il partner della colonna scelta; null sul noleggio */
    partner: PartnerConfronto | null;
    /** Il totale dei beni del preventivo */
    importo: number;
    rivalutare: boolean;
  }
  | { ok: false; error: ErroreScelta };

const oggetto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const testo = (v: unknown, max = 200) =>
  (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);

const no = (error: ErroreScelta): EsitoScelta => ({ ok: false, error });

/** La durata come la manda il browser: un intero, come numero o come stringa di sole cifre */
function leggiDurata(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
  if (typeof v === 'string' && /^\d{1,4}$/.test(v)) return Number(v);
  return null;
}

/** Le durate quotate da un elenco di righe; le voci che non sono righe (oggetti con una durata) non contano */
function durateQuotate(righe: unknown): number[] {
  if (!Array.isArray(righe)) return [];
  return righe.flatMap((r) => {
    const durata = oggetto(r)?.durata;
    return typeof durata === 'number' && Number.isFinite(durata) ? [durata] : [];
  });
}

/**
 * Che cosa chiede la pratica, riletto dal preventivo salvato. `proposta` e' la riga di
 * app.proposta (prezzo gia' come numero); `corpo` quello che arriva dal browser, di cui
 * contano solo `prodotto`, `durata` e `leasingChiave`: l'importo del corpo non si legge.
 * Noleggio vuole la durata fra le rate salvate; leasing vuole la chiave fra le colonne
 * salvate, con almeno una riga, e la durata fra le righe di quella colonna.
 */
export function sceltaPratica(
  proposta: { prezzo: number; semaforo: string; dati: unknown; numeri: unknown },
  corpo: Record<string, unknown>,
): EsitoScelta {
  const prodotto = corpo.prodotto;
  if (prodotto !== 'noleggio' && prodotto !== 'leasing') return no('prodotto_non_valido');

  const prezzo = proposta.prezzo;
  if (typeof prezzo !== 'number' || !Number.isFinite(prezzo) || prezzo <= 0) return no('prodotto_non_valido');
  const importo = Math.round(prezzo * 100) / 100;
  const rivalutare = proposta.semaforo === 'rosso';
  const durata = leggiDurata(corpo.durata);

  const numeri = oggetto(proposta.numeri);
  if (!numeri) return no('prodotto_non_valido');

  if (prodotto === 'noleggio') {
    const durate = durateQuotate(oggetto(numeri.noleggio)?.rate);
    // Nessun noleggio salvato (mezzo targato, nessun canale): non c'e' una pratica di noleggio da aprire
    if (durate.length === 0) return no('prodotto_non_valido');
    if (durata === null || !durate.includes(durata)) return no('durata_non_valida');
    return { ok: true, prodotto, durata, partner: null, importo, rivalutare };
  }

  const mappa = oggetto(oggetto(proposta.dati)?.partner);
  if (!mappa || !Array.isArray(numeri.leasing)) return no('prodotto_non_valido');

  const chiave = typeof corpo.leasingChiave === 'string' ? corpo.leasingChiave : '';
  const colonna = chiave === '' ? undefined : numeri.leasing.map(oggetto).find((c) => c?.chiave === chiave);
  const durate = durateQuotate(colonna?.righe);
  // Colonna che non c'e' o senza righe (importo sotto il minimo del partner): quel partner non quota
  if (!colonna || durate.length === 0) return no('partner_non_valido');

  // Solo una chiave che la mappa ha davvero: mai dalla catena dei prototipi
  const partner = Object.prototype.hasOwnProperty.call(mappa, chiave) ? mappa[chiave] : null;
  if (!PARTNER_NOTI.includes(partner as PartnerConfronto)) return no('partner_non_valido');

  if (durata === null || !durate.includes(durata)) return no('durata_non_valida');
  return { ok: true, prodotto, durata, partner: partner as PartnerConfronto, importo, rivalutare };
}

// --- la pratica ---------------------------------------------------------------

export type EsitoPraticaMezzi =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; messaggio?: string };

function rifiuto(status: number, error: string, messaggio?: string): EsitoPraticaMezzi {
  return { ok: false, status, error, ...(messaggio ? { messaggio } : {}) };
}

/** Le colonne di app.proposta che servono alla pratica */
interface PropostaSalvata {
  id: string;
  /** numeric(12,2): il driver lo restituisce come stringa */
  prezzo: string | number;
  semaforo: string | null;
  dati: unknown;
  numeri: unknown;
}

const nomePartner = (p: PartnerConfronto) => PARTNERS_LEASING.find((x) => x.key === p)?.label ?? p;

/**
 * Crea la pratica di un preventivo di mezzi. Corpo: quello della pratica generica piu'
 * `propostaId` (obbligatorio) e `leasingChiave` ('A' | 'B' | 'C', solo sul leasing).
 * Ordine dei rifiuti: ricerca non visibile (404), preventivo mancante (400), preventivo
 * non trovato (404: non e' dell'utente, non e' di questo cliente o di questo fornitore),
 * scelta che il preventivo non ammette (400), dati del cliente (400), bozza (400).
 */
export async function creaPraticaMezzi(e: Sessione, corpo: Record<string, unknown>): Promise<EsitoPraticaMezzi> {
  const { carrozzeria: k } = e;

  // 1. la ricerca visibile: il cliente e' quello verificato
  const ricerca = await ricercaVisibile(e, testo(corpo.ricercaId, 60));
  if (!ricerca) return rifiuto(404, 'ricerca_non_trovata');

  // 2. il preventivo: obbligatorio, visibile all'utente, dello stesso cliente e di questo fornitore
  const propostaId = testo(corpo.propostaId, 60);
  if (!propostaId) return rifiuto(400, 'preventivo_mancante');
  const { where, valori } = filtroVisibilita(e, '', 4);
  const proposta = await queryUna<PropostaSalvata>(
    `SELECT id, prezzo, semaforo, dati, numeri FROM app.proposta
      WHERE id = $1 AND fornitore_slug = $2 AND piva = $3 AND ${where}`,
    [propostaId, k.slug, ricerca.piva, ...valori],
  );
  if (!proposta) return rifiuto(404, 'preventivo_non_trovato');

  // 3. prodotto, partner e durata: solo fra quelli che il preventivo aveva quotato
  const scelta = sceltaPratica(
    { prezzo: Number(proposta.prezzo), semaforo: String(proposta.semaforo ?? ''), dati: proposta.dati, numeri: proposta.numeri },
    corpo,
  );
  if (!scelta.ok) return rifiuto(400, scelta.error);

  // 4. cellulare, email e IBAN obbligatori (regola del 16/10/2026)
  const ref = oggetto(corpo.referente) ?? {};
  const cliente = controllaDatiCliente({ telefono: ref.telefono, email: ref.email, iban: corpo.iban });
  if (!cliente.ok) return rifiuto(400, cliente.errore, cliente.messaggio);

  // 5. la bozza dei documenti, la forma giuridica per la checklist
  const bozza = testo(corpo.bozza, 40);
  if (!bozzaValida(bozza)) return rifiuto(400, 'bozza_non_valida');
  const forma = testo(corpo.formaGiuridica, 40);

  // 6. quello che la pratica porta in piu': venditore, partner, rosso, voce del leasing
  const venditore = testo(oggetto(oggetto(proposta.numeri)?.venditore)?.ragioneSociale, 200)
    || testo(oggetto(proposta.dati)?.venditore, 60)
    || 'non indicato';
  const extra: ExtraPratica = {
    venditore,
    partner: scelta.partner ? nomePartner(scelta.partner) : null,
    // Rosso nel preventivo, o eventi negativi arrivati dopo: con i criteri del locatore la
    // verifica gira in background e un preventivo salvato mentre e' in corso non e' rosso.
    // sceltaPratica resta pura; qui conta anche la ricerca riletta all'invio.
    rivalutare: scelta.rivalutare || ricerca.eventi?.stato === 'presenti',
    checklistExtra: scelta.prodotto === 'leasing' ? [VOCE_BILANCIO_ANALITICO] : [],
  };

  const id = await creaPratica(e, {
    ricerca,
    propostaId: proposta.id,
    bozza,
    prodotto: scelta.prodotto,
    durata: scelta.durata,
    importo: scelta.importo,
    formaGiuridica: (FORME as readonly string[]).includes(forma) ? forma : 'Altro',
    referente: { nome: testo(ref.nome, 120), telefono: testo(cliente.telefono, 40), email: testo(cliente.email, 160) },
    iban: cliente.iban,
    note: testo(corpo.note, 2000),
    documenti: documentiDellaBozza(k.slug, bozza, corpo.documenti),
    extra,
  });
  return { ok: true, id };
}
