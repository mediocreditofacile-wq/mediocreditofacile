// Budget Openapi per strumento: chi paga una chiamata, come si chiama il suo
// budget, cosa si dice quando finisce e quando si riapre.
//
// Modulo puro e client-safe: niente I/O, niente segreti. Lo usano i server
// (openapi.ts, gli endpoint) e la pagina /tools/valutazione, che con
// riepilogoSpesa() mostra la spesa del mese. I tipi da openapi.ts sono import
// di soli tipi: spariscono in build e non portano il client Openapi nel browser.
//
// Nasce il 20/10/2026. Fino a quel giorno tool di valutazione e tool Marotta
// scrivevano nella stessa sorgente 'sito', e il tetto da 30 euro pensato per la
// ricerca estera di Marotta si riempiva con le schede, le verifiche e le visure
// del tool interno: dal 14/10 la ricerca estera era ferma ovunque, anche su
// /tools/valutazione. Da allora ogni strumento ha la sua cartella nel registro.

import type { Consumo, ConsumoParziale, Sorgente } from './openapi';

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** '2026-10' -> 'ottobre 2026' */
export function meseLeggibile(mese: string): string {
  const [a, m] = mese.split('-').map(Number);
  return `${MESI[m - 1] ?? mese} ${a}`;
}

/**
 * Giorno in cui il budget del mese si riapre: il primo del mese dopo.
 * Il registro divide i mesi sull'orologio del server (UTC su Vercel), quindi in
 * Italia il conto riparte all'una o alle due di notte di quel giorno.
 */
export function riaperturaBudget(mese: string): string {
  const [a, m] = mese.split('-').map(Number);
  const anno = m === 12 ? a + 1 : a;
  const prossimo = m === 12 ? 1 : m + 1;
  return `1° ${MESI[prossimo - 1]} ${anno}`;
}

/** Il budget di chi, detto come lo legge una persona */
export function nomeBudget(sorgente: Sorgente): string {
  if (sorgente === 'marotta') return 'del tool Marotta';
  if (sorgente === 'valutazione') return 'del tool di valutazione';
  if (sorgente === 'fiera') return 'della pagina /fiera';
  if (sorgente === 'simulatore') return 'del simulatore di noleggio';
  if (sorgente.startsWith('carrozzeria/')) return `del portale ${sorgente.slice('carrozzeria/'.length)}`;
  return 'degli strumenti MCF';
}

const euro = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface TettoSuperato {
  sorgente: Sorgente;
  /** Mese del registro, 'AAAA-MM' */
  mese: string;
  /** 'euro' per i servizi a pagamento, 'ricerche' per quelli a franchigia contati a pezzi */
  tipo: 'euro' | 'ricerche';
  speso: number;
  tetto: number;
}

/**
 * Il messaggio per chi si vede fermare: quale budget e' finito, quanto si e'
 * speso e quando si riapre. Prima diceva solo "Ricerche esaurite per questo
 * mese", che non permetteva di capire di chi fosse il budget.
 */
export function messaggioTetto(t: TettoSuperato): string {
  const quando = meseLeggibile(t.mese).split(' ')[0];
  const riapre = riaperturaBudget(t.mese);
  if (t.tipo === 'ricerche') {
    return `Ricerche Openapi ${nomeBudget(t.sorgente)} esaurite: a ${quando} ne sono state fatte ${t.speso} su ${t.tetto}. Si riaprono il ${riapre}.`;
  }
  return `Budget Openapi ${nomeBudget(t.sorgente)} esaurito: a ${quando} spesi ${euro(t.speso)} su ${euro(t.tetto)}. Si riapre il ${riapre}.`;
}

/**
 * Chi paga una ricerca estera. /api/azienda-estera serve due strumenti: il tool
 * Marotta, che chiama senza credenziali, e /tools/valutazione, che manda la sua
 * chiave come bearer. La chiave e' la stessa che autorizza le schede da 0,81
 * euro, quindi chi la conosce non scavalca niente che non potesse gia' fare.
 * Una chiave sbagliata non da' errore: si paga come Marotta.
 */
export function sorgenteRicercaEstera(
  authorization: string | null,
  chiaveValutazione: string | undefined,
): 'valutazione' | 'marotta' {
  return chiaveValutazione && authorization === `Bearer ${chiaveValutazione}` ? 'valutazione' : 'marotta';
}

export interface RiepilogoSpesa {
  mese: string;
  meseLeggibile: string;
  /** Il tool di valutazione: schede, verifiche, documenti ufficiali, ricerche estere */
  valutazione: { totale: number; chiamate: number };
  marotta: number;
  fiera: number;
  /** La verifica del cliente sul simulatore di noleggio operativo */
  simulatore: number;
  /** Somma di tutte le carrozzerie del motore dei portali */
  portali: number;
  /**
   * Quello che non e' di nessuno strumento: le voci registrate prima della
   * separazione (cartella storica 'sito') e la differenza fra il fatturato del
   * wallet e il registro, che e' fatta di prove e di scarti di listino.
   */
  nonAttribuiti: number;
  /** Il conto del mese: addebitato dal wallet piu' registrato e non ancora fatturato */
  conto: number;
}

const tondo = (n: number) => Math.round(n * 100) / 100;

/** La spesa del mese ridotta a quello che serve alla pagina della valutazione. */
export function riepilogoSpesa(c: Consumo): RiepilogoSpesa {
  const per = (c.perSorgente ?? {}) as Record<string, ConsumoParziale | undefined>;
  const portali = Object.entries(per)
    .filter(([k]) => k.startsWith('carrozzeria/'))
    .reduce((s, [, v]) => s + (v?.totale ?? 0), 0);
  return {
    mese: c.mese,
    meseLeggibile: meseLeggibile(c.mese),
    valutazione: { totale: per.valutazione?.totale ?? 0, chiamate: per.valutazione?.chiamate ?? 0 },
    marotta: per.marotta?.totale ?? 0,
    fiera: per.fiera?.totale ?? 0,
    simulatore: per.simulatore?.totale ?? 0,
    portali: tondo(portali),
    nonAttribuiti: per.sito?.totale ?? 0,
    conto: c.totale,
  };
}
