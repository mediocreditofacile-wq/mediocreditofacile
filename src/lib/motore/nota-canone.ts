// La frase fissa "da confermare" accanto al canone del noleggio, sul settore mezzi.
//
// Modulo puro, senza dipendenze: lo usano il PDF (pdf-mezzi.ts, server) e lo schermo
// (proposte-mezzi.ts, browser), cosi' la regola e' una sola. La nota del listino Econocom
// dice gia' "da confermare": la frase fissa si aggiunge solo quando la nota non lo dice,
// altrimenti nello stesso riquadro comparirebbe due volte.

export function serveFraseDaConfermare(daConfermare: boolean, nota: string | null | undefined): boolean {
  return daConfermare && !/da confermare/i.test(nota ?? '');
}
