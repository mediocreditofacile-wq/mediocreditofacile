// Motore di calcolo dei prospetti fotovoltaico (noleggio operativo + confronto leasing).
//
// ATTENZIONE — FILE SERVER-ONLY: importa i coefficienti riservati. Va usato solo
// dalle API routes, mai da un'isola client.
//
// Gli arrotondamenti replicano passo per passo quelli di motore_prospetto_pv.py
// (compute()): il canone si arrotonda a 2 decimali PRIMA di moltiplicarlo per la
// durata, altrimenti i totali divergono di qualche centesimo rispetto al PDF.
//
// L'output di buildPayloadPdf() e' il JSON che il microservizio passa allo script
// senza rielaborarlo: stesse 27 chiavi dell'esempio validato.

import {
  ACCUMULO_PUNTI,
  AUTOCONSUMO_BASE,
  AUTOCONSUMO_MAX,
  DETRAZIONE_PRIVATI,
  DURATE,
  IMPORTO_MAX,
  IMPORTO_MIN,
  IPER_COSTO_GESTIONE,
  IPER_PCT,
  IRAP,
  IRES,
  IRRAGGIAMENTO,
  LEASING_RISCATTO,
  LEASING_TASSO,
  PREZZO_CESSIONE,
  PREZZO_KWH_DEFAULT,
  PROVINCE_ZONA,
  RISCATTO,
  SABATINI_COSTO_GESTIONE,
  SABATINI_PCT,
  coefficiente,
} from './prospetti-pv-coefficienti';

export type FormaGiuridica = 'societa-capitali' | 'ditta-individuale' | 'privato';
export type Installazione = 'tetto' | 'pensilina' | 'terra';
export type Profilo = 'diurno' | 'h24';

export interface InputPreventivo {
  cliente: string;
  comune: string;
  provincia: string;
  forma_giuridica: FormaGiuridica;
  rif_preventivo: string;
  kwp: number;
  kwh_accumulo: number;
  importo: number;
  installazione: Installazione;
  /** Consumo annuo da bolletta (kWh). Vuoto: si usano le ipotesi di zona. */
  consumo_annuo?: number | null;
  /** Prezzo energia da bolletta (euro/kWh). Vuoto: PREZZO_KWH_DEFAULT. */
  prezzo_kwh?: number | null;
  /** Profilo di consumo, rilevante solo senza accumulo. Default: diurno. */
  profilo?: Profilo;
  /** Durata forzata dall'operatore. Vuoto: durata consigliata. */
  durata?: number | null;
  /** Data del preventivo (ISO). Vuoto: oggi. Parametrizzata per i test. */
  data?: string;
}

export interface Calcolo {
  zona: string;
  irraggiamento: number;
  canoni: Record<number, number>;
  totali: Record<number, number>;
  riscatti: Record<number, number>;
  durata: number;
  durataConsigliata: number;
  durataForzata: boolean;
  canone: number;
  totCanoni: number;
  riscatto: number;
  // energia
  produzione: number;
  autoconsumoQuota: number;
  autoKwh: number;
  cedKwh: number;
  prezzoKwh: number;
  datiRealiConsumo: boolean;
  autoconsumoCappatoDaConsumi: boolean;
  rispAuto: number;
  ricCed: number;
  beneficioAnno: number;
  beneficioMese: number;
  // fisco noleggio
  iresNol: number;
  irapNol: number;
  fiscoNol: number;
  costoNettoNol: number;
  // leasing
  rataLeasing: number;
  riscattoLeasing: number;
  totLeasing: number;
  interessi: number;
  // agevolazioni
  sabatini: number;
  sabatiniNetto: number;
  iresIper: number;
  iperNetto: number;
  costoNettoLeasing: number;
  detrazionePrivati: number;
  // sintesi
  coperturaCanone: number;
  margineMese: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Formattazione italiana, gemella di euro() nello script Python.
 * useGrouping 'always' e' necessario: l'italiano di default non separa le
 * migliaia sotto le cinque cifre (1450, non 1.450), il Python invece le separa
 * sempre. Senza questo i PDF divergono dai prospetti gia' emessi.
 */
export function euro(v: number, dec = 2): string {
  return v.toLocaleString('it-IT', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: 'always',
  });
}

/** L'importo cade nel range che l'operatore quota davvero? */
export function importoQuotabile(importo: number): boolean {
  return importo >= IMPORTO_MIN && importo <= IMPORTO_MAX && DURATE.every((m) => coefficiente(importo, m) !== null);
}

/**
 * Coefficienti risolti per un dato importo, una voce per durata. E' quello che
 * viaggia verso il microservizio PDF: gli scaglioni li legge solo questo lato,
 * perche' cambiano da un operatore all'altro e perfino tra durate.
 */
export function coefficientiPerImporto(importo: number): Record<number, number> {
  const mappa: Record<number, number> = {};
  for (const m of DURATE) {
    const c = coefficiente(importo, m);
    if (c !== null) mappa[m] = c;
  }
  return mappa;
}

export function zonaDaProvincia(provincia: string): string {
  return PROVINCE_ZONA[(provincia || '').trim().toUpperCase()] ?? 'centro';
}

/**
 * Quota di autoconsumo stimata. Senza accumulo dipende dal profilo di consumo;
 * con accumulo si interpola sul rapporto kWh/kWp tra i punti noti e si cappa.
 */
export function autoconsumoStimato(kwp: number, kwhAccumulo: number, profilo: Profilo = 'diurno'): number {
  const base = AUTOCONSUMO_BASE[profilo] ?? AUTOCONSUMO_BASE.diurno;
  if (!kwhAccumulo || !kwp) return base;

  const rapporto = kwhAccumulo / kwp;
  const [p1, p2] = ACCUMULO_PUNTI;
  let quota: number;
  if (rapporto <= p1.rapporto) {
    // Sotto il primo punto noto: si interpola tra la base senza accumulo e p1
    quota = base + ((p1.quota - base) * rapporto) / p1.rapporto;
  } else {
    const pendenza = (p2.quota - p1.quota) / (p2.rapporto - p1.rapporto);
    quota = p1.quota + (rapporto - p1.rapporto) * pendenza;
  }
  return Math.min(Math.max(quota, base), AUTOCONSUMO_MAX);
}

export function calcolaPreventivo(input: InputPreventivo): Calcolo {
  const imp = input.importo;
  if (!importoQuotabile(imp)) {
    throw new Error(
      `importo_fuori_range: ${imp} euro, quotabili da ${IMPORTO_MIN} a ${IMPORTO_MAX}`,
    );
  }

  const canoni: Record<number, number> = {};
  const totali: Record<number, number> = {};
  const riscatti: Record<number, number> = {};
  for (const m of DURATE) {
    canoni[m] = r2((imp * coefficiente(imp, m)!) / 100);
    totali[m] = r2(canoni[m] * m);
    riscatti[m] = r2((imp * RISCATTO[m]) / 100);
  }

  // === Bilancio energetico ===
  const zona = zonaDaProvincia(input.provincia);
  const irraggiamento = IRRAGGIAMENTO[zona];
  const produzione = input.kwp * irraggiamento;

  const quotaTeorica = autoconsumoStimato(input.kwp, input.kwh_accumulo, input.profilo ?? 'diurno');
  const consumoAnnuo = input.consumo_annuo && input.consumo_annuo > 0 ? input.consumo_annuo : null;
  // Con il consumo reale l'autoconsumo non puo' superare quello che il cliente consuma
  const autoKwh = consumoAnnuo ? Math.min(produzione * quotaTeorica, consumoAnnuo) : produzione * quotaTeorica;
  const autoconsumoQuota = produzione > 0 ? autoKwh / produzione : 0;
  const autoconsumoCappatoDaConsumi = Boolean(consumoAnnuo) && autoconsumoQuota < quotaTeorica - 1e-9;
  const cedKwh = produzione - autoKwh;

  const prezzoKwh = input.prezzo_kwh && input.prezzo_kwh > 0 ? input.prezzo_kwh : PREZZO_KWH_DEFAULT;
  const datiRealiConsumo = Boolean(consumoAnnuo) || Boolean(input.prezzo_kwh && input.prezzo_kwh > 0);

  const rispAuto = autoKwh * prezzoKwh;
  const ricCed = cedKwh * PREZZO_CESSIONE;
  const beneficioAnno = rispAuto + ricCed;
  const beneficioMese = beneficioAnno / 12;

  // === Durata consigliata: la piu' corta in cui il canone al netto della
  // deducibilita' e' coperto dal beneficio energetico. Nessuna: 72 mesi. ===
  const netto = (canone: number) => canone * (1 - IRES - IRAP);
  // Nessuna durata coperta: si propone la piu' lunga disponibile
  const durataConsigliata = DURATE.find((m) => netto(canoni[m]) <= beneficioMese) ?? DURATE[DURATE.length - 1];
  const durataForzata = Boolean(input.durata && input.durata !== durataConsigliata);
  const durata = input.durata && DURATE.includes(input.durata) ? input.durata : durataConsigliata;

  const canone = canoni[durata];
  const totCanoni = totali[durata];
  const riscatto = riscatti[durata];

  // === Fisco sul noleggio ===
  const iresNol = totCanoni * IRES;
  const irapNol = totCanoni * IRAP;
  const fiscoNol = iresNol + irapNol;
  const costoNettoNol = totCanoni + riscatto - fiscoNol;

  // === Leasing di confronto: francese con valore finale attualizzato ===
  const i = LEASING_TASSO / 12;
  const fv = imp * LEASING_RISCATTO;
  const af = (1 - Math.pow(1 + i, -durata)) / i;
  const rataLeasing = r2((imp - fv / Math.pow(1 + i, durata)) / af);
  const totLeasing = rataLeasing * durata + fv;
  const interessi = totLeasing - imp;

  // === Agevolazioni (solo ramo leasing) ===
  const sabatini = imp * SABATINI_PCT;
  const iresIper = imp * IPER_PCT * IRES;
  const iresOrd = imp * IRES;
  const iresInt = interessi * (IRES + IRAP);
  const beneficiLeasing = iresIper + iresOrd + iresInt + sabatini;
  const esborsoLeasing = totLeasing + SABATINI_COSTO_GESTIONE + IPER_COSTO_GESTIONE;

  return {
    zona,
    irraggiamento,
    canoni,
    totali,
    riscatti,
    durata,
    durataConsigliata,
    durataForzata,
    canone,
    totCanoni,
    riscatto,
    produzione,
    autoconsumoQuota,
    autoKwh,
    cedKwh,
    prezzoKwh,
    datiRealiConsumo,
    autoconsumoCappatoDaConsumi,
    rispAuto,
    ricCed,
    beneficioAnno,
    beneficioMese,
    iresNol,
    irapNol,
    fiscoNol,
    costoNettoNol,
    rataLeasing,
    riscattoLeasing: fv,
    totLeasing,
    interessi,
    sabatini,
    sabatiniNetto: sabatini - SABATINI_COSTO_GESTIONE,
    iresIper,
    iperNetto: iresIper - IPER_COSTO_GESTIONE,
    costoNettoLeasing: esborsoLeasing - beneficiLeasing,
    detrazionePrivati: imp * DETRAZIONE_PRIVATI,
    coperturaCanone: beneficioMese / canone,
    margineMese: beneficioMese - netto(canone),
  };
}

// === Testi narrativi ===
// Nei PDF non compaiono accenti: lo script usa le font Manrope e la resa
// validata usa l'apostrofo (deducibilita'). Si mantiene la stessa convenzione.

const INSTALLAZIONE_LABEL: Record<Installazione, string> = {
  tetto: 'Tetto / lastrico solare',
  pensilina: 'Pensilina / tettoia',
  terra: 'Installazione a terra',
};

const pct = (v: number, dec = 0) => euro(v * 100, dec);

/**
 * Elisione dell'articolo davanti a una percentuale: dipende da come si legge il
 * numero, non da come si scrive. Iniziano per vocale uno, otto, undici,
 * diciotto e tutti gli ottanta. "l'88 per cento", "il 76 per cento".
 */
function iniziaPerVocale(n: number): boolean {
  const i = Math.round(n);
  return i === 1 || i === 8 || i === 11 || i === 18 || (i >= 80 && i <= 89);
}

/** "il 76" oppure "l'88" */
const conIl = (v: number) => (iniziaPerVocale(v * 100) ? `l'${pct(v)}` : `il ${pct(v)}`);
/** "al 76" oppure "all'88" */
const conAl = (v: number) => (iniziaPerVocale(v * 100) ? `all'${pct(v)}` : `al ${pct(v)}`);

function testoIpotesi(input: InputPreventivo, c: Calcolo): string {
  const dove = input.comune
    ? `${input.comune}${input.provincia ? ` (${input.provincia.toUpperCase()})` : ''}`
    : 'zona di installazione';
  // Il rapporto si scrive senza decimale quando e' tondo: "circa 1 kWh per kWp"
  const rapporto = input.kwp ? input.kwh_accumulo / input.kwp : 0;
  const rapportoTesto = euro(rapporto, Number.isInteger(Math.round(rapporto * 10) / 10) ? 0 : 1);
  const accumulo = input.kwh_accumulo
    ? `autoconsumo ${pct(c.autoconsumoQuota)} per cento grazie all'accumulo da ${euro(input.kwh_accumulo, 0)} kWh (dimensionamento di circa ${rapportoTesto} kWh per kWp installato)`
    : `autoconsumo ${pct(c.autoconsumoQuota)} per cento, senza sistema di accumulo`;

  const consumi = (input.profilo ?? 'diurno') === 'h24' ? 'continui' : 'diurni';
  const premessa = c.datiRealiConsumo
    ? `Elaborazione sui dati di consumo reali del cliente${input.consumo_annuo ? ` (${euro(input.consumo_annuo, 0)} kWh all'anno)` : ''}, impianto installato a ${dove}.`
    : `Stima per un cliente tipo a ${dove} con consumi ${consumi} adeguati alla taglia dell'impianto, in assenza dei dati di consumo reali del cliente.`;

  const cappato = c.autoconsumoCappatoDaConsumi
    ? ' La quota di autoconsumo e\' limitata dal consumo dichiarato: oltre quella soglia l\'energia prodotta viene ceduta in rete.'
    : '';

  return (
    `${premessa} Ipotesi dichiarate: produzione ${euro(c.irraggiamento, 0)} kWh per kWp all'anno, ` +
    `${accumulo}, energia valorizzata ${euro(c.prezzoKwh, 2)} euro per kWh ` +
    `(componente evitata in bolletta), cessione in rete a ${euro(PREZZO_CESSIONE, 2)} euro per kWh.${cappato}`
  );
}

function testoIpotesiBreve(input: InputPreventivo, c: Calcolo): string {
  const fonte = c.datiRealiConsumo ? 'Dati di consumo del cliente' : 'Ipotesi';
  return (
    `Beneficio totale: ${euro(c.beneficioAnno, 0)} euro/anno, circa ${euro(c.beneficioMese, 0)} euro/mese. ` +
    `${fonte}: impianto a ${input.comune || 'destinazione'}${input.provincia ? ` (${input.provincia.toUpperCase()})` : ''}, ` +
    `${euro(c.irraggiamento, 0)} kWh/kWp/anno, autoconsumo ${pct(c.autoconsumoQuota)}%` +
    `${input.kwh_accumulo ? ' con accumulo' : ''}, energia evitata ${euro(c.prezzoKwh, 2)} euro/kWh, ` +
    `cessione ${euro(PREZZO_CESSIONE, 2)} euro/kWh.`
  );
}

/** Frase sul confronto con la durata immediatamente piu' lunga, se esiste */
function frasePiuLunga(c: Calcolo): string {
  const piuLunga = DURATE.find((m) => m > c.durata);
  if (!piuLunga) return '';
  const canone = c.canoni[piuLunga];
  const copertura = c.beneficioMese / canone;
  const margine = c.beneficioMese - canone * (1 - IRES - IRAP);
  return (
    ` A ${piuLunga} mesi il solo risparmio energetico copre ${conIl(copertura)} per cento del canone ` +
    `(${euro(canone)} euro) e il margine post-fisco sale a circa ${euro(margine, 0)} euro mensili.`
  );
}

function testoCopertura(c: Calcolo): string {
  const inAttivo = c.margineMese >= 0;
  const esito = inAttivo
    ? `il costo netto mensile scende e l'operazione e' gia' in attivo di circa ${euro(c.margineMese, 0)} euro al mese`
    : `il costo netto mensile scende e resta a carico del cliente circa ${euro(Math.abs(c.margineMese), 0)} euro al mese`;

  return (
    `A ${c.durata} mesi il risparmio energetico copre circa ${conIl(c.coperturaCanone)} per cento del canone. ` +
    `Considerando la deducibilita' integrale del canone (sezione 5), ${esito}.` +
    frasePiuLunga(c) +
    ` Dopo il riscatto, il beneficio di ${euro(c.beneficioAnno, 0)} euro l'anno resta al cliente per tutta ` +
    `la vita utile residua dell'impianto (20 anni e oltre).`
  );
}

function testoGrafico1(c: Calcolo): string {
  const piuLunga = DURATE.find((m) => m > c.durata);
  const confronto = piuLunga
    ? ` A ${piuLunga} mesi la copertura sale ${conAl(c.beneficioMese / c.canoni[piuLunga])}%.`
    : '';
  const esito = c.margineMese >= 0
    ? "con la deducibilita' del canone l'operazione e' gia' in attivo"
    : "la deducibilita' del canone riduce ulteriormente il costo netto";

  return (
    `A ${c.durata} mesi il risparmio energetico copre ${conIl(c.coperturaCanone)}% del canone: ${esito}.` +
    `${confronto}<br/><br/>` +
    `Dopo il riscatto (${RISCATTO[c.durata]}%, ${euro(c.riscatto, 0)} euro, valori medi indicativi) il beneficio ` +
    `resta tutto al cliente: ${euro(c.beneficioAnno, 0)} euro l'anno per la vita utile residua dell'impianto.`
  );
}

/** Slug del file: dal nome cliente, come i prospetti gia' emessi */
export function slugCliente(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'Cliente'
  );
}

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * JSON per il microservizio PDF: le stesse 27 chiavi che motore_prospetto_pv.py
 * si aspetta. Lo script ricalcola i numeri dagli stessi input, i testi narrativi
 * invece arrivano gia' composti da qui.
 */
export function buildPayloadPdf(input: InputPreventivo, c: Calcolo): Record<string, unknown> {
  const data = input.data ? new Date(input.data) : new Date();
  const dataFile = data.toISOString().slice(0, 10);
  const dataTesto = `${data.getDate()} ${MESI[data.getMonth()]} ${data.getFullYear()}`;
  const accumulo = input.kwh_accumulo ? ` + accumulo ${euro(input.kwh_accumulo, 0)} kWh` : '';

  return {
    slug: slugCliente(input.cliente),
    data_file: dataFile,
    data_testo: dataTesto,
    soluzione: `${input.cliente} | impianto ${euro(input.kwp, 0)} kWp${accumulo} InnovaLux`,
    rif_impianto: `${input.cliente}, ${euro(input.kwp, 0)} kWp${input.kwh_accumulo ? ` + ${euro(input.kwh_accumulo, 0)} kWh` : ''}`,
    rif_contratto: input.rif_preventivo || 'Preventivo InnovaLux',
    installazione: INSTALLAZIONE_LABEL[input.installazione] ?? INSTALLAZIONE_LABEL.tetto,
    kwp: input.kwp,
    kwh_accumulo: input.kwh_accumulo,
    importo: input.importo,
    irraggiamento: c.irraggiamento,
    autoconsumo: c.autoconsumoQuota,
    prezzo_kwh: c.prezzoKwh,
    prezzo_cessione: PREZZO_CESSIONE,
    durata: c.durata,
    ires: IRES,
    irap: IRAP,
    tasso_leasing: LEASING_TASSO,
    riscatto_leasing: LEASING_RISCATTO,
    sabatini_pct: SABATINI_PCT,
    costo_sabatini: SABATINI_COSTO_GESTIONE,
    iper_pct: IPER_PCT,
    costo_40: IPER_COSTO_GESTIONE,
    testo_ipotesi: testoIpotesi(input, c),
    testo_ipotesi_breve: testoIpotesiBreve(input, c),
    testo_copertura: testoCopertura(c),
    testo_grafico1: testoGrafico1(c),
  };
}

/**
 * Avvisi di interfaccia sulla forma giuridica. Non finiscono mai nei PDF:
 * servono ad Antonia prima di lavorare la pratica.
 */
export function avvisoFormaGiuridica(forma: FormaGiuridica): { livello: 'blocco' | 'attenzione'; testo: string } | null {
  if (forma === 'privato') {
    return {
      livello: 'blocco',
      testo:
        "Privato senza partita IVA: il noleggio operativo non e' percorribile. La strada e' la detrazione fiscale del 50 per cento in dieci quote annuali. Il prospetto resta utile come confronto, ma la pratica di noleggio non si apre.",
    };
  }
  if (forma === 'ditta-individuale') {
    return {
      livello: 'attenzione',
      testo:
        "Ditta individuale o persona fisica con partita IVA: prima di procedere vanno verificate la partita IVA attiva e la destinazione strumentale dell'impianto. Attenzione all'utenza: un impianto su immobile a uso abitativo con utenza domestica non regge una pratica intestata a un'attivita'.",
    };
  }
  return null;
}
