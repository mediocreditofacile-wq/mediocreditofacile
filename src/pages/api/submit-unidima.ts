export const prerender = false;

// Endpoint del portale partner UNIDIMA SRL (/tools/unidima).
// Stessa logica di Full Service/Stilo (src/lib/pratiche-partner.ts): cambiano il
// partner, il documento extra richiesto e la nota di lavorazione interna.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPratica } from '../../lib/pratiche-partner';

export async function POST({ request }: { request: Request }) {
  return gestisciPratica(request, PORTALI_PARTNER['unidima'], {
    documentiExtra: ['Offerta / preventivo al cliente finale'],
    notaLavorazione:
      'Partner: UNIDIMA SRL (Fabio Maresca, referente commerciale). Canale: ReteRent/Grenke tabella Pioneer su ledwall, schermi LED e display. Censimento fornitore su portale Contacto in corso: fino al perfezionamento la pratica la carica MCF. Grenke paga il fornitore a collaudo avvenuto, merce importata dalla Cina: verificare i tempi di consegna.',
  });
}
