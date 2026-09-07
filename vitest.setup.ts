// Carica .env.local nei test: il branch Neon di prova e il segreto di Better
// Auth stanno li'. In CI il file non c'e' e i test che toccano il database si
// saltano da soli, invece di fallire per una variabile mancante.

import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const riga of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = riga.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, chiave, grezzo] = m;
    if (process.env[chiave]) continue;
    process.env[chiave] = grezzo.trim().replace(/^["']|["']$/g, '');
  }
}
