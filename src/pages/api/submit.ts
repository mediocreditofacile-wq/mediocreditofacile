export const prerender = false;

// Endpoint dei form contatti del sito. Tutta la logica sta in src/lib/lead.ts,
// condivisa con /api/fiera-lead.
import { riceviLead } from '../../lib/lead';

export async function POST({ request }: { request: Request }) {
  const { response } = await riceviLead(await request.formData());
  return response;
}
