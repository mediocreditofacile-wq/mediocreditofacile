// Lettura del dettaglio della verifica eventi negativi (Openapi IT-negativita).
// Modulo puro, client-safe: lo usano la scheda di valutazione, la scheda Protesti
// dei documenti ufficiali e il PDF.
//
// Il dettaglio arriva gia' pagato insieme alla verifica: esitoNegativita() chiama
// /IT-negativita/{id}/dettaglio e, quando c'e' almeno un evento, il registro
// openapi/verifiche/{cf}.json lo conserva intero sotto `dettaglio` (vedi
// riduciNegativita). Prima del 14/10/2026 la pagina ne leggeva solo le tre
// presenze si'/no: un assegno protestato da 10.000 euro compariva come la parola
// "protesti".
//
// Forma dei protesti verificata il 14/10/2026 su un caso reale (una SRL con un
// assegno protestato): un elemento per soggetto, con gli effetti dentro. Le forme
// di pregiudizievoli e procedure non le abbiamo ancora viste su un caso vero:
// si mostrano campo per campo, senza interpretarle, finche' non ne arriva uno.

export interface Effetto {
  /** "Assegno", "Cambiale", "Tratta accettata"... */
  tipo: string;
  importo: number | null;
  /** gg/mm/aaaa */
  dataLevata: string;
  luogoLevata: string;
  /** gg/mm/aaaa: quando il protesto e' entrato nel Registro informatico */
  dataIscrizione: string;
  /** Provincia della Camera di Commercio che lo ha iscritto */
  cciaa: string;
  dataScadenza: string;
  /** "Difetto di provvista (art. 2, L. 386/90)" */
  motivo: string;
  /** La spiegazione che segue il motivo, quando c'e' */
  motivoEsteso: string;
  /** "Normale", "Cancellato"... */
  stato: string;
  /** Annotazioni legate all'effetto, per esempio un pagamento successivo o chi ha firmato */
  informazione: string;
  /** Numero di repertorio del protesto: c'e' solo nella visura ufficiale */
  repertorio: string;
}

export interface Protesto {
  denominazione: string;
  cf: string;
  indirizzo: string;
  effetti: Effetto[];
}

export interface VoceGenerica {
  campi: [string, string][];
}

export interface EventiNegativi {
  presenzaProtesti: boolean;
  presenzaPregiudizievoli: boolean;
  presenzaProcedure: boolean;
  /** false quando una presenza e' vera ma il dettaglio non e' stato conservato */
  dettaglioDisponibile: boolean;
  protesti: Protesto[];
  pregiudizievoli: VoceGenerica[];
  procedure: VoceGenerica[];
  /** Numero di effetti protestati, su tutti i soggetti */
  effetti: number;
  /** Somma degli importi protestati, in euro */
  totaleProtestato: number;
}

const testo = (v: unknown): string =>
  v == null || typeof v === 'object' ? '' : String(v).replace(/\s+/g, ' ').trim();

/** "ASSEGNO" -> "Assegno". Le sigle di legge restano maiuscole: "L. 386/90", non "l. 386/90". */
export function frase(v: unknown): string {
  const t = testo(v).toLowerCase();
  if (!t) return '';
  return (t[0].toUpperCase() + t.slice(1))
    .replace(/\bl\. ?(\d)/g, 'L. $1')
    .replace(/\bd\.? ?lgs\.? ?(\d)/gi, 'D.Lgs. $1')
    .replace(/\br\.d\.? ?(\d)/gi, 'R.D. $1');
}

/** "VIA FRANCESCO FLAVIONI 6" -> "Via Francesco Flavioni 6", "SANT'ANGELO" -> "Sant'Angelo". */
export function nomeProprio(v: unknown): string {
  return testo(v).toLowerCase().replace(/(^|[\s'’(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

/** "2026-08-10" o "20260810" -> "10/08/2026". Altrimenti la si lascia com'e'. */
export function dataBreve(v: unknown): string {
  const t = testo(v);
  // anno 19xx o 20xx, mese e giorno plausibili: un numero di otto cifre qualsiasi non e' una data
  const m = /^((?:19|20)\d{2})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])(?:$|T)/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

/**
 * "DIFETTO DI PROVVISTA  ART. 2, L. 386/90  - Mancanza totale o parziale di fondi..."
 * -> motivo "Difetto di provvista (art. 2, L. 386/90)" e la spiegazione a parte.
 */
export function leggiMotivo(v: unknown): { motivo: string; esteso: string } {
  const t = testo(v);
  if (!t) return { motivo: '', esteso: '' };
  const i = t.indexOf(' - ');
  const testa = i >= 0 ? t.slice(0, i) : t;
  const esteso = i >= 0 ? t.slice(i + 3).trim() : '';
  // il riferimento normativo va tra parentesi, il resto in minuscolo
  const norma = /\b(ART\.?\s*\d.*)$/i.exec(testa);
  const motivo = norma
    ? `${frase(testa.slice(0, norma.index))} (${frase(norma[1]).replace(/^A/, 'a')})`
    : frase(testa);
  return { motivo: motivo.replace(/\s+\(/, ' ('), esteso };
}

function leggiEffetto(e: any): Effetto {
  const { motivo, esteso } = leggiMotivo(e?.motivo_rifiuto_pagamento);
  const imp = Number(e?.importo);
  const luogo = [nomeProprio(e?.comune_levata), testo(e?.provincia_levata) && `(${testo(e?.provincia_levata)})`].filter(Boolean).join(' ');
  return {
    tipo: frase(e?.tipo_effetto),
    importo: e?.importo == null || e?.importo === '' || !Number.isFinite(imp) ? null : imp,
    dataLevata: dataBreve(e?.data_levata),
    luogoLevata: luogo,
    dataIscrizione: dataBreve(e?.data_iscrizione),
    cciaa: testo(e?.cciaa),
    dataScadenza: dataBreve(e?.data_scadenza),
    motivo,
    motivoEsteso: esteso,
    stato: frase(e?.stato_effetto),
    informazione: frase(e?.informazione_legata_effetto ?? e?.informazione),
    repertorio: '',
  };
}

function leggiProtesto(p: any): Protesto {
  const ind = p?.indirizzo_residenza ?? {};
  const indirizzo = [nomeProprio(ind.denominazione), ind.cap, nomeProprio(ind.comune), testo(ind.provincia) && `(${testo(ind.provincia)})`]
    .map(testo).filter(Boolean).join(' ');
  return {
    denominazione: testo(p?.denominazione) || [testo(p?.nome), testo(p?.cognome)].filter(Boolean).join(' '),
    cf: testo(p?.codice_fiscale),
    indirizzo,
    effetti: (Array.isArray(p?.effetti) ? p.effetti : p?.effetti ? [p.effetti] : []).map(leggiEffetto),
  };
}

/** Oggetto qualunque -> coppie etichetta/valore, un livello di annidamento al massimo. */
function generica(x: any): VoceGenerica {
  const campi: [string, string][] = [];
  const etichetta = (k: string) => frase(k.replace(/_/g, ' '));
  for (const [k, v] of Object.entries(x ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [kk, vv] of Object.entries(v)) {
        const t = dataBreve(vv);
        if (t) campi.push([`${etichetta(k)} · ${etichetta(kk).toLowerCase()}`, t]);
      }
    } else if (Array.isArray(v)) {
      if (v.length) campi.push([etichetta(k), `${v.length} voci`]);
    } else {
      const t = dataBreve(v);
      if (t) campi.push([etichetta(k), t]);
    }
  }
  return { campi };
}

const elenco = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);

/**
 * Dal dato del registro (forma ridotta con `dettaglio`) o dalla risposta grezza
 * del dettaglio alla forma leggibile. null se non c'e' nessuna verifica da leggere.
 */
export function leggiEventiNegativi(dati: any): EventiNegativi | null {
  if (!dati || typeof dati !== 'object') return null;
  const d = dati.dettaglio ?? dati;
  const presenzaProtesti = !!(dati.presenzaProtesti ?? d.presenzaProtesti);
  const presenzaPregiudizievoli = !!(dati.presenzaPregiudizievoli ?? d.presenzaPregiudizievoli);
  const presenzaProcedure = !!(dati.presenzaProcedure ?? d.presenzaProcedure);

  const protesti = elenco(d.protesti).map(leggiProtesto);
  const pregiudizievoli = elenco(d.pregiudizievoli).map(generica);
  const procedure = elenco(d.procedure).map(generica);
  const tutti = protesti.flatMap((p) => p.effetti);

  const mancante = (presenzaProtesti && !protesti.length)
    || (presenzaPregiudizievoli && !pregiudizievoli.length)
    || (presenzaProcedure && !procedure.length);

  return {
    presenzaProtesti,
    presenzaPregiudizievoli,
    presenzaProcedure,
    dettaglioDisponibile: !mancante,
    protesti,
    pregiudizievoli,
    procedure,
    effetti: tutti.length,
    totaleProtestato: tutti.reduce((s, e) => s + (e.importo ?? 0), 0),
  };
}

const euro = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' })} €`;

/** Una riga per la cella dell'esito e per il PDF. */
export function sintesiEventi(e: EventiNegativi | null): string {
  if (!e) return 'nessuna risposta';
  const parti: string[] = [];
  if (e.presenzaProtesti) {
    if (e.effetti === 1) {
      const x = e.protesti.flatMap((p) => p.effetti)[0];
      parti.push(`protesto: ${(x.tipo || 'effetto').toLowerCase()}${x.importo != null ? ` da ${euro(x.importo)}` : ''}`);
    } else if (e.effetti > 1) {
      parti.push(`protesti: ${e.effetti} effetti per ${euro(e.totaleProtestato)}`);
    } else {
      parti.push('protesti');
    }
  }
  if (e.presenzaPregiudizievoli) parti.push(e.pregiudizievoli.length > 1 ? `${e.pregiudizievoli.length} pregiudizievoli` : 'pregiudizievoli');
  if (e.presenzaProcedure) parti.push(e.procedure.length > 1 ? `${e.procedure.length} procedure concorsuali` : 'procedure concorsuali');
  return parti.length ? parti.join(' · ') : 'nessun evento';
}

/** C'e' almeno un evento da mostrare? */
export const conEventi = (e: EventiNegativi | null): boolean =>
  !!e && (e.presenzaProtesti || e.presenzaPregiudizievoli || e.presenzaProcedure);

/**
 * Righe etichetta/valore per il PDF della scheda: una per effetto protestato,
 * una per pregiudizievole e per procedura.
 */
export function righeEventi(e: EventiNegativi | null): [string, string][] {
  if (!e) return [];
  const righe: [string, string][] = [];
  const piu = e.protesti.length > 1;
  for (const p of e.protesti) {
    for (const x of p.effetti) {
      const chiave = [x.tipo || 'Effetto', x.importo != null ? euro(x.importo) : ''].filter(Boolean).join(' · ');
      const valore = [
        piu && p.denominazione,
        x.dataLevata && `levato il ${x.dataLevata}${x.luogoLevata ? ` a ${x.luogoLevata}` : ''}`,
        x.dataIscrizione && `iscritto il ${x.dataIscrizione}${x.cciaa ? ` (CCIAA ${x.cciaa})` : ''}`,
        x.dataScadenza && `scadenza ${x.dataScadenza}`,
        x.motivo,
        x.stato && `stato ${x.stato.toLowerCase()}`,
        x.repertorio && `repertorio ${x.repertorio}`,
        x.informazione,
      ].filter(Boolean).join(' · ');
      righe.push([chiave, valore]);
    }
  }
  if (e.presenzaProtesti && !e.effetti) righe.push(['Protesti', 'presenti, dettaglio non disponibile']);
  e.pregiudizievoli.forEach((v, i) => righe.push([`Pregiudizievole ${i + 1}`, v.campi.map(([k, x]) => `${k}: ${x}`).join(' · ')]));
  if (e.presenzaPregiudizievoli && !e.pregiudizievoli.length) righe.push(['Pregiudizievoli', 'presenti, dettaglio non disponibile']);
  e.procedure.forEach((v, i) => righe.push([`Procedura ${i + 1}`, v.campi.map(([k, x]) => `${k}: ${x}`).join(' · ')]));
  if (e.presenzaProcedure && !e.procedure.length) righe.push(['Procedure concorsuali', 'presenti, dettaglio non disponibile']);
  return righe;
}

// --- visura protesti ufficiale (DocuEngine) ------------------------------------------
// La visura arriva in tre file: PDF, XML e JSON con lo stesso contenuto. Il JSON e'
// l'XML del Registro informatico dei protesti convertito, con le stesse abitudini del
// report persona: un elenco di un solo elemento arriva come oggetto, i valori stanno
// in { codice, valore }. Forma verificata il 14/10/2026 sulla prima visura ordinata.
//
// Perche' conta: quel giorno la verifica eventi negativi riportava un assegno
// protestato da 10.000 euro, la visura ne riportava tre per 27.979,15. Gli altri due
// erano stati iscritti al Registro il giorno prima e la banca dati della verifica non
// li aveva ancora. Fa fede la visura.

export interface SintesiVisura {
  protesti: number;
  effetti: number;
  importo: number | null;
  /** gg/mm/aaaa */
  ultimoProtesto: string;
  /** "R", "G", "V": semaforo del Registro */
  semaforo: string;
  /** Il Registro segnala soggetti omonimi con protesti, da non confondere col nostro */
  omonimie: boolean;
}

export interface VisuraProtesti extends EventiNegativi {
  sintesi: SintesiVisura;
}

/** { codice, valore } -> valore; stringa -> stringa. */
const valore = (o: any): string => testo(o && typeof o === 'object' ? o.valore : o);
const numero = (v: unknown): number | null => {
  const t = testo(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Importo: { ValutaLevata: { valuta, valore } } o simili, si prende il primo valore numerico. */
function importoVisura(o: any): number | null {
  if (o == null) return null;
  if (typeof o !== 'object') return numero(o);
  if (o.valore != null) return numero(o.valore);
  for (const v of Object.values(o)) {
    const n = importoVisura(v);
    if (n != null) return n;
  }
  return null;
}

function effettoVisura(x: any): Effetto {
  const i = x?.InformazioniEffetto ?? {};
  const r = x?.DatiRegistroProtesti ?? {};
  const { motivo, esteso } = leggiMotivo(valore(i.MancatoPagamentoRepr));
  const note = elenco(x?.ElencoInfoAggiuntiveEffetto?.InfoAggiuntiveEffetto)
    // RigaTesto e' una stringa con una riga sola, un array con piu' righe
    .flatMap((n) => elenco(n?.TestoInfoEffetto).flatMap((t) => [t?.RigaTesto].flat().map(testo)))
    .filter(Boolean);
  const prov = i.ProvinciaLevata?.sigla ?? valore(i.ProvinciaLevata);
  return {
    tipo: frase(valore(i.TipoEffetto)),
    importo: importoVisura(i.Importo),
    dataLevata: dataBreve(valore(i.DataLevata)),
    luogoLevata: [nomeProprio(valore(i.ComuneLevata)), prov && `(${testo(prov)})`].filter(Boolean).join(' '),
    dataIscrizione: dataBreve(valore(r.DataIscrizioneRegistro)),
    cciaa: testo(r.CciaaPubblicazione?.sigla ?? valore(r.CciaaPubblicazione)),
    dataScadenza: dataBreve(valore(i.DataScadenza)),
    motivo,
    motivoEsteso: esteso,
    stato: frase(valore(i.StatoEffetto)),
    // "FIRMA: MARIO ROSSI NATO A ..." resta com'e': sono i dati del Registro
    informazione: note.join(' · '),
    repertorio: testo(i.NumeroRepertorio),
  };
}

function protestoVisura(p: any): Protesto {
  const a = p?.Anagrafica ?? {};
  const res = a.Residenza ?? {};
  // gli effetti stanno in ElencoEffettiRP; altri elenchi ElencoEffetti* si leggono allo stesso modo
  const effetti = Object.entries(p ?? {})
    .filter(([k]) => k.startsWith('ElencoEffetti'))
    .flatMap(([, v]) => Object.values(v ?? {}).flatMap(elenco))
    .map(effettoVisura);
  return {
    denominazione: testo(a.Nominativo),
    cf: testo(a.CodiceFiscale),
    indirizzo: [nomeProprio(valore(a.Indirizzo ?? res.Indirizzo)), nomeProprio(valore(res.Comune)), res.Provincia?.sigla && `(${testo(res.Provincia.sigla)})`]
      .filter(Boolean).join(' '),
    effetti,
  };
}

/**
 * Dal JSON della visura protesti (azienda o persona) alla forma comune. null se il
 * file non ha la struttura attesa: meglio non mostrare niente che mostrare un
 * "nessun protesto" sbagliato.
 */
export function leggiVisuraProtesti(json: any): VisuraProtesti | null {
  const dati = json?.Dati;
  if (!dati || typeof dati !== 'object') return null;
  // EventiNegativiImpresa per l'azienda; per la persona il nome cambia, la struttura no
  const radice: any = Object.values(dati).find((v: any) => v && typeof v === 'object' && (v.Sintesi || v.ElencoProtesti));
  if (!radice) return null;

  const protesti = elenco(radice.ElencoProtesti?.Protesto).map(protestoVisura);
  const tutti = protesti.flatMap((p) => p.effetti);
  const s = radice.Sintesi?.Protesti ?? {};
  const effetti = numero(s.totEffetti) ?? tutti.length;
  // La visura persona non ha i totali in sintesi, solo { flagPresenza } sull'elenco e il
  // semaforo (verificato il 14/10/2026 su una visura pulita: 'N' e 'V'). Se il Registro
  // dice che ci sono protesti e l'elenco non si legge, si dice "presenti senza
  // dettaglio": mai un "nessun protesto" sbagliato.
  const segnalati = testo(radice.ElencoProtesti?.flagPresenza).toUpperCase() === 'S'
    || testo(s.semaforo).toUpperCase() === 'R';
  // { flagPresenza: 'N' } quando non ce ne sono; con 'S' arriva anche l'elenco, di forma non ancora vista
  const om = radice.ElencoOmonimieProtesti ?? {};
  const omonimie = testo(om.flagPresenza).toUpperCase() === 'S' || Object.keys(om).some((k) => k !== 'flagPresenza');

  return {
    presenzaProtesti: effetti > 0 || tutti.length > 0 || segnalati,
    presenzaPregiudizievoli: false,
    presenzaProcedure: false,
    // la sintesi dice quanti effetti ci sono: se l'elenco ne ha meno, qualcosa non e' stato letto
    dettaglioDisponibile: tutti.length >= effetti && !(segnalati && !tutti.length),
    protesti,
    pregiudizievoli: [],
    procedure: [],
    effetti: tutti.length,
    totaleProtestato: tutti.reduce((t, e) => t + (e.importo ?? 0), 0),
    sintesi: {
      protesti: numero(s.totProtesti) ?? protesti.length,
      effetti,
      importo: numero(s.totImportoProtesti),
      ultimoProtesto: dataBreve(s.dataUltimoProtesto),
      semaforo: testo(s.semaforo ?? radice.Sintesi?.Globale?.semaforo),
      omonimie,
    },
  };
}

/**
 * La verifica eventi negativi e la visura dicono la stessa cosa sui protesti?
 * Se no, una frase che lo spiega; null se coincidono o se manca uno dei due.
 */
export function confrontoVerificaVisura(verifica: EventiNegativi | null, visura: VisuraProtesti | null): string | null {
  if (!verifica || !visura) return null;
  const nV = verifica.effetti, nU = visura.effetti;
  const tV = verifica.totaleProtestato, tU = visura.totaleProtestato;
  if (verifica.presenzaProtesti === visura.presenzaProtesti && nV === nU && Math.abs(tV - tU) < 0.01) return null;
  const descr = (n: number, t: number, presenza: boolean) =>
    n ? `${n} ${n === 1 ? 'effetto' : 'effetti'} per ${euro(t)}` : presenza ? 'protesti senza dettaglio' : 'nessun protesto';
  return `La verifica eventi negativi riportava ${descr(nV, tV, verifica.presenzaProtesti)}, la visura ${descr(nU, tU, visura.presenzaProtesti)}. `
    + 'La banca dati della verifica può essere indietro di qualche settimana rispetto al Registro: fa fede la visura.';
}

/**
 * Il dettaglio della verifica senza i protesti: quando c'e' la visura, i protesti
 * si leggono da li', mentre pregiudizievoli e procedure restano quelli della verifica.
 */
export function senzaProtesti(e: EventiNegativi | null): EventiNegativi | null {
  if (!e) return null;
  return {
    ...e,
    presenzaProtesti: false,
    protesti: [],
    effetti: 0,
    totaleProtestato: 0,
    dettaglioDisponibile: !((e.presenzaPregiudizievoli && !e.pregiudizievoli.length) || (e.presenzaProcedure && !e.procedure.length)),
  };
}
