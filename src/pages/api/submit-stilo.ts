export const prerender = false;

// Endpoint del portale partner STILO S.R.L. (/tools/stilo).
// Stessa logica di Expo Energia (src/lib/pratiche-partner.ts): cambiano il
// partner, il documento extra richiesto e la nota di lavorazione interna.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPratica } from '../../lib/pratiche-partner';

export async function POST({ request }: { request: Request }) {
  return gestisciPratica(request, PORTALI_PARTNER.stilo, {
    documentiExtra: ['Offerta / preventivo al cliente finale'],
    notaLavorazione:
      'Partner: STILO S.R.L. (Paolo Bonardi, responsabile commerciale). Canali attivi: BCC Rent & Lease (veloce su telefonia e server, esclude Horeca ed edilizia) oppure Grenke / ReteRent con tabella Pioneer.',
  });
}
