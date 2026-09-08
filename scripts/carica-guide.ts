// Carica sullo store Blob privato i PDF delle guide che si allegano agli inviti.
//
// I PDF li genera scripts/genera_guide.py nel repo ~/dev/mcf-prospetti-pv, che e'
// dove vivono reportlab, i font Manrope e il logo. Da li' finiscono qui.
//
// Uso: npm run guide:carica -- <cartella-con-i-pdf>

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { put } from '@vercel/blob';
import { env } from '../src/lib/db';
import { GUIDE } from '../src/lib/guide';

const dir = process.argv[2] ?? process.argv[3];
if (!dir) {
  console.error('Indica la cartella con i PDF. Es: npm run guide:carica -- ~/dev/mcf-prospetti-pv/out');
  process.exit(1);
}

const token = env('BLOB_READ_WRITE_TOKEN');
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN non configurato');

for (const g of GUIDE) {
  const bytes = await readFile(join(dir, basename(g.pathname)));
  await put(g.pathname, bytes, {
    access: 'private',
    contentType: 'application/pdf',
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  console.log(`caricata ${g.pathname} (${Math.round(bytes.length / 1024)} KB)`);
}
process.exit(0);
