export const prerender = false;

// Endpoint del portale fornitore InnovaLux (/tools/innovalux).
// Involucro sottile su src/lib/preventivi-pv.ts: qui cambia solo il partner.

import { PORTALI_PARTNER } from '../../data/portali-partner';
import { gestisciPreventivo } from '../../lib/preventivi-pv';

export async function POST({ request }: { request: Request }) {
  return gestisciPreventivo(request, PORTALI_PARTNER['innovalux']);
}
