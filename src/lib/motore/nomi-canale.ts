// I nomi dei canali di quotazione, uno solo per le mail a MCF e per il Pannello MCF.
//
// ATTENZIONE — FILE SERVER-ONLY: sono nomi di locatori. Escono solo verso MCF (mail ad
// Alberto, API del pannello admin); mai verso referente e agente, mai nel bundle del
// browser: il pannello li riceve dall'API admin.
//
// Due elenchi di id, una mappa di nomi: i canali del motore (app.carrozzeria.canali, in
// config-distinta.ts) e quelli delle pratiche lavorate fuori dal portale
// (app.pratica_esterna.canale, gli stessi del seed). La pratica recente nelle mail
// porta l'uno o l'altro, e Alberto deve leggere "Rete Rent", non "reterent".

import type { IdCanale } from './config-distinta';

/** I canali delle pratiche lavorate fuori dal portale: gli stessi del seed */
export const CANALI_ESTERNI = ['pagarent', 'reterent', 'grenke', 'ifis'] as const;
export type CanaleEsterno = (typeof CANALI_ESTERNI)[number];

/** Il nome di ogni canale, del motore e delle pratiche esterne */
export const NOMI_CANALE: Record<IdCanale | CanaleEsterno, string> = {
  econocom: 'Econocom',
  grenke: 'Grenke',
  pagarent: 'Pagarent',
  reterent: 'Rete Rent',
  ifis: 'Ifis',
};

/**
 * Il nome di un canale come lo legge MCF. Un id che non conosciamo resta com'e' (meglio
 * l'id che niente), un canale assente resta null: chi scrive la mail dice "non indicato".
 */
export function nomeCanale(id: string | null | undefined): string | null {
  if (!id) return null;
  return (NOMI_CANALE as Record<string, string>)[id] ?? id;
}
