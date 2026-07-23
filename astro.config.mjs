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
      // Pagine noindex: vanno tenute FUORI dalla sitemap, altrimenti
      // mandiamo a Google segnali in conflitto (sitemap "indicizzami" +
      // meta robots "noindex"). Match esatto sul pathname cosi' /tools/datron
      // non cattura /tools/datron-ecommerce.
      filter(page) {
        const noindexPaths = [
          '/grazie',
          '/grazie-agev',
          '/grazie-fin',
          '/design-system/icons',
          '/tools/age-srl',
          '/tools/arca-energia',
          '/tools/datron',
          '/tools/datron-ecommerce',
          '/tools/duplex',
          '/tools/econocom-pa',
          '/tools/edilizia-gierre',
          '/tools/energyteam',
          '/tools/expo-energia',
          '/tools/gruppo-barone',
          '/tools/marotta',
          '/tools/simulatore-leasing-fornitori',
          '/tools/simulazione-leasing',
          '/tools/stilo',
        ];
        const clean = new URL(page).pathname.replace(/\/$/, '');
        return !noindexPaths.includes(clean);
      },
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
