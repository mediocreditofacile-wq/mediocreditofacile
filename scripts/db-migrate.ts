// Applica al Postgres Neon lo schema che Better Auth si aspetta, generandolo
// dalla configurazione vera (src/lib/auth.ts) invece che da un CLI a parte:
// il CLI pubblicato e' fermo a una versione piu' vecchia della libreria e
// produrrebbe tabelle disallineate.
//
// Uso: npm run db:migrate           mostra le istruzioni SQL senza eseguirle
//      npm run db:migrate -- --esegui   le applica
//
// Le tabelle di Better Auth vivono nello schema public; le nostre stanno in
// schema app e le crea scripts/sql/001-app-schema.sql.

import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../src/lib/auth';

const esegui = process.argv.includes('--esegui');

const { toBeCreated, toBeAdded, runMigrations, compileMigrations } = await getMigrations(
  auth.options as Parameters<typeof getMigrations>[0],
);

const tabelleNuove = toBeCreated.map((t) => t.table);
const colonneNuove = toBeAdded.map((t) => `${t.table} (${Object.keys(t.fields).join(', ')})`);

if (!tabelleNuove.length && !colonneNuove.length) {
  console.log('Schema Better Auth gia allineato: niente da fare.');
  process.exit(0);
}

console.log('Tabelle da creare:', tabelleNuove.length ? tabelleNuove.join(', ') : 'nessuna');
console.log('Colonne da aggiungere:', colonneNuove.length ? colonneNuove.join(' | ') : 'nessuna');

if (!esegui) {
  console.log('\n--- SQL ---\n');
  console.log(await compileMigrations());
  console.log('\nNiente e stato applicato. Rilancia con: npm run db:migrate -- --esegui');
  process.exit(0);
}

await runMigrations();
console.log('\nMigrazione applicata.');
process.exit(0);
