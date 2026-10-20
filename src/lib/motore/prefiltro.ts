// Il prefiltro, per i fornitori del motore impostati con regole_semaforo =
// 'prefiltro' (oggi Led Office). Le undici regole emerse da quattro mesi di pratiche
// e rifiuti di Emme 2, decise da Alberto il 19/10/2026 (spec
// mcf_spec-ledoffice-motore_v1, paragrafo 5).
//
// Modulo puro: niente rete, niente database. Riceve i dati della ricerca, i segnali
// che il server ha gia' letto (cliente segnalato, pratica recente) e, quando c'e',
// la distinta. Non cambia mai un numero: decide se la proposta esce e cosa deve
// chiedere o motivare il commerciale. Mai "approvato", mai il nome di un locatore.
//
// L'esito e' gia' quello che puo' vedere il commerciale: della pratica recente
// resta solo il testo generico, senza data, canale ne' fornitore; del cliente
// segnalato mai il motivo. I dettagli li scrive il server nella mail a MCF.

import type { Categoria } from './config-distinta';
import type { DatiCreditoMotore } from './merito';
import { classeForma, mesiDiAttivita, TESTO_EVENTI, type StatoEventi } from './semaforo-locatore';

export type ColorePrefiltro = 'verde' | 'giallo' | 'rosso' | 'bloccato';

export const ETICHETTA_PREFILTRO: Record<ColorePrefiltro, string> = {
  verde: 'In linea con il prefiltro',
  giallo: 'Da completare',
  rosso: 'Non presentabile dal portale',
  bloccato: 'Non lavorabile dal portale',
};

/**
 * Codici della forma giuridica del Registro. RS e SR confermati il 20/10/2026 sulle
 * schede gia' pagate nella cache Blob (openapi/aziende/, nessuna chiamata Openapi):
 * cinque SRLS con RS "SOCIETA' A RESPONSABILITA' LIMITATA SEMPLIFICATA", ventitre
 * SRL con SR "SOCIETA' A RESPONSABILITA' LIMITATA". SU (SRL con unico socio) non
 * compare in nessuna scheda in cache: resta come da piano, NON confermato su una
 * scheda vera.
 */
export const FORME_SRLS = ['RS'];
export const FORME_SRL_ORDINARIA = ['SR', 'SU'];
/** Sotto questo capitale sociale la SRL ordinaria esce gialla (regola 5) */
export const CAPITALE_MINIMO_SRL = 10_000;
/** Mesi dalla costituzione (regola 1) */
export const MESI_MINIMI = 24;
/** Bilanci depositati con ricavi, per le societa' di capitali (regola 1) */
export const BILANCI_MINIMI = 2;
/** Caratteri minimi di una motivazione, dopo il trim: "ok" o "vedi sopra" non motivano niente */
export const MOTIVAZIONE_MINIMA = 10;

/** I testi fissi della spec, parola per parola */
export const TESTI_PREFILTRO = {
  bloccato: 'Cliente non lavorabile dal portale. Senti Mediocredito Facile.',
  centraleRischi: 'Centrale Rischi: da verificare da Mediocredito Facile',
  praticaRecente: 'Pratica recente presso Mediocredito Facile: da verificare',
  altriFornitori: 'Contratti aperti presso altri fornitori: da verificare da Mediocredito Facile',
  ledwall: 'Installazione fissa nei locali del cliente, non su suolo pubblico né in concessione comunale',
  dichiarazioni: 'Chiedi al cliente le ultime due dichiarazioni dei redditi.',
  eventiDaVerificare: 'Eventi negativi: da verificare da Mediocredito Facile',
} as const;

export interface DatiPrefiltro {
  /** Codice della forma giuridica del Registro: SR, RS, DI, SN... */
  formaCodice: string | null;
  /** true attiva, false non attiva o in liquidazione, null non disponibile */
  attiva: boolean | null;
  cessata: boolean;
  /** AAAA-MM-GG */
  inizioAttivita: string | null;
  /** Anni con ricavi oltre zero. Null = storico non disponibile; [] = storico presente e vuoto */
  bilanciConRicavi: number[] | null;
  patrimonioNetto: number | null;
  utile: number | null;
  capitaleSociale: number | null;
  /** Lo zero dichiarato e' un dato, non un dato mancante */
  dipendenti: number | null;
  /** Puntato, come arriva dalla scheda: 62.01.00 */
  atecoCodice: string | null;
}

/** Dove MCF ha gia' visto la stessa partita IVA negli ultimi sei mesi. Solo per il server e la mail a MCF. */
export interface PraticaTrovata {
  /** AAAA-MM-GG */
  data: string;
  canale: string | null;
  fornitore: string | null;
  fonte: 'motore' | 'portale' | 'esterna';
}

/** Quello che il server ha letto prima di chiamare il prefiltro */
export interface SegnaliPrefiltro {
  segnalato: { motivo: string; effetto: 'blocco' | 'rosso' } | null;
  praticaRecente: PraticaTrovata | null;
}

export interface DistintaPrefiltro {
  righe: { categoria: string; quantita: number }[];
  /** Sede legale, una delle unita' locali, oppure un altro indirizzo */
  consegna: 'sede' | 'unita' | 'altro';
  /** La spunta sull'installazione del LEDwall (TESTI_PREFILTRO.ledwall) */
  ledwallConfermato: boolean;
  /** Per chiave di MotivazioneRichiesta: 'perdita', 'addetti', 'riga-0'... */
  motivazioni: Record<string, string>;
}

export interface CriterioPrefiltro { chiave: string; nome: string; valore: string; ok: boolean | null }

export interface MotivazioneRichiesta {
  /** riga-N: N e' l'indice della riga nella distinta */
  chiave: 'perdita' | 'addetti' | `riga-${number}`;
  testo: string;
}

export interface EsitoPrefiltro {
  semaforo: ColorePrefiltro;
  etichetta: string;
  /** Le spiegazioni sotto l'etichetta, coi testi fissi della spec */
  righe: string[];
  criteri: CriterioPrefiltro[];
  /** Eventi ancora in verifica: il colore puo' cambiare */
  provvisorio: boolean;
  eventi: StatoEventi;
  /** Le motivazioni da scrivere prima del preventivo */
  motivazioniRichieste: MotivazioneRichiesta[];
  /** Le chiavi delle motivazioni richieste che mancano o sono troppo corte */
  motivazioniMancanti: string[];
  /** C'e' un LEDwall in distinta e manca la spunta sull'installazione */
  ledwallMancante: boolean;
  /** Niente rata e niente PDF */
  bloccaProposta: boolean;
}

/**
 * Dai dati salvati della ricerca a quelli del prefiltro. Le ricerche fatte prima del
 * 20/10/2026 non hanno capitale, dipendenti, storico dei bilanci ne' ATECO: restano
 * null, mai zero, cosi' il prefiltro li legge come "non disponibili".
 */
export function datiPrefiltro(d: Partial<DatiCreditoMotore>): DatiPrefiltro {
  // Ricavi, patrimonio e utile tutti a zero: e' un bilancio non depositato, non una
  // societa' in pareggio (stessa regola di datiLocatore in merito.ts)
  const tuttoZero = d.fatturato === 0 && (d.patrimonioNetto ?? 0) === 0 && (d.utile ?? 0) === 0;
  return {
    formaCodice: d.formaCodice ?? null,
    attiva: d.attiva ?? null,
    cessata: d.cessata ?? false,
    inizioAttivita: d.inizioAttivita ?? null,
    bilanciConRicavi: Array.isArray(d.bilanciConRicavi) ? [...d.bilanciConRicavi] : null,
    patrimonioNetto: tuttoZero ? null : d.patrimonioNetto ?? null,
    utile: tuttoZero ? null : d.utile ?? null,
    capitaleSociale: d.capitaleSociale ?? null,
    dipendenti: d.dipendenti ?? null,
    atecoCodice: d.atecoCodice?.trim() || null,
  };
}

/** Una motivazione conta da MOTIVAZIONE_MINIMA caratteri, spazi esclusi in testa e in coda */
export function motivazioneValida(testo: unknown): boolean {
  return typeof testo === 'string' && testo.trim().length >= MOTIVAZIONE_MINIMA;
}

// --- formattazione -----------------------------------------------------------

const euro = (n: number) =>
  `${n.toLocaleString('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;
const dataIt = (iso: string) => iso.split('-').reverse().join('/');
const quanti = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

function anniBilanci(anni: number[]): string {
  if (anni.length === 0) return 'nessuno';
  if (anni.length === 1) return `solo il ${anni[0]}`;
  return anni.join(', ');
}

function nomeForma(codice: string, classe: ReturnType<typeof classeForma>): string {
  if (FORME_SRLS.includes(codice)) return 'SRL semplificata';
  if (FORME_SRL_ORDINARIA.includes(codice)) return 'SRL';
  if (classe === 'capitali') return 'società di capitali';
  if (classe === 'persone') return 'società di persone';
  if (classe === 'individuale') return 'impresa individuale';
  return 'non disponibile';
}

const NOME_CONSEGNA: Record<DistintaPrefiltro['consegna'], string> = {
  sede: 'sede legale',
  unita: 'unità locale',
  altro: 'altro indirizzo',
};

// --- il prefiltro ---------------------------------------------------------------

export function valutaPrefiltro(
  d: DatiPrefiltro,
  segnali: SegnaliPrefiltro,
  eventi: StatoEventi,
  categorie: Categoria[],
  distinta: DistintaPrefiltro | null,
  oggi: Date = new Date(),
): EsitoPrefiltro {
  // Regola 11, effetto blocco: vince su tutto. La scheda dice solo di sentire MCF,
  // senza criteri e senza righe fisse; il motivo lo vede MCF.
  if (segnali.segnalato?.effetto === 'blocco') {
    return {
      semaforo: 'bloccato',
      etichetta: ETICHETTA_PREFILTRO.bloccato,
      righe: [TESTI_PREFILTRO.bloccato],
      criteri: [],
      provvisorio: false,
      eventi,
      motivazioniRichieste: [],
      motivazioniMancanti: [],
      ledwallMancante: false,
      bloccaProposta: true,
    };
  }

  const classe = classeForma(d.formaCodice);
  const codice = String(d.formaCodice ?? '').trim().toUpperCase();
  const srls = FORME_SRLS.includes(codice);
  const srlOrdinaria = FORME_SRL_ORDINARIA.includes(codice);
  const capitali = classe === 'capitali';
  const senzaBilanci = classe === 'persone' || classe === 'individuale';
  const mesiLetti = d.inizioAttivita ? mesiDiAttivita(d.inizioAttivita, oggi) : null;
  const mesi = mesiLetti !== null && Number.isFinite(mesiLetti) ? mesiLetti : null;

  const criteri: CriterioPrefiltro[] = [];
  const righe: string[] = [];
  const motivazioni: MotivazioneRichiesta[] = [];
  // Il colore si decide regola per regola, non dagli ok: un criterio "non
  // disponibile" (ok null) a volte e' giallo, a volte no (capitale assente)
  let rosso = false;
  let giallo = false;

  // --- regole sul cliente ---

  // Stato: cessata o non attiva e' rosso; non disponibile e' da completare
  criteri.push({
    chiave: 'stato',
    nome: 'Stato',
    valore: d.cessata ? 'cessata' : d.attiva === null ? 'non disponibile' : d.attiva ? 'attiva' : 'non attiva',
    ok: d.cessata || d.attiva === false ? false : d.attiva === null ? null : true,
  });
  if (d.cessata || d.attiva === false) rosso = true;
  else if (d.attiva === null) giallo = true;

  // Regola 1, prima meta': almeno 24 mesi dalla costituzione, per ogni forma
  criteri.push({
    chiave: 'attivita',
    nome: 'Attività',
    valore: mesi === null
      ? 'data di inizio non disponibile'
      : `dal ${dataIt(d.inizioAttivita!)}, ${mesi >= MESI_MINIMI ? `${Math.floor(mesi / 12)} anni` : quanti(mesi, 'mese', 'mesi')}`,
    ok: mesi === null ? null : mesi >= MESI_MINIMI,
  });
  if (mesi === null) giallo = true;
  else if (mesi < MESI_MINIMI) rosso = true;

  // Regola 2: la SRLS e' gialla senza motivazione. Forma sconosciuta: da completare
  criteri.push({
    chiave: 'forma',
    nome: 'Forma giuridica',
    valore: nomeForma(codice, classe),
    ok: srls ? false : classe === 'non-classificata' ? null : true,
  });
  if (srls || classe === 'non-classificata') giallo = true;

  // Regola 1, seconda meta': due bilanci con ricavi. Ditte individuali e societa' di
  // persone non depositano bilanci: al loro posto le ultime due dichiarazioni, e il
  // criterio esce giallo invece che rosso (spec, paragrafo 5 e 13)
  const bilanci = d.bilanciConRicavi;
  if (senzaBilanci) {
    criteri.push({ chiave: 'bilanci', nome: 'Dichiarazioni dei redditi', valore: 'le ultime due, da chiedere al cliente', ok: null });
    righe.push(TESTI_PREFILTRO.dichiarazioni);
    giallo = true;
  } else {
    const bastano = bilanci !== null && bilanci.length >= BILANCI_MINIMI;
    criteri.push({
      chiave: 'bilanci',
      nome: 'Bilanci depositati con ricavi',
      valore: bilanci === null ? 'non disponibile' : anniBilanci(bilanci),
      // Sulla forma sconosciuta pochi bilanci non sono un rosso: potrebbe essere una ditta
      ok: bilanci === null ? null : bastano ? true : capitali ? false : null,
    });
    // Storico assente: non e' "zero bilanci", e' un dato che manca
    if (bilanci === null) giallo = true;
    else if (!bastano) {
      if (capitali) rosso = true;
      else giallo = true;
    }
  }

  // Regola 4: patrimonio negativo o perdita, gialla con motivazione. Assenti: non
  // disponibili, nessun giallo. Sulle forme senza bilancio si mostrano solo se ci sono.
  const conBilancio = capitali || classe === 'non-classificata';
  if (conBilancio || d.patrimonioNetto !== null) {
    criteri.push({
      chiave: 'patrimonio',
      nome: 'Patrimonio netto',
      valore: d.patrimonioNetto === null ? 'non disponibile' : euro(d.patrimonioNetto),
      ok: d.patrimonioNetto === null ? null : d.patrimonioNetto >= 0,
    });
  }
  if (conBilancio || d.utile !== null) {
    criteri.push({
      chiave: 'utile',
      nome: "Risultato dell'ultimo esercizio",
      valore: d.utile === null
        ? 'non disponibile'
        : d.utile > 0 ? `utile di ${euro(d.utile)}` : d.utile < 0 ? `perdita di ${euro(-d.utile)}` : 'in pareggio',
      ok: d.utile === null ? null : d.utile >= 0,
    });
  }
  const patrimonioNegativo = d.patrimonioNetto !== null && d.patrimonioNetto < 0;
  const perdita = d.utile !== null && d.utile < 0;
  if (patrimonioNegativo || perdita) {
    giallo = true;
    const causa = patrimonioNegativo && perdita
      ? "Patrimonio netto negativo e perdita nell'ultimo esercizio"
      : patrimonioNegativo ? 'Patrimonio netto negativo' : "Perdita nell'ultimo esercizio";
    motivazioni.push({ chiave: 'perdita', testo: `${causa}: spiega perché il cliente può sostenere il canone.` });
  }

  // Regola 5: SRL ordinaria con capitale sotto 10.000. Capitale assente: non disponibile, nessun giallo
  if (srlOrdinaria) {
    const capitale = d.capitaleSociale;
    criteri.push({
      chiave: 'capitale',
      nome: 'Capitale sociale',
      valore: capitale === null ? 'non disponibile' : euro(capitale),
      ok: capitale === null ? null : capitale >= CAPITALE_MINIMO_SRL,
    });
    if (capitale !== null && capitale < CAPITALE_MINIMO_SRL) giallo = true;
  }

  // Regola 1b: eventi presenti rosso; in verifica il colore e' provvisorio; non
  // pervenuti o non verificati (tetto finito) li verifica MCF, il colore non cambia
  criteri.push({
    chiave: 'eventi',
    nome: 'Eventi negativi',
    valore: TESTO_EVENTI[eventi],
    ok: eventi === 'presenti' ? false : eventi === 'assenti' ? true : null,
  });
  if (eventi === 'presenti') rosso = true;
  if (eventi === 'non-pervenuti' || eventi === 'non-avviata') righe.push(TESTI_PREFILTRO.eventiDaVerificare);

  // Regole 3 e 11, effetto rosso: MCF ha segnato il cliente. Il motivo resta a MCF.
  if (segnali.segnalato?.effetto === 'rosso') {
    criteri.push({ chiave: 'segnalato', nome: 'Verifiche di Mediocredito Facile', valore: 'cliente segnalato', ok: false });
    rosso = true;
  }

  // Regola 9: pratica recente. Solo il testo generico: data, canale e fornitore li vede MCF
  if (segnali.praticaRecente) {
    righe.push(TESTI_PREFILTRO.praticaRecente);
    giallo = true;
  }

  // --- regole sulla distinta ---

  let ledwallMancante = false;
  if (distinta) {
    const perNome = new Map(categorie.map((c) => [c.nome.trim(), c]));
    const cifreAteco = (d.atecoCodice ?? '').replace(/\D/g, '');
    const motivazioniRighe: MotivazioneRichiesta[] = [];
    const criteriRighe: CriterioPrefiltro[] = [];
    let postazioni = 0;

    distinta.righe.forEach((r, i) => {
      const quantita = Number.isFinite(r.quantita) && r.quantita > 0 ? r.quantita : 0;
      // Una categoria che non c'e' non ha regole: la distinta la scarta prima,
      // in validaDistinta, contro le categorie della carrozzeria
      const cat = perNome.get(String(r.categoria ?? '').trim());
      if (!cat || quantita === 0) return;
      if (cat.postazione) postazioni += quantita;
      // Regola 10: senza la spunta il LEDwall non esce, il colore non cambia
      if (cat.ledwall && !distinta.ledwallConfermato) ledwallMancante = true;

      // Regola 6: bene non tipico del settore, motivazione per riga. Settori vuoti = tipica ovunque
      const prefissi = cat.settoriTipici.map((p) => p.replace(/\D/g, '')).filter((p) => p !== '');
      if (prefissi.length === 0) return;
      const chiave = `riga-${i}` as const;
      const etichetta = `Riga ${i + 1}, ${cat.nome}`;
      if (cifreAteco === '') {
        criteriRighe.push({ chiave, nome: cat.nome, valore: 'ATECO del cliente non disponibile', ok: null });
        motivazioniRighe.push({ chiave, testo: `${etichetta}: ATECO del cliente non disponibile, spiega a cosa serve al cliente.` });
      } else if (!prefissi.some((p) => cifreAteco.startsWith(p))) {
        criteriRighe.push({ chiave, nome: cat.nome, valore: `non tipico per l'ATECO ${d.atecoCodice}`, ok: false });
        motivazioniRighe.push({ chiave, testo: `${etichetta}: bene non tipico per l'ATECO ${d.atecoCodice}, spiega a cosa serve al cliente.` });
      }
    });

    // Regola 7: postazioni oltre gli addetti, o addetti non disponibili. Lo zero
    // dichiarato e' un dato: una postazione su zero addetti chiede la motivazione.
    if (postazioni > 0) {
      const addetti = d.dipendenti;
      const ok = addetti === null ? null : postazioni <= addetti;
      const valore = `${quanti(postazioni, 'postazione', 'postazioni')}, ${addetti === null ? 'addetti non disponibili' : quanti(addetti, 'addetto', 'addetti')}`;
      criteri.push({ chiave: 'addetti', nome: 'Postazioni e addetti', valore, ok });
      if (ok !== true) {
        giallo = true;
        motivazioni.push({ chiave: 'addetti', testo: `${valore}: spiega chi userà le postazioni in più.` });
      }
    }

    criteri.push(...criteriRighe);
    if (motivazioniRighe.length) {
      giallo = true;
      motivazioni.push(...motivazioniRighe);
    }

    // Regola 8: consegna fuori da sede legale e unita' locali
    const fuori = distinta.consegna !== 'sede' && distinta.consegna !== 'unita';
    criteri.push({ chiave: 'consegna', nome: 'Consegna', valore: NOME_CONSEGNA[fuori ? 'altro' : distinta.consegna], ok: !fuori });
    if (fuori) giallo = true;
  }

  // Regole 3 e 9: le righe fisse, sempre in coda. Le verifica MCF, non cambiano il colore.
  righe.push(TESTI_PREFILTRO.centraleRischi, TESTI_PREFILTRO.altriFornitori);

  // Precedenza: rosso, poi giallo, poi verde. I gialli restano tutti fra i criteri.
  const semaforo: ColorePrefiltro = rosso ? 'rosso' : giallo ? 'giallo' : 'verde';
  const motivazioniMancanti = motivazioni
    .filter((m) => !motivazioneValida(distinta?.motivazioni?.[m.chiave]))
    .map((m) => m.chiave);

  return {
    semaforo,
    etichetta: ETICHETTA_PREFILTRO[semaforo],
    righe,
    criteri,
    provvisorio: eventi === 'in-verifica' && semaforo !== 'rosso',
    eventi,
    motivazioniRichieste: motivazioni,
    motivazioniMancanti,
    ledwallMancante,
    bloccaProposta: semaforo === 'rosso' || motivazioniMancanti.length > 0 || ledwallMancante,
  };
}
