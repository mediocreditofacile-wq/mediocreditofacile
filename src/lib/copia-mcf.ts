// Fase sperimentale decisa da Alberto il 16/10/2026: fino al 31/12/2026 ogni
// mail che il sito manda a un destinatario esterno (inviti ai portali, reset
// della password) parte con Mediocredito Facile in copia nascosta, per
// controllare che sia tutto in ordine. Il 1° gennaio 2027 si spegne da sola.
//
// Scelta di Alberto: copia nascosta vera, link di accesso compreso. Chi apre
// per primo il link di un invito o di un reset sceglie la password di quella
// persona: i link nella casella di MCF non si cliccano.
//
// Per Resend ogni destinatario in copia conta come una mail sul tetto del piano
// (100 al giorno): finche' la copia e' attiva la coda degli inviti va a giri
// dimezzati, cosi' resta posto per le notifiche di preventivi e pratiche.

const MCF = 'mediocreditofacile@gmail.com';
/** Ultimo giorno della fase sperimentale, in ora italiana, compreso */
export const FINE_COPIA_MCF = '2026-12-31';

/** AAAA-MM-GG in ora italiana */
function giornoItaliano(quando: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(quando);
}

export function copiaMcfAttiva(quando: Date = new Date()): boolean {
  return giornoItaliano(quando) <= FINE_COPIA_MCF;
}

/** Chi mettere in copia nascosta: MCF, se fra i destinatari non c'e' gia' */
export function copiaNascostaMcf(destinatari: string[], quando: Date = new Date()): string[] {
  if (!copiaMcfAttiva(quando)) return [];
  const giaMcf = destinatari.some((d) => d.trim().toLowerCase() === MCF);
  return giaMcf ? [] : [MCF];
}

/** Inviti per giro della coda: con la copia attiva ogni invito vale due mail */
export function invitiPerGiro(quando: Date = new Date()): number {
  return copiaMcfAttiva(quando) ? 40 : 80;
}
