export const prerender = false;

// Endpoint del portale partner Expo Energia Srl (/tools/expo-energia).
// Tutta la logica (id pratica, record su Blob, mail Resend con i link ai
// documenti, inoltro Zapier) vive in src/lib/pratiche-partner.ts.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPratica } from '../../lib/pratiche-partner';

export async function POST({ request }: { request: Request }) {
  return gestisciPratica(request, PORTALI_PARTNER['expo-energia'], {
    documentiExtra: ["Preventivo del fornitore dell'impianto / del bene"],
    notaLavorazione:
      'Partner: Expo Energia Srl (Massimo Palermo). Caricare su ReteRent (ESG fotovoltaico / Pioneer hardware) o PagaRent in base al merito.',
  });
}
