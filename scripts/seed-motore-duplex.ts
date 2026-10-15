// Carrozzeria Duplex sul motore dei portali (spec mcf_spec-duplex-motore_v1,
// approvata il 15/10/2026). /tools/duplex resta com'e', in parallelo.
//
// Regole decise da Alberto il 15/10/2026:
//  - portale vero, prezzi veri, nessun banner dimostrativo;
//  - nessun invito: il referente di Duplex si invita quando lo dice Alberto, e
//    prima va generalizzata la mail di invito (parla di fotovoltaico);
//  - fuori dall'indice /tools/portali-clienti finche' non si invita;
//  - noleggio su Sputnik Duplex con la Grace Period affiancata, semaforo sui
//    criteri del locatore, nessun leasing, tetto ricerche 100 euro al mese.
//
// Idempotente: rilanciarlo riallinea configurazione e catalogo, non duplica.
//
//   npm run seed:motore-duplex               produzione: collega l'admin MCF
//   npm run seed:motore-duplex -- --prova    branch di prova: collega gli utenti
//                                            di prova di seed:motore-demo -- --prova
// Da reti dove Postgres diretto non passa: DB_VIA_WEBSOCKET=1 davanti.

import { randomUUID } from 'node:crypto';

const PROVA = process.argv.includes('--prova');
if (PROVA) {
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST mancante in .env.local');
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const { query, queryUna } = await import('../src/lib/db');
const { vociDuplex } = await import('../src/lib/motore/catalogo-duplex');

const SLUG = 'duplex';
const NOME = 'Duplex';
const CITTA = 'Signa';
const PREFISSO = 'DX';
const TABELLA = 'sputnik-duplex';
const BRAND = { colore: '#1B3A57', accento: '#E66A2C' };

const CARROZZERIA = {
  settore: 'macchine',
  etichetta_bene: 'Macchina per la pulizia',
  partner_leasing: 'alba',
  soglia_leasing: 0,
  tetto_mese_euro: 100,
  demo: false,
  documenti_extra: [] as string[],
  tabella_alternativa: 'grace-duplex',
  regole_semaforo: 'locatore',
  leasing: false,
  // Euro per richiesta di verifica (un cliente al mese) addebitati a Duplex: li vede solo MCF
  prezzo_verifica: 5,
};

const ADMIN_EMAIL = 'mediocreditofacile@gmail.com';
const UTENTI_PROVA: [string, 'referente' | 'agente'][] = [
  ['admin.demo@example.invalid', 'referente'],
  ['referente.demo@example.invalid', 'referente'],
  ['agente.demo@example.invalid', 'agente'],
  ['agente2.demo@example.invalid', 'agente'],
];

async function membro(orgId: string, email: string, ruolo: 'referente' | 'agente'): Promise<boolean> {
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

  const c = CARROZZERIA;
  await query(
    `INSERT INTO app.carrozzeria (slug, settore, etichetta_bene, partner_leasing, soglia_leasing, tetto_mese_euro,
                                  demo, documenti_extra, tabella_alternativa, regole_semaforo, leasing, prezzo_verifica)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (slug) DO UPDATE SET settore = EXCLUDED.settore, etichetta_bene = EXCLUDED.etichetta_bene,
       partner_leasing = EXCLUDED.partner_leasing, soglia_leasing = EXCLUDED.soglia_leasing,
       tetto_mese_euro = EXCLUDED.tetto_mese_euro, demo = EXCLUDED.demo, documenti_extra = EXCLUDED.documenti_extra,
       tabella_alternativa = EXCLUDED.tabella_alternativa, regole_semaforo = EXCLUDED.regole_semaforo,
       leasing = EXCLUDED.leasing, prezzo_verifica = EXCLUDED.prezzo_verifica, aggiornato = now()`,
    [SLUG, c.settore, c.etichetta_bene, c.partner_leasing, c.soglia_leasing, c.tetto_mese_euro, c.demo,
     JSON.stringify(c.documenti_extra), c.tabella_alternativa, c.regole_semaforo, c.leasing, c.prezzo_verifica],
  );
  console.log(`carrozzeria ${SLUG} allineata (noleggio ${TABELLA} + ${c.tabella_alternativa}, semaforo ${c.regole_semaforo}, niente leasing)`);

  const voci = vociDuplex();
  for (const v of voci) {
    await query(
      `INSERT INTO app.catalogo_voce (fornitore_slug, codice, nome, descrizione, prezzo, attributi, ordine)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (fornitore_slug, codice) DO UPDATE SET nome = EXCLUDED.nome, descrizione = EXCLUDED.descrizione,
         prezzo = EXCLUDED.prezzo, attributi = EXCLUDED.attributi, ordine = EXCLUDED.ordine, aggiornato = now()`,
      [SLUG, v.codice, v.nome, v.descrizione, v.prezzo, JSON.stringify(v.attributi), v.ordine],
    );
  }
  console.log(`catalogo: ${voci.filter((v) => v.attributi.tipo !== 'accessorio').length} macchine e ${voci.filter((v) => v.attributi.tipo === 'accessorio').length} accessori`);

  if (!PROVA) {
    console.log(await membro(org.id, ADMIN_EMAIL, 'referente') ? 'admin MCF collegato' : 'admin MCF assente');
  } else {
    for (const [email, ruolo] of UTENTI_PROVA) {
      if (!(await membro(org.id, email, ruolo))) {
        throw new Error(`${email} non esiste: lancia prima seed:motore-demo -- --prova`);
      }
    }
    console.log('utenti di prova collegati (admin, referente, due agenti)');
  }

  console.log(`\nfatto. Portale: /portale/${SLUG}`);
  process.exit(0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
