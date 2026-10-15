// Il catalogo del settore "macchine" nel browser: famiglie, allestimenti e
// accessori, con le regole dei contatori. Funzioni pure, provate nei test.
// Il controllo vero lo rifa' il server (src/lib/motore/proposte-macchine.ts).

export interface VoceVista { codice: string; nome: string; prezzo: number; attributi: Record<string, any> }
export interface Famiglia { nome: string; da: number; varianti: VoceVista[]; accessori: VoceVista[] }

export const ETICHETTA_ALLESTIMENTO: Record<string, string> = {
  cavo: 'a cavo',
  batteria: 'a batteria',
  steam: 'steam (vapore)',
};

/** Le macchine raggruppate per famiglia, nell'ordine del catalogo, con i loro accessori */
export function famiglie(catalogo: VoceVista[]): Famiglia[] {
  const out = new Map<string, Famiglia>();
  for (const v of catalogo) {
    if (v.attributi?.tipo === 'accessorio') continue;
    const nome = String(v.attributi?.famiglia ?? v.nome);
    const f = out.get(nome) ?? { nome, da: v.prezzo, varianti: [], accessori: [] };
    f.varianti.push(v);
    f.da = Math.min(f.da, v.prezzo);
    out.set(nome, f);
  }
  for (const v of catalogo) {
    if (v.attributi?.tipo !== 'accessorio') continue;
    out.get(String(v.attributi.famiglia))?.accessori.push(v);
  }
  return [...out.values()];
}

/** Un passo avanti o indietro, mai sotto zero e mai oltre il massimo */
export function cambiaQuantita(attuale: number, verso: 1 | -1, passo = 1, massimo = 1): number {
  return Math.max(0, Math.min(massimo, attuale + verso * Math.max(1, passo)));
}

export function listinoConfigurazione(macchina: VoceVista, accessori: VoceVista[], quantita: Record<string, number>): number {
  const extra = accessori.reduce((s, a) => s + (quantita[a.codice] ?? 0) * a.prezzo, 0);
  return Math.round((macchina.prezzo + extra) * 100) / 100;
}
