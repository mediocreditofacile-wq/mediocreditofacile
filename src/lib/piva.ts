// Controllo formale della partita IVA italiana: 11 cifre e carattere di controllo.
// Modulo puro, senza dipendenze: lo usano sia gli endpoint sia le isole client,
// cosi' un refuso si ferma prima di spendere una chiamata.

export function pivaValida(p: string): boolean {
  if (!/^\d{11}$/.test(p)) return false;
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(p[i]);
    somma += i % 2 === 0 ? d : d * 2 > 9 ? d * 2 - 9 : d * 2;
  }
  return (10 - (somma % 10)) % 10 === Number(p[10]);
}

/** Toglie spazi, punti e il prefisso IT che la gente copia dalle fatture */
export function pulisciPiva(testo: string): string {
  return testo.replace(/^\s*IT/i, '').replace(/\D/g, '');
}
