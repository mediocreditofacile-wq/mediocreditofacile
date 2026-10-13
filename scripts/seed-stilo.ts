// Porta il portale STILO (/tools/stilo) sugli accessi personali.
//
// Idempotente: rilanciarlo non duplica niente. NON manda email: gli inviti
// restano in coda (app.invito) finche' non partono col giro delle 7 o con
// "Manda ora" dalla sezione "La tua rete" del portale.
//
// Persone, decise da Alberto il 13/10/2026 sulla mail di Paolo Bonardi del 12/10:
//  - Paolo Bonardi, referente: vede tutte le pratiche STILO e invita i suoi
//  - commerciale@ e info@stilofirenze.it, agenti: vedono solo le pratiche che caricano
// L'admin MCF non diventa membro: entra da admin, che vede ogni fornitore,
// cosi' nella rete di Paolo compaiono solo le persone di STILO.
//
// Le pratiche restano su Blob (pratiche/stilo/): qui non si tocca niente di loro.
//
//   npm run seed:stilo               produzione: organizzazione, fornitore, inviti in coda
//   npm run seed:stilo -- --prova    branch di prova: organizzazione e fornitore, e gli
//                                    utenti di prova (seed:motore-demo -- --prova)
//                                    collegati come referente e due agenti. Nessun invito.
// Da reti dove Postgres diretto non passa: DB_VIA_WEBSOCKET=1 davanti (src/lib/db.ts).

import { randomUUID } from 'node:crypto';

const PROVA = process.argv.includes('--prova');
if (PROVA) {
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST mancante in .env.local');
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const { query, queryUna } = await import('../src/lib/db');

const SLUG = 'stilo';
const NOME = 'STILO S.R.L.';
const PREFISSO = 'ST'; // lo stesso delle pratiche: ST-AAAAMMGG-HHMMSS
const ADMIN_EMAIL = 'mediocreditofacile@gmail.com';

const INVITI: { email: string; nome: string; ruolo: 'referente' | 'agente' }[] = [
  { email: 'bonardipaolo@gmail.com', nome: 'Paolo Bonardi', ruolo: 'referente' },
  { email: 'commerciale@stilofirenze.it', nome: 'Commerciale STILO', ruolo: 'agente' },
  { email: 'info@stilofirenze.it', nome: 'Info STILO', ruolo: 'agente' },
];

const UTENTI_PROVA: [string, 'referente' | 'agente'][] = [
  ['referente.demo@example.invalid', 'referente'],
  ['agente.demo@example.invalid', 'agente'],
  ['agente2.demo@example.invalid', 'agente'],
];

async function membro(orgId: string, email: string, ruolo: string): Promise<boolean> {
  const u = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [email]);
  if (!u) return false;
  await query(
    `INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt")
     SELECT $1,$2,$3,$4, now()
      WHERE NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = $2 AND "userId" = $3)`,
    [randomUUID(), orgId, u.id, ruolo],
  );
  return true;
}

async function main() {
  console.log(`database: ${PROVA ? 'branch di PROVA' : 'PRODUZIONE'}`);

  // 1. Organizzazione: lo slug coincide con quello del portale e del registro partner
  let org = await queryUna<{ id: string }>(`SELECT id FROM "organization" WHERE slug = $1`, [SLUG]);
  if (!org) {
    const id = randomUUID();
    await query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`, [id, NOME, SLUG]);
    org = { id };
    console.log('organizzazione creata');
  } else {
    console.log('organizzazione gia presente');
  }

  // 2. Fornitore. tabella_canoni resta al default: il simulatore di STILO
  //    (Pioneer e BCC) gira nella pagina, non passa dal listino del server.
  await query(
    `INSERT INTO app.fornitore (slug, organization_id, nome, prefisso)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, prefisso = EXCLUDED.prefisso`,
    [SLUG, org.id, NOME, PREFISSO],
  );
  console.log(`fornitore ${SLUG} allineato`);

  if (PROVA) {
    for (const [email, ruolo] of UTENTI_PROVA) {
      if (!(await membro(org.id, email, ruolo))) {
        throw new Error(`${email} non esiste: lancia prima seed:motore-demo -- --prova`);
      }
    }
    console.log('utenti di prova collegati (referente e due agenti); admin.demo entra da admin');
    console.log(`\nfatto. Portale: /tools/${SLUG}`);
    process.exit(0);
  }

  // 3. Inviti in coda, a nome dell'admin MCF. Partono quando lo decide Alberto.
  const admin = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [ADMIN_EMAIL]);
  if (!admin) throw new Error('admin MCF assente: lancia prima seed:green-go, che lo crea');

  for (const inv of INVITI) {
    const dentro = await queryUna(
      `SELECT 1 FROM "member" m JOIN "user" u ON u.id = m."userId"
        WHERE m."organizationId" = $1 AND lower(u.email) = lower($2)`,
      [org.id, inv.email],
    );
    const aperto = await queryUna(
      `SELECT 1 FROM app.invito
        WHERE organization_id = $1 AND lower(email) = lower($2) AND stato IN ('da_inviare', 'inviato')`,
      [org.id, inv.email],
    );
    if (dentro || aperto) {
      console.log(`${inv.email}: ${dentro ? 'gia dentro' : 'invito gia aperto'}`);
      continue;
    }
    await query(
      `INSERT INTO app.invito (organization_id, email, nome, ruolo, creato_da) VALUES ($1,$2,$3,$4,$5)`,
      [org.id, inv.email, inv.nome, inv.ruolo, admin.id],
    );
    console.log(`${inv.email}: invito da ${inv.ruolo} in coda (non ancora inviato)`);
  }

  console.log(`\nfatto. Portale: /tools/${SLUG}`);
  process.exit(0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
