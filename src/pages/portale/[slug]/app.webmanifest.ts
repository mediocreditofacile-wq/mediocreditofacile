// Il manifest dell'app del portale: nome, icone e colori che il telefono usa
// quando l'agente aggiunge il portale alla schermata Home. Esiste solo per i
// portali con l'app accesa (src/lib/motore/app-portale.ts).

import type { APIRoute } from 'astro';
import { appDelPortale, manifestPortale } from '../../../lib/motore/app-portale';
import { carrozzeriaDaSlug } from '../../../lib/motore/carrozzeria';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = String(params.slug ?? '');
  const app = appDelPortale(slug);
  if (!app) return new Response('Nessuna app per questo portale', { status: 404 });

  // Il colore della testata viene dalla carrozzeria; se il database non
  // risponde il manifest esce lo stesso, col colore dell'icona
  const c = await carrozzeriaDaSlug(slug).catch(() => null);
  return new Response(JSON.stringify(manifestPortale(slug, app, c?.brand.colore ?? null)), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
