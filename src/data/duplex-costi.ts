// Costi accessori di un noleggio Grenke, quelli che non stanno nel canone.
// Fonte: guida operativa Rete Rent-GRENKE e "Alla scoperta del noleggio - guida
// operativa 2026" del kit ReteRent, lette il 23/09/2026.
// Servono al simulatore Duplex e al preventivo PDF che l'agente manda al cliente:
// stanno qui e non nei componenti perche' i due devono dire la stessa cifra.

/** Spese di istruttoria una tantum, per fascia di imponibile. */
export function speseIstruttoria(imponibile: number): number {
  if (imponibile <= 12_500) return 75;
  if (imponibile <= 25_000) return 90;
  if (imponibile <= 100_000) return 100;
  return 200;
}

/**
 * Polizza all risk. Non e' compresa nel canone: si fattura al perfezionamento del
 * contratto e poi a ogni inizio anno. Le macchine per la pulizia stanno al 3,55%
 * del costo imponibile iniziale, con quota minima 115 euro l'anno: sotto i 3.239
 * euro di macchina si paga sempre il minimo.
 */
export const ASSICURAZIONE_PERC = 3.55;
export const ASSICURAZIONE_MINIMA = 115;

export function polizzaAnnua(imponibile: number): number {
  const teorica = (imponibile * ASSICURAZIONE_PERC) / 100;
  return Math.max(ASSICURAZIONE_MINIMA, Math.round(teorica * 100) / 100);
}

/** Annualita' di polizza fatturate su una durata: la prima alla decorrenza, poi una per anno. */
export function annualitaPolizza(durataMesi: number): number {
  return Math.ceil(durataMesi / 12);
}

/**
 * Riscatto finale in percentuale sull'imponibile, tariffario Grenke per "Altri beni
 * strumentali". E' facoltativo: in alternativa si restituisce il bene o si prosegue.
 */
export const RISCATTO_PERC: Record<number, number> = { 24: 10, 36: 6, 48: 4, 60: 3 };

export function riscatto(imponibile: number, durataMesi: number): number | null {
  const perc = RISCATTO_PERC[durataMesi];
  if (perc === undefined) return null;
  return Math.round(((imponibile * perc) / 100) * 100) / 100;
}

/**
 * Quanto spende il cliente sul contratto: canoni, istruttoria e riscatto.
 * La polizza NON entra nel totale ed e' una voce a se', 115 euro l'anno: dipende da
 * quanti anni solari tocca il contratto e il cliente puo' anche assicurarsi in proprio
 * (le condizioni Grenke lo prevedono). Metterla dentro darebbe un totale che sembra
 * certo e non lo e'.
 */
export function totaleContratto(imponibile: number, canoneMensile: number, durataMesi: number): number {
  const canoni = canoneMensile * durataMesi;
  const risc = riscatto(imponibile, durataMesi) ?? 0;
  return Math.round((canoni + speseIstruttoria(imponibile) + risc) * 100) / 100;
}
