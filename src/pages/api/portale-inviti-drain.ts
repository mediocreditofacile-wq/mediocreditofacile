export const prerender = false;

// Manda il prossimo scaglione di inviti. Lo chiama il cron di Vercel una volta
// al giorno (vedi vercel.json); il referente puo' anche farlo partire a mano
// dal pannello, tramite /api/portale-utenti.
//
// Protetto da CRON_SECRET: e' un endpoint che manda email, non deve poterlo
// svegliare chiunque passi di li'.

import { env } from '../../lib/db';
import { svuotaCoda } from '../../lib/inviti';

export async function GET({ request }: { request: Request }) {
  const atteso = env('CRON_SECRET');
  const dato = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!atteso || dato !== atteso) {
    return new Response(JSON.stringify({ ok: false, error: 'non_autorizzato' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const esito = await svuotaCoda();
  return new Response(JSON.stringify({ ok: true, ...esito }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
