// Accanto alla linea di credito del Registro, nella scheda del cliente: perche'
// l'indicazione massima importo finanziabile vale quello che vale. Senza
// dipendenze, perche' la importa anche il codice del browser.

export function spiegazioneIndicazione(base: string | null): string {
  if (base === 'volume') return 'cioè il 15% del fatturato';
  if (base === 'patrimonio') return 'cioè il patrimonio netto';
  if (base === 'tetto') return 'cioè il tetto previsto per il noleggio';
  return '';
}
