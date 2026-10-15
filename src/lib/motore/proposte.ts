// Il motore delle proposte: dall'importo e dai numeri di bilancio alle proposte
// di noleggio operativo e di leasing finanziario.
//
// ATTENZIONE — FILE SERVER-ONLY: legge i coefficienti del noleggio. In uscita
// vanno solo canoni, rate e totali, mai coefficienti, fasce o sigle di tabella.
//
// Un solo motore per tutti i numeri. Schermo, business plan e PDF leggono da
// qui: il preventivo Tualat del 30/09/2026 sul tool Marotta aveva due motori e
// mostrava due canoni diversi per lo stesso noleggio.
//
// La credit policy e' quella di src/lib/credit-policy.ts, come sul tool Marotta:
//  - verde: proposte a condizioni standard
//  - giallo: il markup moltiplica canoni e rate; l'anticipo richiesto diventa il
//    minimo del leasing, mentre il noleggio resta a zero anticipo per regola e
//    lo dice con un avviso
//  - rosso: nessuna proposta, la pratica va istruita da MCF
//
// Il leasing usa il modello vero del partner (src/data/leasing.ts), allo
// spread medio commerciale della variante fornitori. Sotto la soglia della
// carrozzeria il leasing non si propone.

import type { DatiCredito, EsitoCredito } from '../credit-policy';
import { getTabella, type TabellaCanoni } from '../tabelle-canoni';
import type { LeasingEsterno } from '../prospetti-pv';
import {
  calcolaRataLeasingPartner,
  getCondizioneFornitori,
  type PartnerLeasing,
} from '../../data/leasing';
import { partnerLeasingDi, type Carrozzeria } from './carrozzeria';
import type { EsitoLocatore, StatoEventi } from './semaforo-locatore';
import { valuta } from './valutazione';

/** Anticipo di partenza del leasing, come sul tool Marotta e sul simulatore leasing */
export const LEASING_ANTICIPO_BASE = 10;
/** Riscatto finale del leasing */
export const LEASING_RISCATTO = 1;
/** Durate del leasing proposte, filtrate su quelle che il partner ammette */
export const DURATE_LEASING_MOTORE = [36, 48, 60, 72, 84];

const r2 = (v: number) => Math.round(v * 100) / 100;
const euroTesto = (n: number) =>
  Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions);

export interface PropostaNoleggio {
  durata: number;
  canone: number;
  riscattoPerc: number;
  riscatto: number;
  /** canoni + riscatto */
  totale: number;
}

export interface EsitoProposte {
  importo: number;
  /** 'verde' | 'giallo' | 'rosso', oppure i quattro colori del locatore */
  semaforo: string;
  credito: EsitoCredito | null;
  locatore: EsitoLocatore | null;
  /** Maggiorazione applicata a canoni e rate, in % */
  markup: number;
  /** Anticipo minimo chiesto dalla valutazione, in % */
  anticipoRichiesto: number;
  /** Rosso: nessuna proposta */
  bloccate: boolean;
  noleggio: PropostaNoleggio[];
  leasing: LeasingEsterno[];
  /** Perche' il leasing non c'e', se non c'e' */
  motivoNoLeasing: string | null;
  /** Perche' il noleggio non c'e', se non c'e' */
  motivoNoNoleggio: string | null;
  /** Condizioni del listino del noleggio (fatturazione, assicurazione), senza nomi */
  notaNoleggio: string | null;
  avvisi: string[];
}

/**
 * Tabella del noleggio con il markup gia' dentro il coefficiente. Cosi' il
 * canone maggiorato e' lo stesso ovunque lo si calcoli: proposte, business plan
 * e coefficienti che viaggiano verso il microservizio PDF.
 */
export function tabellaConMarkup(t: TabellaCanoni, markup: number): TabellaCanoni {
  if (!markup) return t;
  const k = 1 + markup / 100;
  return {
    ...t,
    coefficiente: (importo, durata) => {
      const c = t.coefficiente(importo, durata);
      return c == null ? null : c * k;
    },
  };
}

/** Il leasing del partner su una durata, gia' arrotondato e maggiorato */
export function leasingPartner(
  partner: PartnerLeasing,
  importo: number,
  durata: number,
  anticipoPerc: number,
  markup: number,
): LeasingEsterno | null {
  if (!partner.durateAmmesse.includes(durata)) return null;
  if (importo < partner.importoMin || importo > partner.importoMax) return null;
  const condizione = getCondizioneFornitori(partner, durata);
  const riscattoPerc = Math.min(LEASING_RISCATTO, partner.riscattoMaxPerDurata[durata] ?? LEASING_RISCATTO);
  const r = calcolaRataLeasingPartner(partner, importo, durata, anticipoPerc, riscattoPerc, condizione.id);
  const rata = r2(r.rataMensile * (1 + markup / 100));
  const anticipo = r2(r.anticipo);
  const riscatto = r2(r.riscatto);
  const totale = r2(anticipo + rata * r.numRate + riscatto + r.speseIstruttoria + r.speseIncassoRata * r.numRate);
  return {
    durata,
    rata,
    numRate: r.numRate,
    anticipoPerc,
    anticipo,
    riscattoPerc,
    riscatto,
    speseIstruttoria: r.speseIstruttoria,
    speseIncassoRata: r.speseIncassoRata,
    totale,
  };
}

/** Le condizioni del leasing per una carrozzeria, dato l'esito della valutazione */
export function condizioniLeasing(carrozzeria: Carrozzeria, credito: { anticipo: number; markup: number }) {
  return {
    partner: partnerLeasingDi(carrozzeria),
    anticipoPerc: Math.max(LEASING_ANTICIPO_BASE, credito.anticipo),
    markup: credito.markup,
  };
}

/** I numeri di bilancio salvati con la ricerca, senza importo */
export type DatiBilancio = Omit<DatiCredito, 'importo' | 'oggi'>;

export function calcolaProposte(
  importo: number,
  bilancio: DatiBilancio,
  carrozzeria: Carrozzeria,
  oggi?: Date,
  eventi: StatoEventi = 'non-avviata',
): EsitoProposte {
  const v = valuta(carrozzeria, bilancio, importo, eventi, oggi);
  const avvisi: string[] = [];
  const base: EsitoProposte = {
    importo,
    semaforo: v.semaforo,
    credito: v.credito,
    locatore: v.locatore,
    markup: v.markup,
    anticipoRichiesto: v.anticipo,
    bloccate: false,
    noleggio: [],
    leasing: [],
    motivoNoLeasing: null,
    motivoNoNoleggio: null,
    notaNoleggio: getTabella(carrozzeria.tabellaCanoni).nota ?? null,
    avvisi,
  };

  if (v.blocca) {
    return {
      ...base,
      bloccate: true,
      motivoNoNoleggio: 'La valutazione del cliente non regge una proposta standard.',
      motivoNoLeasing: 'La valutazione del cliente non regge una proposta standard.',
    };
  }

  // --- noleggio operativo ---
  const tabella = tabellaConMarkup(getTabella(carrozzeria.tabellaCanoni), v.markup);
  if (!tabella.quotabile(importo)) {
    base.motivoNoNoleggio =
      `Il noleggio si quota da ${euroTesto(tabella.importoMin)} a ${euroTesto(tabella.importoMax)} euro.`;
  } else {
    for (const durata of tabella.durateDisponibili(importo)) {
      const canone = r2((importo * tabella.coefficiente(importo, durata)!) / 100);
      const riscattoPerc = tabella.riscatto[durata] ?? 0;
      const riscatto = r2((importo * riscattoPerc) / 100);
      base.noleggio.push({ durata, canone, riscattoPerc, riscatto, totale: r2(canone * durata + riscatto) });
    }
    if (v.anticipo > 0) {
      avvisi.push(
        `La valutazione chiede un anticipo del ${v.anticipo}%: il noleggio parte da zero anticipo. ` +
        'Proponi il leasing o senti Mediocredito Facile prima di presentare il canone.',
      );
    }
  }

  // --- leasing finanziario ---
  if (!carrozzeria.leasing) {
    base.motivoNoLeasing = 'Su questo portale si propone solo il noleggio operativo.';
  } else {
    const { partner, anticipoPerc, markup } = condizioniLeasing(carrozzeria, v);
    if (carrozzeria.sogliaLeasing > 0 && importo < carrozzeria.sogliaLeasing) {
      base.motivoNoLeasing = `Sotto ${euroTesto(carrozzeria.sogliaLeasing)} euro il leasing non si propone su questo catalogo.`;
    } else if (importo < partner.importoMin) {
      base.motivoNoLeasing = `Sotto ${euroTesto(partner.importoMin)} euro il leasing non si fa.`;
    } else {
      for (const durata of DURATE_LEASING_MOTORE) {
        const l = leasingPartner(partner, importo, durata, anticipoPerc, markup);
        if (l) base.leasing.push(l);
      }
      if (anticipoPerc > LEASING_ANTICIPO_BASE) {
        avvisi.push(`Anticipo del leasing portato al ${anticipoPerc}% dalla valutazione del cliente.`);
      }
    }
  }

  if (v.markup > 0) {
    avvisi.push(`Canoni e rate maggiorati dello ${v.markup.toLocaleString('it-IT')}% dalla valutazione del cliente.`);
  }
  return base;
}
