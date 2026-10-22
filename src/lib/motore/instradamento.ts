// Instradamento della distinta: dal cliente e dal totale dei beni al canale che
// quota, con la maggiorazione del canale e la rata per ogni durata.
//
// ATTENZIONE — FILE SERVER-ONLY: legge i coefficienti dei locatori.
//
// Cosa vede chi: `canale`, `beni`, `maggiorazione` e `imponibile` sono riservati
// all'admin MCF. Anche `imponibile` e `beni`: la loro differenza E' la
// maggiorazione, quindi mostrarne anche uno solo insieme alla rata la regala.
// Ogni risposta a un referente o a un agente (API, bundle, PDF, mail) passa da
// `vistaCommerciale()`, che lascia solo rate, nota e i due avvisi. Qui non esce
// nessun coefficiente, nessuna fascia, nessuna sigla di tabella.
//
// Il portale scorre i canali attivi nell'ordine della configurazione (l'ordine e'
// la priorita') e prende il primo che il cliente, l'importo e (sul settore mezzi)
// il bene soddisfano. Un dato che manca non soddisfa mai una condizione: senza
// prova non si passa.
// Senza un canale che regga il risultato e' null e la proposta non esce; non si
// ripiega mai su un altro listino.

import { canoneDaCoefficiente } from '../../data/duplex-costi';
import { PIONEER_LETTO } from '../../data/grenke';
import { tabellaSeEsiste } from '../tabelle-canoni';
import type { CanaleConfig, IdCanale } from './config-distinta';
import { classeForma, mesiDiAttivita } from './semaforo-locatore';

/** La durata che la proposta mette in evidenza */
export const DURATA_EVIDENZA = 60;

/** Quello che dell'azienda serve per scegliere il canale */
export interface ClienteInstradamento {
  /** Codice della forma giuridica del Registro: SR, RS, DI... */
  formaCodice: string | null;
  /** AAAA-MM-GG */
  inizioAttivita: string | null;
  /** Fatturato dell'ultimo bilancio */
  fatturato: number | null;
  /** Codice ATECO, con o senza punti */
  atecoCodice: string | null;
}

/**
 * Quello che del bene serve per scegliere il canale (settore mezzi): `categorie`
 * sono quelle delle righe della distinta, `targato` vale se anche una sola riga lo e'.
 * Lo costruisce il chiamante, che conosce il catalogo.
 */
export interface BeneInstradamento {
  /** Codice del venditore che firma l'offerta */
  venditore: string;
  categorie: string[];
  targato: boolean;
}

export interface RataDurata {
  durata: number;
  /** Canone mensile in euro, ai centesimi */
  canone: number;
}

export interface Instradamento {
  /** Solo admin MCF */
  canale: IdCanale;
  /** Il totale dei beni del commerciale, ai centesimi. Solo admin MCF (vedi l'intestazione) */
  beni: number;
  /** Maggiorazione del canale, arrotondata all'euro. Zero se il canale non ne ha. Solo admin MCF */
  maggiorazione: number;
  /** beni + maggiorazione, ai centesimi: l'importo che il locatore quota. Solo admin MCF */
  imponibile: number;
  rate: RataDurata[];
  /** Rata indicativa: il locatore decide caso per caso */
  daConfermare: boolean;
  /** Condizioni del listino da dire accanto al canone, senza nomi di locatori */
  nota: string | null;
  /** La proposta esce, ma la pratica chiede il bilancio provvisorio dell'anno */
  richiedeProvvisorio: boolean;
}

const soloCifre = (s: string | null): string => (s ?? '').replace(/\D/g, '');
const codiceForma = (s: string | null): string => (s ?? '').trim().toUpperCase();

/**
 * Il cliente soddisfa le condizioni del canale? Ogni confronto e' scritto in modo
 * che un dato mancante o illeggibile (null, NaN) faccia fallire la condizione.
 */
function reggeIlCliente(c: CanaleConfig, cliente: ClienteInstradamento, beni: number, oggi: Date): boolean {
  // Il listino Pioneer non ha una data di lettura: finche' manca, nessun canale lo usa.
  // Il blocco sta sulla tabella e non sul canale: dal Pannello MCF anche un altro canale
  // si puo' puntare su pioneer, e Grenke su un listino che la data ce l'ha
  if (c.tabella === 'pioneer' && PIONEER_LETTO === null) return false;

  // "Oltre" una soglia: la soglia stessa non basta
  if (c.fatturatoMin !== undefined && !(cliente.fatturato !== null && cliente.fatturato > c.fatturatoMin)) return false;
  if (c.importoMin !== undefined && !(beni >= c.importoMin)) return false;

  if (c.soloCapitali && classeForma(cliente.formaCodice) !== 'capitali') return false;
  if (c.formeEscluse && c.formeEscluse.length > 0) {
    const forma = codiceForma(cliente.formaCodice);
    if (forma === '') return false;
    if (c.formeEscluse.some((f) => codiceForma(f) === forma)) return false;
  }

  if (c.anniMin !== undefined) {
    if (!cliente.inizioAttivita) return false;
    if (!(mesiDiAttivita(cliente.inizioAttivita, oggi) >= c.anniMin * 12)) return false;
  }

  // Settori esclusi per prefisso di cifre. Senza ATECO non si prova che il
  // settore non sia escluso, ma solo se c'e' qualcosa da escludere
  if (c.settoriEsclusi && c.settoriEsclusi.length > 0) {
    const ateco = soloCifre(cliente.atecoCodice);
    if (ateco === '') return false;
    if (c.settoriEsclusi.some((p) => ateco.startsWith(p))) return false;
  }
  return true;
}

/**
 * Il bene soddisfa le condizioni del canale? Un canale senza condizioni sul bene
 * lo ignora (Led Office, Duplex...). Con almeno una condizione e senza bene non si
 * prova niente, e il canale non regge. Una lista di venditori vuota non ne ammette
 * nessuno; una lista di categorie escluse vuota non esclude niente.
 */
function reggeIlBene(c: CanaleConfig, bene: BeneInstradamento | null): boolean {
  const escluse = c.categorieEscluse ?? [];
  const condizioni = c.venditori !== undefined || escluse.length > 0 || c.escludiTargati === true;
  if (!condizioni) return true;
  if (bene === null) return false;

  if (c.venditori !== undefined && !c.venditori.includes(bene.venditore)) return false;
  if (bene.categorie.some((categoria) => escluse.includes(categoria))) return false;
  if (c.escludiTargati === true && bene.targato) return false;
  return true;
}

/**
 * Sceglie il canale e calcola le rate. `oggi` serve agli anni di attivita' e si
 * passa dai test; la data e' quella locale. `bene` serve solo ai canali con
 * condizioni sul bene (settore mezzi).
 */
export function instrada(
  canali: CanaleConfig[],
  cliente: ClienteInstradamento,
  beni: number,
  oggi: Date = new Date(),
  bene: BeneInstradamento | null = null,
): Instradamento | null {
  if (!Number.isFinite(beni) || beni <= 0) return null;

  for (const c of canali) {
    if (!c.attivo || !reggeIlCliente(c, cliente, beni, oggi) || !reggeIlBene(c, bene)) continue;

    // Una tabella che non esiste fa saltare il canale: niente ripiego su un altro listino
    const tabella = tabellaSeEsiste(c.tabella);
    if (!tabella) continue;

    // Importi ai centesimi: 1.000,07 + 50 in virgola mobile da' 1050.0700000000002
    const importoBeni = Number(beni.toFixed(2));
    const maggiorazione = Math.round((importoBeni * c.maggiorazionePerc) / 100);
    const imponibile = Number((importoBeni + maggiorazione).toFixed(2));
    if (!tabella.quotabile(imponibile)) continue;

    // Il coefficiente e' quello della fascia dell'imponibile maggiorato, non dei soli beni
    const rate: RataDurata[] = [];
    for (const durata of tabella.durateDisponibili(imponibile)) {
      const coeff = tabella.coefficiente(imponibile, durata);
      if (coeff !== null) rate.push({ durata, canone: canoneDaCoefficiente(imponibile, coeff) });
    }
    if (rate.length === 0) continue;

    return {
      canale: c.canale,
      beni: importoBeni,
      maggiorazione,
      imponibile,
      rate,
      daConfermare: c.canale === 'econocom',
      nota: tabella.nota ?? null,
      richiedeProvvisorio: c.sogliaProvvisorio != null && beni > c.sogliaProvvisorio,
    };
  }
  return null;
}

/**
 * Quello che il commerciale e il referente possono vedere di un instradamento:
 * le rate, la nota delle condizioni e i due avvisi. Niente canale, niente beni,
 * niente maggiorazione, niente imponibile (la loro differenza e' la maggiorazione).
 * E' l'unica forma con cui un instradamento esce verso un ruolo diverso dall'admin.
 */
export function vistaCommerciale(i: Instradamento): {
  rate: RataDurata[];
  nota: string | null;
  daConfermare: boolean;
  richiedeProvvisorio: boolean;
} {
  return {
    rate: i.rate.map(({ durata, canone }) => ({ durata, canone })),
    nota: i.nota,
    daConfermare: i.daConfermare,
    richiedeProvvisorio: i.richiedeProvvisorio,
  };
}
