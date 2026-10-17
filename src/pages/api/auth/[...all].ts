export const prerender = false;

// Handler di Better Auth: login, logout, sessione e reset password passano da
// qui. Inviti e rapporti con il fornitore no: li gestiscono src/lib/inviti.ts,
// /api/portale-invito e /api/portale-utenti, e le route /organization/* di
// Better Auth sono chiuse (src/lib/rotte-auth.ts).
//
// Sta sul nostro dominio, quindi il cookie di sessione e' first-party: niente
// cookie di terze parti, che Safari e Chrome trattano sempre peggio.
//
// Il controllo di origine di Astro e' disattivato a livello globale in
// astro.config.mjs (serviva per i form dietro Vercel): qui non e' un problema
// perche' Better Auth ha il proprio controllo su trustedOrigins, e i nostri
// endpoint autenticati verificano l'Origin dentro richiediSessione().

import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';
import { rottaAuthChiusa } from '../../../lib/rotte-auth';

export const ALL: APIRoute = async (ctx) => {
  const percorso = new URL(ctx.request.url).pathname;
  if (rottaAuthChiusa(percorso)) {
    // Il sito non chiama mai queste route: una richiesta qui e' un tentativo
    // di cambiare ruoli o membri scavalcando il portale, e resta nei log.
    console.warn(JSON.stringify({ event: 'auth_rotta_chiusa', percorso, metodo: ctx.request.method }));
    return new Response(JSON.stringify({ error: 'non_trovato' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Il rate limiting di Better Auth ragiona sull'IP del chiamante, che dietro
  // Vercel arriva solo in questo header.
  ctx.request.headers.set('x-forwarded-for', ctx.clientAddress);
  return auth.handler(ctx.request);
};
