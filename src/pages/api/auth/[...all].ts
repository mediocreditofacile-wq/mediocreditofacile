export const prerender = false;

// Handler di Better Auth: login, logout, sessione, reset password, inviti e
// gestione dei membri dell'organizzazione passano tutti da qui.
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

export const ALL: APIRoute = async (ctx) => {
  // Il rate limiting di Better Auth ragiona sull'IP del chiamante, che dietro
  // Vercel arriva solo in questo header.
  ctx.request.headers.set('x-forwarded-for', ctx.clientAddress);
  return auth.handler(ctx.request);
};
