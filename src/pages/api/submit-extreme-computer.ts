export const prerender = false;

// Endpoint del portale partner EXTREME COMPUTER (/tools/extreme-computer).
// Stessa logica di Unidima/Full Service (src/lib/pratiche-partner.ts): cambiano
// il partner, il documento extra richiesto e la nota di lavorazione interna.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPratica } from '../../lib/pratiche-partner';

export async function POST({ request }: { request: Request }) {
  return gestisciPratica(request, PORTALI_PARTNER['extreme-computer'], {
    documentiExtra: ['Offerta / preventivo al cliente finale'],
    notaLavorazione:
      "Partner: EXTREME COMPUTER di Cinnella Luca (Potenza, P.IVA 01327710768, direzione@extremecomputer.it). Impresa individuale attiva dal 1998, un addetto, ATECO 26.20.00. Canale primario PagaRent, alternativa ReteRent/Grenke tabella Pioneer: la rotazione la decide MCF sul merito del cliente finale. Beni: PC e workstation, server e NAS, gruppi di continuita', networking, videosorveglianza, software. Verificare lo stato del censimento fornitore prima di promettere il pagamento diretto: fino al perfezionamento le pratiche le carica MCF.",
  });
}
