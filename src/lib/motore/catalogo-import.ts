// Le righe del catalogo di una carrozzeria, dal Pannello MCF (una voce o le righe
// incollate da Excel). Funzione pura: l'API la usa, i test la provano.
//
// Colonne riconosciute: codice, nome, prezzo, descrizione; sul fotovoltaico kwp,
// accumulo, installazione; sul settore macchine famiglia, allestimento (cavo,
// batteria, steam), tipo (accessorio), passo, massimo, nota.

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
  if (testo(r.tipo, 20).toLowerCase().startsWith('acc')) {
    // Un accessorio senza famiglia non si puo' offrire con nessuna macchina
    if (!famiglia) return null;
    const passo = Math.max(1, Math.round(numero(r.passo)) || 1);
    attributi.tipo = 'accessorio';
    attributi.passo = passo;
    attributi.massimo = Math.max(passo, Math.round(numero(r.massimo)) || passo);
    const nota = testo(r.nota, 60);
    if (nota) attributi.nota = nota;
  } else {
    const all = testo(r.allestimento, 20).toLowerCase();
    if (['cavo', 'batteria', 'steam'].includes(all)) attributi.allestimento = all;
  }

  return { codice, nome, descrizione: testo(r.descrizione, 400) || null, prezzo: Math.round(prezzo * 100) / 100, attributi };
}
