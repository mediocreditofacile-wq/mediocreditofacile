// Le guide in PDF allegate agli inviti dei portali fornitore.
//
// ATTENZIONE — FILE SERVER-ONLY: legge dallo store Blob privato.
//
// Vivono su Blob e non dentro il bundle della funzione per due ragioni: pesano
// piu' di cento kilobyte in due e non c'e' motivo di spedirli a ogni deploy, e
// soprattutto si aggiornano senza ripubblicare il sito (si rigenerano e si
// ricaricano con npm run guide:carica).
//
// I PDF si generano con scripts/genera_guide.py nel repo ~/dev/mcf-prospetti-pv,
// che e' dove stanno reportlab, i font Manrope e il logo.

import { get } from '@vercel/blob';
import { env } from './db';

export interface Guida {
  pathname: string;
  /** Nome con cui l'agente la vede in allegato */
  filename: string;
}

export const GUIDE: Guida[] = [
  {
    pathname: 'guide/Guida_Noleggio_Operativo_MCF.pdf',
    filename: 'Guida al noleggio operativo - Mediocredito Facile.pdf',
  },
  {
    pathname: 'guide/Guida_Portale_MCF.pdf',
    filename: 'Guida al portale - Mediocredito Facile.pdf',
  },
];

/** Le guide restano in memoria: la funzione e' calda e gli inviti sono tanti. */
let cache: { filename: string; content: string }[] | null = null;

/**
 * Legge le guide dallo store e le prepara per l'allegato.
 * Se una non c'e' o lo store non risponde, torna quello che ha: un invito
 * senza allegati arriva comunque, un invito che non parte no.
 */
export async function allegatiGuide(): Promise<{ filename: string; content: string }[]> {
  if (cache) return cache;
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return [];

  const trovate: { filename: string; content: string }[] = [];
  for (const g of GUIDE) {
    try {
      const res = await get(g.pathname, { access: 'private', token });
      if (!res || res.statusCode !== 200 || !res.stream) continue;
      const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
      trovate.push({ filename: g.filename, content: buf.toString('base64') });
    } catch (e) {
      console.warn(JSON.stringify({ event: 'guida_non_letta', pathname: g.pathname, error: String(e) }));
    }
  }
  if (trovate.length === GUIDE.length) cache = trovate;
  return trovate;
}
