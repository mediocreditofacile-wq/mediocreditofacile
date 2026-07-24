export const prerender = false;

// Endpoint del portale partner FULL SERVICE S.R.L. (/tools/full-service).
// Stessa logica di Stilo/Expo Energia (src/lib/pratiche-partner.ts): cambiano il
// partner, il documento extra richiesto e la nota di lavorazione interna.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPratica } from '../../lib/pratiche-partner';

export async function POST({ request }: { request: Request }) {
  return gestisciPratica(request, PORTALI_PARTNER['full-service'], {
    documentiExtra: ['Offerta / preventivo al cliente finale'],
    notaLavorazione:
      'Partner: FULL SERVICE S.R.L. (Maria Orsola Corcione, referente commerciale). Canale attivo: BCC Rent & Lease su beni strumentali IT e attrezzature (assicurazione all risk gia\' compresa nella rata).',
  });
}
