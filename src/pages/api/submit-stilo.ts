export const prerender = false;

// Endpoint del portale partner STILO S.R.L. (/tools/stilo).
// Stessa logica di Expo Energia (src/lib/pratiche-partner.ts): cambiano il
// partner, il documento extra richiesto e la nota di lavorazione interna.
//
// Dal 13/10/2026 STILO e' ad accesso nominale: la pratica la manda solo chi ha
// una sessione su STILO, e porta con se' chi l'ha caricata. I documenti si
// accettano solo dalla cartella di quella persona (vedi /api/portale-upload).

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPratica } from '../../lib/pratiche-partner';
import { richiediSessione } from '../../lib/portale-auth';
import { cartellaDocumenti } from '../../lib/pratiche-visibilita';

export async function POST({ request }: { request: Request }) {
  const partner = PORTALI_PARTNER.stilo;
  const esito = await richiediSessione(request, { slugRichiesto: partner.slug, permesso: { preventivo: ['crea'] } });
  if (!esito.ok) return esito.risposta;
  const { contesto } = esito;

  return gestisciPratica(request, partner, {
    documentiExtra: ['Offerta / preventivo al cliente finale'],
    notaLavorazione:
      'Partner: STILO S.R.L. (Paolo Bonardi, responsabile commerciale). Canali attivi: BCC Rent & Lease (veloce su telefonia e server, esclude Horeca ed edilizia) oppure Grenke / ReteRent con tabella Pioneer.',
    autore: { userId: contesto.userId, email: contesto.email, nome: contesto.nome },
    cartellaDocumenti: cartellaDocumenti(partner.slug, contesto.userId),
  });
}
