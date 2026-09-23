// Lettura del report persona di Openapi (IT-report-persona, servizio EUROCHECK REAL TIME).
// Modulo puro, client-safe: lo usano la pagina di valutazione e il PDF.
//
// Il report arriva come XML convertito in JSON, sotto data.reportData.xml.ROOT, e si
// porta dietro due abitudini della conversione:
//   - un elenco con un solo elemento arriva come oggetto, con due o piu' come array;
//   - un campo vuoto arriva come [] invece che come stringa vuota.
// Le due funzioni qui sotto (lista, testo) esistono solo per questo.
//
// Strutture verificate il 23/09/2026 su un report reale. Protesti e Constatazioni
// in quel report erano vuoti: la loro forma interna non e' nota, quindi si
// mostrano per numero e con i campi grezzi, senza interpretarli.

export interface Carica { societa: string; cf: string; comune: string; ruolo: string; dal: string; stato: string; statoImpresa: string }
export interface Partecipazione { societa: string; cf: string; percentuale: string; quota: string; stato: string }
export interface ImmobileSintesi { comune: string; provincia: string; tipologia: string; numero: string }
export interface Immobile { comune: string; provincia: string; tipologia: string; diritto: string; classamento: string; indirizzo: string }
export interface EventoGrezzo { campi: [string, string][] }

export interface ReportPersona {
  cariche: Carica[];
  partecipazioni: Partecipazione[];
  immobiliSintesi: ImmobileSintesi[];
  immobili: Immobile[];
  protesti: EventoGrezzo[];
  constatazioni: EventoGrezzo[];
  /** Data di estrazione del report (gg/mm/aaaa), quando c'e' */
  dataEstrazione: string;
}

/** Oggetto singolo o array: sempre array. */
const lista = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);
/** [] o null: stringa vuota. */
const testo = (v: any): string => (v == null || Array.isArray(v) || typeof v === 'object' ? '' : String(v).trim());

function grezzo(x: any): EventoGrezzo {
  const campi = Object.entries(x ?? {})
    .map(([k, v]) => [k.replace(/^[A-Za-z]+_/, ''), testo(v)] as [string, string])
    .filter(([, v]) => v !== '');
  return { campi };
}

export function radiceReport(dati: any): any | null {
  return dati?.reportData?.xml?.ROOT ?? null;
}

export function leggiReport(dati: any): ReportPersona | null {
  const R = radiceReport(dati);
  if (!R) return null;

  // Le cariche stanno sotto l'esponente (la persona), impresa per impresa
  const cariche: Carica[] = lista(R.Cointeressenze?.Cointeressenze_Esponente)
    .flatMap((e) => lista(e?.Cointeressenze_Impresa))
    .map((i) => ({
      societa: testo(i.Cointeressenze_RagSoc),
      cf: testo(i.Cointeressenze_CodFis),
      comune: [testo(i.Cointeressenze_DesComune), testo(i.Cointeressenze_Prov)].filter(Boolean).join(' '),
      ruolo: testo(i.Cointeressenze_DesCar),
      dal: testo(i.Cointeressenze_DatIniCar),
      stato: testo(i.Cointeressenze_StaCar),
      statoImpresa: testo(i.Cointeressenze_DesStato),
    }));

  const partecipazioni: Partecipazione[] = lista(R.Partecipazioni?.Partecipazioni_Soggetto).map((p) => ({
    societa: testo(p.Partecipazioni_Nominativo),
    cf: testo(p.Partecipazioni_CodFis),
    percentuale: testo(p.Partecipazioni_PercPoss),
    quota: [testo(p.Partecipazioni_ImpQuota), testo(p.Partecipazioni_DesVal)].filter(Boolean).join(' '),
    stato: testo(p.Partecipazioni_StaCar),
  }));

  const catasto = lista(R.Catasto);
  const immobiliSintesi: ImmobileSintesi[] = catasto
    .flatMap((c) => lista(c?.Catasto_Testa).flatMap((t) => lista(t?.Catasto_Testa_Dati)))
    .map((t) => ({
      comune: testo(t.Catasto_DesComIstat),
      provincia: testo(t.Catasto_CodProv),
      tipologia: testo(t.Catasto_DesTipImm),
      numero: testo(t.Catasto_NumImm),
    }));
  const immobili: Immobile[] = catasto
    .flatMap((c) => lista(c?.Catasto_Dettagli).flatMap((d) => lista(d?.Catasto_Dettagli_Dati)))
    .map((d) => ({
      comune: testo(d.Catasto_Det_DesComIstat),
      provincia: testo(d.Catasto_Det_CodProv),
      tipologia: testo(d.Catasto_Det_DesTipImm),
      diritto: testo(d.Catasto_Det_DesDirImm),
      classamento: testo(d.Catasto_Det_Classamento),
      indirizzo: testo(d.Catasto_Det_Indirizzo),
    }));

  return {
    cariche,
    partecipazioni,
    immobiliSintesi,
    immobili,
    protesti: lista(R.Protesti).map(grezzo),
    constatazioni: lista(R.Constatazioni).map(grezzo),
    dataEstrazione: testo(R.DataOggi),
  };
}

/** Una riga di sintesi, per la cella dell'esito e per il PDF. */
export function sintesiReport(r: ReportPersona): string {
  const eventi = r.protesti.length + r.constatazioni.length;
  const immobili = r.immobili.length || r.immobiliSintesi.reduce((s, x) => s + (Number(x.numero) || 0), 0);
  return [
    `${r.cariche.length} ${r.cariche.length === 1 ? 'carica' : 'cariche'}`,
    `${r.partecipazioni.length} ${r.partecipazioni.length === 1 ? 'partecipazione' : 'partecipazioni'}`,
    `${immobili} ${immobili === 1 ? 'immobile' : 'immobili'}`,
    eventi ? `${eventi} eventi negativi` : 'nessun evento negativo',
  ].join(' · ');
}

/** Elenco delle chiavi presenti sotto ROOT, per capire la forma di un report nuovo. */
export function chiaviReport(dati: any): string[] {
  const R = radiceReport(dati);
  return R ? Object.keys(R) : [];
}
