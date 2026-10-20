// Le righe del catalogo di una carrozzeria, dal Pannello MCF (una voce o le righe
// incollate da Excel). Funzioni pure: il pannello legge l'incollato, l'API valida
// ogni voce, i test le provano.
//
// Colonne riconosciute: codice, nome, prezzo, descrizione; sul fotovoltaico kwp,
// accumulo, installazione; sul settore macchine famiglia, allestimento (cavo,
// batteria, steam), tipo (accessorio), passo, massimo, nota (o note).
// L'allestimento vale anche sull'accessorio: lo offre solo con quella versione.
// Su ogni settore, e di fatto sul settore distinta: categoria (testo) e valido_fino
// (GG/MM/AAAA o AAAA-MM-GG, salvato come AAAA-MM-GG; una data impossibile non si
// salva e la voce resta valida, senza scadenza).

/** Il punto seguito da gruppi di tre cifre, senza virgola: "1.900", "6.375", "1.000.000" */
const PUNTO_MIGLIAIA = /^\d{1,3}(\.\d{3})+$/;
const pulito = (v: unknown) => String(v ?? '').trim().replace(/[€\s]/g, '');

/**
 * Un importo (prezzo, soglie, tetti): all'italiana. Il punto delle migliaia senza
 * decimali (1.900, come lo copia Excel) e' 1900: letto come decimale il prezzo
 * diventerebbe 1,90 senza che nessuno se ne accorga. Solo per importi in euro, dove
 * nessuno scrive tre decimali; per kWp e kWh c'e' numeroDecimale.
 */
export const numero = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = pulito(v);
  if (PUNTO_MIGLIAIA.test(s)) return parseFloat(s.replace(/\./g, ''));
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};

/** Un testo con il punto seguito da tre cifre e nessuna virgola: su un valore che non e' un importo non si sa se e' migliaia o decimali */
export const puntoAmbiguo = (v: unknown) => typeof v === 'string' && PUNTO_MIGLIAIA.test(pulito(v));

/**
 * Un valore che non e' un importo (kWp, kWh, passo, massimo). "6.375" puo' essere
 * 6,375 kWp o 6375: non si sceglie una lettura, esce NaN e chi legge scarta la riga.
 * Con la virgola ("6,375", "1.234,5") o con un decimale che non sono tre cifre
 * ("6.4") la lettura e' una sola.
 */
export const numeroDecimale = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (puntoAmbiguo(v)) return NaN;
  const s = pulito(v);
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};

/** Il motivo dello scarto di una riga con kWp o kWh scritti col punto e tre cifre */
export const AMBIGUO_KWP = 'kWp/kWh ambiguo: scrivi 6,375 o 6375';
const AMBIGUO_ACCESSORIO = 'passo/massimo ambiguo: scrivi il numero senza punto';
export const testo = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

/**
 * Una data di validita' -> AAAA-MM-GG, o null se non e' una data vera. Accetta
 * GG/MM/AAAA (anche a una cifra, come la copia Excel) e AAAA-MM-GG.
 */
export function dataValidita(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const it = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const [a, m, g] = it ? [+it[3], +it[2], +it[1]] : iso ? [+iso[1], +iso[2], +iso[3]] : [NaN, NaN, NaN];
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  // Il 31 febbraio diventerebbe il 3 marzo: si ricontrolla che il giorno sia quello scritto
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}

export interface Voce { codice: string; nome: string; descrizione: string | null; prezzo: number; attributi: Record<string, unknown> }

/** Una riga del catalogo, validata. Null se non regge. */
export function leggiVoce(r: Record<string, unknown>): Voce | null {
  const e = leggiVoceConMotivo(r);
  return e.ok ? e.voce : null;
}

/**
 * Come leggiVoce, ma una riga scartata dice perche' quando il perche' non e' il solito
 * (codice, nome o prezzo mancanti): kWp, kWh, passo o massimo ambigui.
 */
export function leggiVoceConMotivo(
  r: Record<string, unknown>,
): { ok: true; voce: Voce } | { ok: false; motivo: string | null } {
  const scarta = (motivo: string | null = null) => ({ ok: false as const, motivo });
  const codice = testo(r.codice, 40).toUpperCase().replace(/\s+/g, '-');
  const nome = testo(r.nome, 160);
  const prezzo = numero(r.prezzo);
  if (!codice || !nome || !(prezzo > 0) || prezzo > 10_000_000) return scarta();
  const attributi: Record<string, unknown> = {};

  // fotovoltaico: kWp e kWh non sono importi, il punto con tre cifre non si indovina
  const kwhGrezzo = r.kwh_accumulo ?? r.accumulo;
  if (puntoAmbiguo(r.kwp) || puntoAmbiguo(kwhGrezzo)) return scarta(AMBIGUO_KWP);
  const kwp = numeroDecimale(r.kwp);
  const kwh = numeroDecimale(kwhGrezzo);
  if (kwp > 0) attributi.kwp = kwp;
  if (kwh >= 0 && Number.isFinite(kwh)) attributi.kwh_accumulo = kwh;
  const inst = testo(r.installazione, 20).toLowerCase();
  if (['tetto', 'pensilina', 'terra'].includes(inst)) attributi.installazione = inst;

  // macchine
  const famiglia = testo(r.famiglia, 80);
  if (famiglia) attributi.famiglia = famiglia;
  const all = testo(r.allestimento, 20).toLowerCase();
  const allestimento = ['cavo', 'batteria', 'steam'].includes(all) ? all : null;
  const accessorio = testo(r.tipo, 20).toLowerCase().startsWith('acc');
  if (accessorio) {
    // Un accessorio senza famiglia non si puo' offrire con nessuna macchina
    if (!famiglia) return scarta();
    // Sull'accessorio l'allestimento restringe (la batteria di scorta solo sulla
    // versione a batteria): scritto male lo aprirebbe a tutte, meglio scartarlo
    if (all && !allestimento) return scarta();
    if (puntoAmbiguo(r.passo) || puntoAmbiguo(r.massimo)) return scarta(AMBIGUO_ACCESSORIO);
    const passo = Math.max(1, Math.round(numeroDecimale(r.passo)) || 1);
    attributi.tipo = 'accessorio';
    if (allestimento) attributi.allestimento = allestimento;
    attributi.passo = passo;
    attributi.massimo = Math.max(passo, Math.round(numeroDecimale(r.massimo)) || passo);
    const nota = testo(r.nota, 60);
    if (nota) attributi.nota = nota;
  } else if (allestimento) {
    attributi.allestimento = allestimento;
  }

  // distinta: la categoria del Pannello e la validita' del prezzo
  const categoria = testo(r.categoria, 80);
  if (categoria) attributi.categoria = categoria;
  const validoFino = dataValidita(r.valido_fino);
  if (validoFino) attributi.valido_fino = validoFino;

  const descrizione = testo(r.descrizione, 400) || (accessorio ? '' : testo(r.nota, 400)) || null;
  return { ok: true, voce: { codice, nome, descrizione, prezzo: Math.round(prezzo * 100) / 100, attributi } };
}

const SINONIMI: Record<string, string> = {
  codice: 'codice', cod: 'codice', sku: 'codice',
  nome: 'nome', descrizione_breve: 'nome', prodotto: 'nome', pacchetto: 'nome',
  prezzo: 'prezzo', listino: 'prezzo', importo: 'prezzo',
  kwp: 'kwp', potenza: 'kwp',
  accumulo: 'kwh_accumulo', kwh: 'kwh_accumulo', kwh_accumulo: 'kwh_accumulo', batteria: 'kwh_accumulo',
  // "note" e' la nota dell'accessorio; sulle altre voci, senza descrizione, la sostituisce
  descrizione: 'descrizione', note: 'nota',
  installazione: 'installazione',
  famiglia: 'famiglia', modello: 'famiglia',
  allestimento: 'allestimento', alimentazione: 'allestimento',
  tipo: 'tipo', passo: 'passo', step: 'passo', massimo: 'massimo', max: 'massimo', nota: 'nota',
  // distinta ("Validità" arriva qui senza accento, "Valido fino" senza spazio)
  categoria: 'categoria', famiglia_prodotto: 'categoria', famigliaprodotto: 'categoria',
  validita: 'valido_fino', valido_fino: 'valido_fino', validofino: 'valido_fino', scadenza: 'valido_fino',
};

/** L'intestazione di una colonna come chiave: minuscole, senza accenti, solo lettere e trattino basso */
const chiaveColonna = (h: string) =>
  h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z_]/g, '');

/** Righe incollate da Excel -> oggetti. Le colonne si riconoscono dall'intestazione. */
export function leggiIncollato(testo: string): Record<string, string>[] {
  const righe = testo.split(/\r?\n/).map((r) => r.trimEnd()).filter((r) => r.trim());
  if (righe.length < 2) return [];
  const sep = righe[0].includes('\t') ? '\t' : righe[0].includes(';') ? ';' : ',';
  const testata = righe[0].split(sep).map((h) => SINONIMI[chiaveColonna(h)] ?? '');
  return righe.slice(1).map((r) => {
    const celle = r.split(sep);
    const o: Record<string, string> = {};
    testata.forEach((k, i) => { if (k) o[k] = (celle[i] ?? '').trim(); });
    return o;
  });
}
