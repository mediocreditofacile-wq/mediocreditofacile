// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  integrations: [preact()],
  site: 'https://mediocreditofacile.it',
});
