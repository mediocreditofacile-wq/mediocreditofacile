// Popola il fornitore GREEN-GO SRLS sul database di produzione.
//
// Idempotente: rilanciarlo non duplica niente.
//
// Non imposta nessuna password: l'accesso di Alberto nasce senza password
// utilizzabile e gliene arriva una per email, quella di Donato la sceglie lui
// dall'invito. Cosi' nessuna credenziale passa da qui.
//
// Uso: npm run seed:green-go

import { randomUUID, randomBytes } from 'node:crypto';
import { auth } from '../src/lib/auth';
import { query, queryUna } from '../src/lib/db';

const SLUG = 'green-go';
const NOME = 'GREEN-GO SRLS';
const PREFISSO = 'GG';
const TABELLA = 'esg'; // Grenke ESG++++
const ADMIN_EMAIL = 'mediocreditofacile@gmail.com';
const ADMIN_NOME = 'Alberto Ama';
const REFERENTE_EMAIL = 'info@greengoexperience.com';
const REFERENTE_NOME = 'Donato Di Zenzo';

async function main() {
  // 1. Organizzazione
  let org = await queryUna<{ id: string }>(`SELECT id FROM "organization" WHERE slug = $1`, [SLUG]);
  if (!org) {
    const id = randomUUID();
    await query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`, [id, NOME, SLUG]);
    org = { id };
    console.log('organizzazione creata');
  } else {
    console.log('organizzazione gia presente');
  }

  // 2. Fornitore
  await query(
    `INSERT INTO app.fornitore (slug, organization_id, nome, prefisso, tabella_canoni)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, tabella_canoni = EXCLUDED.tabella_canoni`,
    [SLUG, org.id, NOME, PREFISSO, TABELLA],
  );
  console.log(`fornitore ${SLUG} allineato (listino ${TABELLA})`);

  // 3. Admin MCF. Password casuale e mai comunicata: si entra dal link di
  //    recupero, che arriva sulla casella di Alberto.
  let admin = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [ADMIN_EMAIL]);
  let nuovoAdmin = false;
  if (!admin) {
    await auth.api.signUpEmail({
      body: { email: ADMIN_EMAIL, password: randomBytes(24).toString('base64url'), name: ADMIN_NOME },
      asResponse: true,
    });
    admin = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [ADMIN_EMAIL]);
    nuovoAdmin = true;
  }
  if (!admin) throw new Error('creazione admin fallita');

  await query(`UPDATE "user" SET role = 'admin', "emailVerified" = true WHERE id = $1`, [admin.id]);
  await query(
    `INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt")
     SELECT $1,$2,$3,'referente', now()
      WHERE NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = $2 AND "userId" = $3)`,
    [randomUUID(), org.id, admin.id],
  );
  console.log(`admin MCF ${nuovoAdmin ? 'creato' : 'gia presente'} e collegato a ${SLUG}`);

  // 4. Referente del fornitore, in coda. L'invito parte quando lo decidi tu.
  const gia = await queryUna(
    `SELECT 1 FROM app.invito WHERE organization_id = $1 AND lower(email) = lower($2)`,
    [org.id, REFERENTE_EMAIL],
  );
  const membro = await queryUna(
    `SELECT 1 FROM "member" m JOIN "user" u ON u.id = m."userId"
      WHERE m."organizationId" = $1 AND lower(u.email) = lower($2)`,
    [org.id, REFERENTE_EMAIL],
  );
  if (!gia && !membro) {
    await query(
      `INSERT INTO app.invito (organization_id, email, nome, ruolo, creato_da)
       VALUES ($1,$2,$3,'referente',$4)`,
      [org.id, REFERENTE_EMAIL, REFERENTE_NOME, admin.id],
    );
    console.log(`invito per ${REFERENTE_NOME} messo in coda (non ancora inviato)`);
  } else {
    console.log('referente gia in coda o gia dentro');
  }

  if (nuovoAdmin) {
    await auth.api.requestPasswordReset({
      body: { email: ADMIN_EMAIL, redirectTo: `${process.env.BETTER_AUTH_URL}/tools/green-go` },
    });
    console.log('mail per impostare la password mandata ad Alberto');
  }

  console.log('\nfatto.');
  process.exit(0);
}

void main();
