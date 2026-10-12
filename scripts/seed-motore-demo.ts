// Crea il fornitore dimostrativo del motore dei portali: un installatore
// fotovoltaico che non esiste, con un catalogo di pacchetti chiavi in mano.
//
// Idempotente: rilanciarlo riallinea configurazione e catalogo, non duplica.
//
// Due modi:
//   npm run seed:motore-demo            database di produzione. Collega l'admin
//                                       MCF come referente, nessuna password.
//   npm run seed:motore-demo -- --prova branch Neon di prova (DATABASE_URL_TEST).
//                                       In piu' crea tre utenti di prova (admin,
//                                       referente, agente) con la password di
//                                       MOTORE_PROVA_PASSWORD in .env.local.
//                                       Servono a provare il portale in locale.
//
// I prezzi del catalogo sono INVENTATI, ed e' dichiarato: il fornitore e'
// marcato demo e il portale scrive "catalogo dimostrativo" a video e nei PDF.
// Non sono coefficienti: la regola delle tabelle non e' toccata.

import { randomUUID } from 'node:crypto';

const PROVA = process.argv.includes('--prova');
if (PROVA) {
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST mancante in .env.local');
  // Il pool si costruisce all'import di auth: la variabile va spostata PRIMA.
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const { auth } = await import('../src/lib/auth');
const { query, queryUna } = await import('../src/lib/db');

const SLUG = 'demo-fotovoltaico';
const NOME = 'Fotovoltaico Dimostrativo S.r.l.';
const CITTA = 'Vicenza';
const PREFISSO = 'DF';
const TABELLA = 'esg'; // noleggio su Grenke ESG++++, come Green-Go
const BRAND = { colore: '#14506B', accento: '#1F7FA6' };

const CARROZZERIA = {
  settore: 'fotovoltaico',
  etichetta_bene: 'Impianto fotovoltaico',
  partner_leasing: 'alba',
  // La soglia decisa per Green-Go: sotto i 100 kWp il leasing non ha senso
  soglia_leasing: 80000,
  tetto_mese_euro: 30,
  demo: true,
  documenti_extra: ["Offerta dell'impianto intestata al cliente", 'Ultima bolletta elettrica'],
};

// Pacchetti chiavi in mano. Prezzi dimostrativi, IVA esclusa.
const CATALOGO = [
  { codice: 'PV-20', nome: '20 kWp su tetto', prezzo: 24000, kwp: 20, kwh: 0 },
  { codice: 'PV-20A', nome: '20 kWp su tetto con accumulo 20 kWh', prezzo: 34500, kwp: 20, kwh: 20 },
  { codice: 'PV-50', nome: '50 kWp su tetto', prezzo: 52000, kwp: 50, kwh: 0 },
  { codice: 'PV-50A', nome: '50 kWp su tetto con accumulo 50 kWh', prezzo: 78000, kwp: 50, kwh: 50 },
  { codice: 'PV-100', nome: '100 kWp su tetto', prezzo: 98000, kwp: 100, kwh: 0 },
  { codice: 'PV-100A', nome: '100 kWp su tetto con accumulo 100 kWh', prezzo: 148000, kwp: 100, kwh: 100 },
  { codice: 'PV-200', nome: '200 kWp su tetto', prezzo: 185000, kwp: 200, kwh: 0 },
];

const ADMIN_EMAIL = 'mediocreditofacile@gmail.com';

async function utente(email: string, nome: string, password: string): Promise<string> {
  let u = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [email]);
  if (!u) {
    await auth.api.signUpEmail({ body: { email, password, name: nome }, asResponse: true });
    u = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [email]);
  }
  if (!u) throw new Error(`creazione utente fallita: ${email}`);
  await query(`UPDATE "user" SET "emailVerified" = true WHERE id = $1`, [u.id]);
  return u.id;
}

async function membro(orgId: string, userId: string, ruolo: 'referente' | 'agente') {
  await query(
    `INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt")
     SELECT $1,$2,$3,$4, now()
      WHERE NOT EXISTS (SELECT 1 FROM "member" WHERE "organizationId" = $2 AND "userId" = $3)`,
    [randomUUID(), orgId, userId, ruolo],
  );
}

async function main() {
  console.log(`database: ${PROVA ? 'branch di PROVA' : 'PRODUZIONE'}`);

  // 1. Organizzazione e fornitore
  let org = await queryUna<{ id: string }>(`SELECT id FROM "organization" WHERE slug = $1`, [SLUG]);
  if (!org) {
    const id = randomUUID();
    await query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`, [id, NOME, SLUG]);
    org = { id };
    console.log('organizzazione creata');
  }
  await query(
    `INSERT INTO app.fornitore (slug, organization_id, nome, prefisso, tabella_canoni, citta, brand_colore, brand_accento)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, tabella_canoni = EXCLUDED.tabella_canoni,
       citta = EXCLUDED.citta, brand_colore = EXCLUDED.brand_colore, brand_accento = EXCLUDED.brand_accento`,
    [SLUG, org.id, NOME, PREFISSO, TABELLA, CITTA, BRAND.colore, BRAND.accento],
  );

  // 2. Carrozzeria
  const c = CARROZZERIA;
  await query(
    `INSERT INTO app.carrozzeria (slug, settore, etichetta_bene, partner_leasing, soglia_leasing,
                                  tetto_mese_euro, demo, documenti_extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (slug) DO UPDATE SET settore = EXCLUDED.settore, etichetta_bene = EXCLUDED.etichetta_bene,
       partner_leasing = EXCLUDED.partner_leasing, soglia_leasing = EXCLUDED.soglia_leasing,
       tetto_mese_euro = EXCLUDED.tetto_mese_euro, demo = EXCLUDED.demo,
       documenti_extra = EXCLUDED.documenti_extra, aggiornato = now()`,
    [SLUG, c.settore, c.etichetta_bene, c.partner_leasing, c.soglia_leasing, c.tetto_mese_euro, c.demo,
     JSON.stringify(c.documenti_extra)],
  );
  console.log(`carrozzeria ${SLUG} allineata (noleggio ${TABELLA}, leasing ${c.partner_leasing} sopra ${c.soglia_leasing} euro)`);

  // 3. Catalogo
  for (const [i, v] of CATALOGO.entries()) {
    await query(
      `INSERT INTO app.catalogo_voce (fornitore_slug, codice, nome, prezzo, attributi, ordine)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (fornitore_slug, codice) DO UPDATE SET nome = EXCLUDED.nome, prezzo = EXCLUDED.prezzo,
         attributi = EXCLUDED.attributi, ordine = EXCLUDED.ordine, aggiornato = now()`,
      [SLUG, v.codice, v.nome, v.prezzo, JSON.stringify({ kwp: v.kwp, kwh_accumulo: v.kwh, installazione: 'tetto' }), i],
    );
  }
  console.log(`catalogo: ${CATALOGO.length} pacchetti`);

  // 4. Persone
  if (!PROVA) {
    // Produzione: Alberto entra come admin MCF, col suo accesso di sempre.
    const admin = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [ADMIN_EMAIL]);
    if (admin) {
      await membro(org.id, admin.id, 'referente');
      console.log('admin MCF collegato');
    } else {
      console.log("admin MCF assente: lancia prima seed:green-go, che lo crea");
    }
  } else {
    const password = process.env.MOTORE_PROVA_PASSWORD;
    if (!password || password.length < 10) throw new Error('MOTORE_PROVA_PASSWORD mancante o corta in .env.local');
    const admin = await utente('admin.demo@example.invalid', 'Admin di prova', password);
    await query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin]);
    await membro(org.id, admin, 'referente');
    await membro(org.id, await utente('referente.demo@example.invalid', 'Referente di prova', password), 'referente');
    await membro(org.id, await utente('agente.demo@example.invalid', 'Agente di prova', password), 'agente');
    await membro(org.id, await utente('agente2.demo@example.invalid', 'Secondo agente di prova', password), 'agente');
    console.log('utenti di prova pronti (admin, referente, due agenti): password in MOTORE_PROVA_PASSWORD');
  }

  console.log(`\nfatto. Portale: /portale/${SLUG}`);
  process.exit(0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
