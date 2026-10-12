// Carrozzeria dimostrativa per Fas Italia (Firenze, forniture per hotel), da
// mostrare a TTG/InOut il 16/10/2026. Fas Italia non sa niente di questo
// portale: e' un prototipo per proporglielo.
//
// Regole decise da Alberto il 12/10/2026:
//  - il nome vero del fornitore, ma marcato dimostrativo a video e nei PDF;
//  - niente logo loro: colori neutri (ardesia e ottone), non i loro;
//  - indirizzo non indovinabile (suffisso casuale nello slug);
//  - fuori dall'indice /tools/portali-clienti finche' Fas Italia non dice si';
//  - catalogo di forniture tipo con importi d'ESEMPIO, non i loro prezzi: l'agente
//    scrive il prezzo trattato e le proposte seguono. Solo beni durevoli: niente
//    consumabili, che il noleggio non finanzia.
//  - noleggio su Grenke Sputnik++++ (beni strumentali), leasing Alba senza soglia.
//
// Idempotente: rilanciarlo riallinea configurazione e catalogo, non duplica.
//
//   npm run seed:motore-fas-italia               produzione: collega l'admin MCF
//   npm run seed:motore-fas-italia -- --prova    branch di prova: collega anche gli
//                                                utenti di prova creati da
//                                                seed:motore-demo -- --prova
// Da reti dove Postgres diretto non passa: DB_VIA_WEBSOCKET=1 davanti (src/lib/db.ts).

import { randomUUID } from 'node:crypto';

const PROVA = process.argv.includes('--prova');
if (PROVA) {
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST mancante in .env.local');
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const { query, queryUna } = await import('../src/lib/db');

const SLUG = 'fas-italia-orby1x';
const NOME = 'Fas Italia';
const CITTA = 'Firenze';
const PREFISSO = 'FI';
const TABELLA = 'sputnik'; // Grenke Sputnik++++, beni strumentali
const BRAND = { colore: '#2E3A46', accento: '#8A6A3A' };

const CARROZZERIA = {
  settore: 'generico',
  etichetta_bene: 'Fornitura per hotel',
  partner_leasing: 'alba',
  soglia_leasing: 0,
  tetto_mese_euro: 30,
  demo: true,
  documenti_extra: ['Offerta del fornitore intestata al cliente'],
};

// Forniture tipo per area. Importi di ESEMPIO, IVA esclusa: non sono i prezzi di Fas Italia.
const CATALOGO = [
  { codice: 'SC-40', nome: 'Sala colazione, 40 coperti', prezzo: 18000,
    descrizione: 'Banco buffet con vetrina refrigerata e piano caldo, dispenser di succhi e cereali, accessori di sala.' },
  { codice: 'SC-80', nome: 'Sala colazione, 80 coperti', prezzo: 34000,
    descrizione: 'Due isole buffet con vetrine refrigerate e calde, dispenser e accessori di sala.' },
  { codice: 'BF-CAL', nome: 'Linea buffet caldo', prezzo: 6500,
    descrizione: 'Scaldavivande, chafing dish, piastre e lampade riscaldanti.' },
  { codice: 'BF-FRE', nome: 'Linea buffet freddo', prezzo: 8500,
    descrizione: 'Vetrine refrigerate, espositori e dispenser per succhi, latte e cereali.' },
  { codice: 'MB-30', nome: 'Minibar e cassaforte, 30 camere', prezzo: 11000,
    descrizione: 'Minibar silenziosi e casseforti elettroniche per 30 camere.' },
  { codice: 'MB-60', nome: 'Minibar, cassaforte e bollitore, 60 camere', prezzo: 21000,
    descrizione: 'Minibar silenziosi, casseforti elettroniche e bollitori per 60 camere.' },
  { codice: 'CA-30', nome: 'Accessori camera e bagno, 30 camere', prezzo: 6000,
    descrizione: 'Asciugacapelli, portavaligie, specchi e segnaletica per 30 camere.' },
  { codice: 'CA-60', nome: 'Accessori camera e bagno, 60 camere', prezzo: 11500,
    descrizione: 'Asciugacapelli, portavaligie, specchi e segnaletica per 60 camere.' },
];

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
  console.log(`carrozzeria ${SLUG} allineata (noleggio ${TABELLA}, leasing ${c.partner_leasing})`);

  for (const [i, v] of CATALOGO.entries()) {
    await query(
      `INSERT INTO app.catalogo_voce (fornitore_slug, codice, nome, descrizione, prezzo, attributi, ordine)
       VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6)
       ON CONFLICT (fornitore_slug, codice) DO UPDATE SET nome = EXCLUDED.nome, descrizione = EXCLUDED.descrizione,
         prezzo = EXCLUDED.prezzo, ordine = EXCLUDED.ordine, aggiornato = now()`,
      [SLUG, v.codice, v.nome, v.descrizione, v.prezzo, i],
    );
  }
  console.log(`catalogo: ${CATALOGO.length} forniture tipo`);

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
