// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  // Astro 5 ha security.checkOrigin=true di default: dietro Vercel il check fallisce
  // perche' Host arriva come deployment URL (mediocreditofacile-xxx.vercel.app)
  // e Origin e' www.mediocreditofacile.it, quindi ogni POST multipart riceve 403.
  // Disabilitiamo: la protezione CSRF qui e' ridondante perche' /api/submit non
  // modifica stato autenticato (e' pure lead capture), c'e' honeypot nel form,
  // e Resend+Zapier sono rate-limited.
  security: {
    checkOrigin: false,
  },
  integrations: [
    preact(),
    sitemap({
      // lastmod su ogni entry: senza questo Google deprioritizza il crawl
      // e gli URL restano in stato "Rilevata, ma non indicizzata".
      serialize(item) {
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
  ],
  site: 'https://www.mediocreditofacile.it',
});
