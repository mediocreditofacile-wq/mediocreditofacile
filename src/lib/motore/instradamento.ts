// Instradamento della distinta: dal cliente e dal totale dei beni al canale che
// quota, con la maggiorazione del canale e la rata per ogni durata.
//
// ATTENZIONE — FILE SERVER-ONLY: legge i coefficienti dei locatori. Il risultato
// porta il canale e la maggiorazione, che il commerciale e il referente non
// vedono mai: chi lo usa deve toglierli prima di rispondere a un ruolo diverso
// dall'admin MCF. Qui non esce nessun coefficiente, nessuna fascia, nessuna sigla
// di tabella.
//
// Il portale scorre i canali attivi nell'ordine della configurazione (l'ordine e'
// la priorita') e prende il primo che il cliente e l'importo soddisfano. Un dato
// del cliente che manca non soddisfa mai una condizione: senza prova non si passa.
// Senza un canale che regga il risultato e' null e la proposta non esce; non si
// ripiega mai su un altro listino.

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

export interface RataDurata {
  durata: number;
  /** Canone mensile in euro, ai centesimi */
  canone: number;
}

export interface Instradamento {
  canale: IdCanale;
  /** Il totale dei beni del commerciale */
  beni: number;
  /** Maggiorazione del canale, arrotondata all'euro. Zero se il canale non ne ha */
  maggiorazione: number;
  /** beni + maggiorazione: l'importo che il locatore quota */
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
  // Il listino Pioneer non ha una data di lettura: finche' manca, Grenke non si sceglie
  if (c.canale === 'grenke' && PIONEER_LETTO === null) return false;

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
 * Sceglie il canale e calcola le rate. `oggi` serve agli anni di attivita' e si
 * passa dai test; la data e' quella locale.
 */
export function instrada(
  canali: CanaleConfig[],
  cliente: ClienteInstradamento,
  beni: number,
  oggi: Date = new Date(),
): Instradamento | null {
  if (!Number.isFinite(beni) || beni <= 0) return null;

  for (const c of canali) {
    if (!c.attivo || !reggeIlCliente(c, cliente, beni, oggi)) continue;

    // Una tabella che non esiste fa saltare il canale: niente ripiego su un altro listino
    const tabella = tabellaSeEsiste(c.tabella);
    if (!tabella) continue;

    const maggiorazione = Math.round((beni * c.maggiorazionePerc) / 100);
    const imponibile = beni + maggiorazione;
    if (!tabella.quotabile(imponibile)) continue;

    // Il coefficiente e' quello della fascia dell'imponibile maggiorato, non dei soli beni
    const rate: RataDurata[] = [];
    for (const durata of tabella.durateDisponibili(imponibile)) {
      const coeff = tabella.coefficiente(imponibile, durata);
      if (coeff !== null) rate.push({ durata, canone: Math.round(imponibile * coeff) / 100 });
    }
    if (rate.length === 0) continue;

    return {
      canale: c.canale,
      beni,
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
