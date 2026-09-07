// Applica i file .sql di scripts/sql in ordine di nome.
// Sono idempotenti (IF NOT EXISTS), quindi rilanciarli non fa danni.
//
// Uso: npm run db:sql

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPool } from '../src/lib/db';

const dir = join(process.cwd(), 'scripts', 'sql');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

const pool = getPool();
for (const f of files) {
  const sql = await readFile(join(dir, f), 'utf8');
  await pool.query(sql);
  console.log(`applicato ${f}`);
}
await pool.end();
