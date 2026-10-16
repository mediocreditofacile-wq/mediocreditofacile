// Le righe del catalogo di una carrozzeria, dal Pannello MCF (una voce o le righe
// incollate da Excel). Funzioni pure: il pannello legge l'incollato, l'API valida
// ogni voce, i test le provano.
//
// Colonne riconosciute: codice, nome, prezzo, descrizione; sul fotovoltaico kwp,
// accumulo, installazione; sul settore macchine famiglia, allestimento (cavo,
// batteria, steam), tipo (accessorio), passo, massimo, nota (o note).
// L'allestimento vale anche sull'accessorio: lo offre solo con quella versione.

export const numero = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim().replace(/[€\s]/g, '');
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
export const testo = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export interface Voce { codice: string; nome: string; descrizione: string | null; prezzo: number; attributi: Record<string, unknown> }

/** Una riga del catalogo, validata. Null se non regge. */
export function leggiVoce(r: Record<string, unknown>): Voce | null {
  const codice = testo(r.codice, 40).toUpperCase().replace(/\s+/g, '-');
  const nome = testo(r.nome, 160);
  const prezzo = numero(r.prezzo);
  if (!codice || !nome || !(prezzo > 0) || prezzo > 10_000_000) return null;
  const attributi: Record<string, unknown> = {};

  // fotovoltaico
  const kwp = numero(r.kwp);
  const kwh = numero(r.kwh_accumulo ?? r.accumulo);
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
    if (!famiglia) return null;
    // Sull'accessorio l'allestimento restringe (la batteria di scorta solo sulla
    // versione a batteria): scritto male lo aprirebbe a tutte, meglio scartarlo
    if (all && !allestimento) return null;
    const passo = Math.max(1, Math.round(numero(r.passo)) || 1);
    attributi.tipo = 'accessorio';
    if (allestimento) attributi.allestimento = allestimento;
    attributi.passo = passo;
    attributi.massimo = Math.max(passo, Math.round(numero(r.massimo)) || passo);
    const nota = testo(r.nota, 60);
    if (nota) attributi.nota = nota;
  } else if (allestimento) {
    attributi.allestimento = allestimento;
  }

  const descrizione = testo(r.descrizione, 400) || (accessorio ? '' : testo(r.nota, 400)) || null;
  return { codice, nome, descrizione, prezzo: Math.round(prezzo * 100) / 100, attributi };
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
};

/** Righe incollate da Excel -> oggetti. Le colonne si riconoscono dall'intestazione. */
export function leggiIncollato(testo: string): Record<string, string>[] {
  const righe = testo.split(/\r?\n/).map((r) => r.trimEnd()).filter((r) => r.trim());
  if (righe.length < 2) return [];
  const sep = righe[0].includes('\t') ? '\t' : righe[0].includes(';') ? ';' : ',';
  const testata = righe[0].split(sep).map((h) => SINONIMI[h.trim().toLowerCase().replace(/[^a-z_]/g, '')] ?? '');
  return righe.slice(1).map((r) => {
    const celle = r.split(sep);
    const o: Record<string, string> = {};
    testata.forEach((k, i) => { if (k) o[k] = (celle[i] ?? '').trim(); });
    return o;
  });
}
