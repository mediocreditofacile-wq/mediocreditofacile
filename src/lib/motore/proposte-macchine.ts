// Il settore "macchine" del motore dei portali: macchina, accessori della sua
// famiglia, consegna prevista e durata. Canoni sulla tabella del fornitore e su
// quella affiancata (la Grace Period di Duplex), date di pagamento e costi
// accessori del noleggio.
//
// ATTENZIONE — FILE SERVER-ONLY: riceve le tabelle dei canoni. In uscita solo
// canoni, date e importi: mai coefficienti, fasce o sigle di tabella.
//
// I costi accessori (istruttoria, polizza, riscatto) sono quelli del noleggio
// delle macchine per la pulizia (src/data/duplex-costi.ts). Con un produttore di
// un'altra categoria la percentuale della polizza diventa una voce di
// configurazione (spec, paragrafo 15).

import { canoneDaCoefficiente, polizzaAnnua, speseIstruttoria, totaleContratto } from '../../data/duplex-costi';
import { calendarioPagamenti, type CalendarioPagamenti } from '../duplex-calendario';
import type { TabellaCanoni } from '../tabelle-canoni';
import type { Carrozzeria, VoceCatalogo } from './carrozzeria';
import type { DatiCreditoMotore } from './merito';
import type { DatiBilancio, EsitoProposte } from './proposte';
import type { StatoEventi } from './semaforo-locatore';
import { valuta } from './valutazione';

export interface RigaAccessorio { codice: string; nome: string; prezzo: number; quantita: number }

export interface Configurazione {
  macchina: VoceCatalogo;
  famiglia: string;
  accessori: RigaAccessorio[];
  /** Macchina piu' accessori, al prezzo di catalogo */
  listino: number;
  /** "Ultrax 45 + 2x Spazzola microfibra bianca" */
  descrizione: string;
}

export interface RigaMacchine {
  durata: number;
  canone: number | null;
  canoneAlternativo: number | null;
  riscattoPerc: number;
  riscatto: number;
  /** Canoni + istruttoria + riscatto, polizza esclusa */
  totale: number | null;
  totaleAlternativo: number | null;
}

export interface Pagamento {
  canone: number;
  trimestre: number;
  inizioLocazione: string;
  primaFattura: string;
  fineContratto: string;
  giorniProRata: number;
  costoGiornaliero: number;
  importoProRata: number;
  /** Pro rata e primo trimestre in coda al contratto (Grace Period) */
  inCoda: boolean;
  totale: number;
}

export interface EsitoMacchine {
  macchina: { codice: string; nome: string };
  accessori: RigaAccessorio[];
  descrizione: string;
  listino: number;
  prezzo: number;
  durata: number;
  /** AAAA-MM-GG */
  consegna: string;
  nomeAlternativa: string | null;
  righe: RigaMacchine[];
  tradizionale: Pagamento | null;
  alternativa: Pagamento | null;
  istruttoria: number;
  polizzaAnnua: number;
  riscatto: number;
  riscattoPerc: number;
  motivoFuoriListino: string | null;
}

/** Come si chiama, a video e nei documenti, la tabella affiancata */
export const NOMI_ALTERNATIVA: Record<string, string> = { 'grace-duplex': 'Grace Period' };

const r2 = (v: number) => Math.round(v * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const euroTesto = (n: number) => n.toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions);

/**
 * La macchina e gli accessori scelti, ricontrollati sul catalogo attivo: stessa
 * famiglia, multipli del passo, non oltre il massimo. Il browser propone, il
 * server decide: un accessorio spento dal Pannello non passa.
 */
export function validaConfigurazione(
  voci: VoceCatalogo[],
  input: { codice: string; accessori: Record<string, unknown> },
): { ok: true; conf: Configurazione } | { ok: false; error: 'voce_non_trovata' | 'accessorio_non_valido' } {
  const macchina = voci.find((v) => v.codice === input.codice && v.attributi.tipo !== 'accessorio' && v.attivo);
  if (!macchina) return { ok: false, error: 'voce_non_trovata' };
  const famiglia = String(macchina.attributi.famiglia ?? macchina.nome);

  const accessori: RigaAccessorio[] = [];
  for (const [codice, q] of Object.entries(input.accessori ?? {})) {
    const quantita = Number(q);
    if (quantita === 0) continue;
    const a = voci.find((v) => v.codice === codice && v.attributi.tipo === 'accessorio' && v.attivo);
    const passo = Number(a?.attributi.passo) || 1;
    const massimo = Number(a?.attributi.massimo) || 1;
    if (
      !a || a.attributi.famiglia !== famiglia || !Number.isInteger(quantita) ||
      quantita < 0 || quantita % passo !== 0 || quantita > massimo
    ) {
      return { ok: false, error: 'accessorio_non_valido' };
    }
    accessori.push({ codice, nome: a.nome, prezzo: a.prezzo, quantita });
  }

  const listino = r2(macchina.prezzo + accessori.reduce((s, a) => s + a.prezzo * a.quantita, 0));
  const descrizione = [macchina.nome, ...accessori.map((a) => `${a.quantita}x ${a.nome}`)].join(' + ');
  return { ok: true, conf: { macchina, famiglia, accessori, listino, descrizione } };
}

/**
 * La consegna prevista: AAAA-MM-GG valida e entro un anno da oggi, avanti o
 * indietro (la macchina puo' essere gia' consegnata). Altrimenti oggi.
 */
export function dataConsegna(s: unknown, oggi: Date = new Date()): Date {
  const base = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return base;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const valida = d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  const vicina = Math.abs(d.getTime() - base.getTime()) <= 366 * 86_400_000;
  return valida && vicina ? d : base;
}

function pagamento(cal: CalendarioPagamenti, canone: number, prezzo: number, durata: number): Pagamento {
  return {
    canone,
    trimestre: cal.importoTrimestre,
    inizioLocazione: iso(cal.inizioLocazione),
    primaFattura: iso(cal.primaFattura),
    fineContratto: iso(cal.fineContratto),
    giorniProRata: cal.giorniProRata,
    costoGiornaliero: cal.costoGiornaliero,
    importoProRata: cal.importoProRata,
    inCoda: cal.grace,
    totale: totaleContratto(prezzo, canone, durata),
  };
}

export function calcolaMacchine(
  conf: Configurazione,
  prezzo: number,
  durata: number,
  consegna: Date,
  tab: TabellaCanoni,
  alt: TabellaCanoni | null,
): EsitoMacchine {
  const canoneSu = (t: TabellaCanoni | null, d: number) => {
    const c = t?.coefficiente(prezzo, d);
    return c == null ? null : canoneDaCoefficiente(prezzo, c);
  };
  const righe: RigaMacchine[] = tab.durate.map((d) => {
    const canone = canoneSu(tab, d);
    const canoneAlternativo = canoneSu(alt, d);
    const riscattoPerc = tab.riscatto[d] ?? 0;
    return {
      durata: d,
      canone,
      canoneAlternativo,
      riscattoPerc,
      riscatto: r2((prezzo * riscattoPerc) / 100),
      totale: canone == null ? null : totaleContratto(prezzo, canone, d),
      totaleAlternativo: canoneAlternativo == null ? null : totaleContratto(prezzo, canoneAlternativo, d),
    };
  });
  const scelta = righe.find((r) => r.durata === durata) ?? righe[righe.length - 1];
  const tradizionale = scelta.canone == null
    ? null
    : pagamento(calendarioPagamenti(consegna, scelta.canone, scelta.durata, 'tradizionale'), scelta.canone, prezzo, scelta.durata);
  const alternativa = scelta.canoneAlternativo == null
    ? null
    : pagamento(calendarioPagamenti(consegna, scelta.canoneAlternativo, scelta.durata, 'grace'), scelta.canoneAlternativo, prezzo, scelta.durata);
  const quotabile = righe.some((r) => r.canone != null || r.canoneAlternativo != null);
  const massimo = Math.max(tab.importoMax, alt?.importoMax ?? 0);

  return {
    macchina: { codice: conf.macchina.codice, nome: conf.macchina.nome },
    accessori: conf.accessori,
    descrizione: conf.descrizione,
    listino: conf.listino,
    prezzo,
    durata: scelta.durata,
    consegna: iso(consegna),
    nomeAlternativa: alt ? NOMI_ALTERNATIVA[alt.id] ?? 'Tabella alternativa' : null,
    righe,
    tradizionale,
    alternativa,
    istruttoria: speseIstruttoria(prezzo),
    polizzaAnnua: polizzaAnnua(prezzo),
    riscatto: scelta.riscatto,
    riscattoPerc: scelta.riscattoPerc,
    motivoFuoriListino: quotabile
      ? null
      : `Il noleggio si quota da ${euroTesto(tab.importoMin)} a ${euroTesto(massimo)} euro.`,
  };
}

/** Il semaforo di una proposta fatta prima della verifica della partita IVA */
export const SEMAFORO_NON_VERIFICATO = 'non-verificato';

/**
 * L'esito nella forma del motore: storico, pratica e mail lo leggono come gli
 * altri settori. Il semaforo informa e non cambia niente; il noleggio elencato e'
 * quello della tabella principale. Senza bilancio (cliente non ancora verificato)
 * i canoni sono gli stessi e il semaforo non c'e'.
 */
export function esitoDaMacchine(
  m: EsitoMacchine,
  bilancio: (DatiBilancio & Partial<DatiCreditoMotore>) | null,
  k: Carrozzeria,
  tab: TabellaCanoni,
  eventi: StatoEventi,
  oggi?: Date,
): EsitoProposte {
  const v = bilancio
    ? valuta(k, bilancio, m.prezzo, eventi, oggi)
    : { semaforo: SEMAFORO_NON_VERIFICATO, credito: null, locatore: null };
  const avvisi: string[] = [];
  if (v.semaforo === 'rosso') {
    avvisi.push('Valutazione difficile: prima di presentare il canone carica la pratica, la guarda Mediocredito Facile.');
  }
  return {
    importo: m.prezzo,
    semaforo: v.semaforo,
    credito: v.credito,
    locatore: v.locatore,
    markup: 0,
    anticipoRichiesto: 0,
    bloccate: false,
    noleggio: m.righe
      .filter((r) => r.canone != null)
      .map((r) => ({ durata: r.durata, canone: r.canone!, riscattoPerc: r.riscattoPerc, riscatto: r.riscatto, totale: r2(r.canone! * r.durata + r.riscatto) })),
    leasing: [],
    motivoNoLeasing: 'Su questo portale si propone solo il noleggio operativo.',
    motivoNoNoleggio: m.motivoFuoriListino,
    notaNoleggio: tab.nota ?? null,
    avvisi,
  };
}
