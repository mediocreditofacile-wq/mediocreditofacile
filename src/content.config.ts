import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    author: z.string().default('Alberto Amà'),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    cluster: z
      .enum(['noleggio', 'leasing', 'finanziamenti', 'agevolazioni', 'fotovoltaico', 'casi-studio'])
      .optional(),
    // Territorio di riferimento: chiave del registro in src/data/pagine-locali.ts.
    // Ogni articolo nuovo va collegato alla sua pagina servizio locale.
    territorio: z.string().optional(),
  }),
});

export const collections = { blog };
