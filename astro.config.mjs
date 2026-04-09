// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
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
