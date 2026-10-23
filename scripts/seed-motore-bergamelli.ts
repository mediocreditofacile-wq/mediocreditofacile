// Carrozzeria di Enrico Bergamelli sul motore dei portali (spec
// mcf_spec-bergamelli-motore_v2, decisioni di Alberto del 22 e 23/10/2026).
//
//  - settore "mezzi": gru, autogru, movimento terra e altri mezzi da cantiere, descritti
//    a mano nel portale (nessun catalogo), con due venditori, Manc e Nol System;
//  - canali Econocom (Nol System) e Grenke Sputnik (Manc, niente targati ne' ponteggi),
//    leasing a confronto con Sella, Credem e Alba, semaforo sui criteri del locatore;
//  - tetto ricerche 30 euro al mese, nessun addebito delle verifiche, prefisso EB;
//  - tutti i valori stanno in src/lib/motore/catalogo-bergamelli.ts (e sono provati
//    dai suoi test): qui si scrivono e si rileggono;
//  - nessun invito: Enrico si invita dalla scheda "La tua rete" come referente, quando
//    lo dice Alberto.
//
// Idempotente: rilanciarlo riallinea configurazione e canali ai valori del file, non
// duplica. Sulla produzione, dopo il primo giro, venditori, categorie e leasing si
// cambiano dal Pannello MCF: un secondo giro riporterebbe tutto ai valori del file e
// cancellerebbe quelle modifiche. Rinominare un codice di venditore nel Pannello senza
// riseminare spegne in silenzio il suo canale: i canali nominano i codici (CLAUDE.md).
//
//   npm run seed:motore-bergamelli               produzione: collega l'admin MCF
//   npm run seed:motore-bergamelli -- --prova    branch di prova: collega gli utenti
//                                                di prova di seed:motore-demo -- --prova
// Da reti dove Postgres diretto non passa: DB_VIA_WEBSOCKET=1 davanti.

import { deepStrictEqual } from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const PROVA = process.argv.includes('--prova');
if (PROVA) {
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST mancante in .env.local');
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const { query, queryUna } = await import('../src/lib/db');
const { tabellaSeEsiste } = await import('../src/lib/tabelle-canoni');
const { leggiCanali } = await import('../src/lib/motore/config-distinta');
const { leggiConfigMezzi } = await import('../src/lib/motore/config-mezzi');
const { controllaCanali, controllaMezzi } = await import('../src/lib/motore/pannello-mcf');
const { CANALI_BERGAMELLI, CARROZZERIA_BERGAMELLI, CONFIG_MEZZI_BERGAMELLI } = await import('../src/lib/motore/catalogo-bergamelli');

const C = CARROZZERIA_BERGAMELLI;
// Il nome dell'organizzazione compare nella mail di invito ("il portale con cui <nome>
// prepara i preventivi"): quello del fornitore, con Manc e Nol System, non ci sta
const NOME_ORGANIZZAZIONE = 'Enrico Bergamelli';

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

/**
 * Prima di scrivere: i controlli del Pannello MCF sulle costanti. Il lettore scarta in
 * silenzio quello che non legge, e una configurazione che non regge non deve arrivare
 * al database.
 */
function controllaCostanti() {
  const mezzi = controllaMezzi(JSON.parse(JSON.stringify(CONFIG_MEZZI_BERGAMELLI)));
  if (!mezzi.ok) throw new Error(`configurazione dei mezzi non valida: ${mezzi.errore}`);
  const canali = controllaCanali(JSON.parse(JSON.stringify(CANALI_BERGAMELLI)), (id) => tabellaSeEsiste(id) !== null);
  if (!canali.ok) throw new Error(`canali non validi: ${canali.errore}`);
  if (!tabellaSeEsiste(C.tabellaCanoni)) throw new Error(`listino del fornitore inesistente: ${C.tabellaCanoni}`);
}

async function main() {
  console.log(`database: ${PROVA ? 'branch di PROVA' : 'PRODUZIONE'}`);
  controllaCostanti();

  // 1. organizzazione
  let org = await queryUna<{ id: string }>(`SELECT id FROM "organization" WHERE slug = $1`, [C.slug]);
  if (!org) {
    const id = randomUUID();
    await query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`, [id, NOME_ORGANIZZAZIONE, C.slug]);
    org = { id };
    console.log('organizzazione creata');
  } else {
    console.log('organizzazione gia\' presente');
  }

  // 2. fornitore
  const forn = await query<{ nuovo: boolean }>(
    `INSERT INTO app.fornitore (slug, organization_id, nome, prefisso, tabella_canoni, citta, brand_colore, brand_accento)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, tabella_canoni = EXCLUDED.tabella_canoni,
       citta = EXCLUDED.citta, brand_colore = EXCLUDED.brand_colore, brand_accento = EXCLUDED.brand_accento
     WHERE (app.fornitore.nome, app.fornitore.tabella_canoni, app.fornitore.citta,
            app.fornitore.brand_colore, app.fornitore.brand_accento)
       IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.tabella_canoni, EXCLUDED.citta,
            EXCLUDED.brand_colore, EXCLUDED.brand_accento)
     RETURNING (xmax = 0) AS nuovo`,
    [C.slug, org.id, C.nome, C.prefisso, C.tabellaCanoni, C.citta, C.brand.colore, C.brand.accento],
  );
  console.log(`fornitore ${forn.length === 0 ? 'invariato' : forn[0].nuovo ? 'creato' : 'riallineato'}`);

  // 3. carrozzeria, con i canali e la configurazione dei mezzi. Nessun catalogo: i beni si descrivono a mano
  const carr = await query<{ nuovo: boolean }>(
    `INSERT INTO app.carrozzeria (slug, settore, etichetta_bene, partner_leasing, soglia_leasing, tetto_mese_euro,
                                  demo, documenti_extra, tabella_alternativa, regole_semaforo, leasing, prezzo_verifica,
                                  canali, mezzi)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (slug) DO UPDATE SET settore = EXCLUDED.settore, etichetta_bene = EXCLUDED.etichetta_bene,
       partner_leasing = EXCLUDED.partner_leasing, soglia_leasing = EXCLUDED.soglia_leasing,
       tetto_mese_euro = EXCLUDED.tetto_mese_euro, demo = EXCLUDED.demo, documenti_extra = EXCLUDED.documenti_extra,
       tabella_alternativa = EXCLUDED.tabella_alternativa, regole_semaforo = EXCLUDED.regole_semaforo,
       leasing = EXCLUDED.leasing, prezzo_verifica = EXCLUDED.prezzo_verifica, canali = EXCLUDED.canali,
       mezzi = EXCLUDED.mezzi, aggiornato = now()
     WHERE (app.carrozzeria.settore, app.carrozzeria.etichetta_bene, app.carrozzeria.partner_leasing,
            app.carrozzeria.soglia_leasing, app.carrozzeria.tetto_mese_euro, app.carrozzeria.demo,
            app.carrozzeria.documenti_extra, app.carrozzeria.tabella_alternativa, app.carrozzeria.regole_semaforo,
            app.carrozzeria.leasing, app.carrozzeria.prezzo_verifica, app.carrozzeria.canali, app.carrozzeria.mezzi)
       IS DISTINCT FROM (EXCLUDED.settore, EXCLUDED.etichetta_bene, EXCLUDED.partner_leasing,
            EXCLUDED.soglia_leasing, EXCLUDED.tetto_mese_euro, EXCLUDED.demo,
            EXCLUDED.documenti_extra, EXCLUDED.tabella_alternativa, EXCLUDED.regole_semaforo,
            EXCLUDED.leasing, EXCLUDED.prezzo_verifica, EXCLUDED.canali, EXCLUDED.mezzi)
     RETURNING (xmax = 0) AS nuovo`,
    [C.slug, C.settore, C.etichettaBene, C.partnerLeasing, C.sogliaLeasing, C.tettoMeseEuro, C.demo,
     JSON.stringify(C.documentiExtra), C.tabellaAlternativa, C.regoleSemaforo, C.leasing, C.prezzoVerifica,
     JSON.stringify(CANALI_BERGAMELLI), JSON.stringify(CONFIG_MEZZI_BERGAMELLI)],
  );
  console.log(`carrozzeria ${C.slug} ${carr.length === 0 ? 'invariata' : carr[0].nuovo ? 'creata' : 'riallineata'}`
    + ` (${C.settore}, regole ${C.regoleSemaforo}, ${CANALI_BERGAMELLI.map((k) => k.canale).join(' > ')}, leasing a confronto)`);

  // 4. rilettura: i lettori scartano in silenzio quello che non leggono, e un venditore
  // o un canale perso alla scrittura vorrebbe dire un bene che nessuno quota o firma
  const r = await queryUna<{ canali: unknown; mezzi: unknown }>(
    `SELECT canali, mezzi FROM app.carrozzeria WHERE slug = $1`, [C.slug],
  );
  if (!r) throw new Error('rilettura: carrozzeria assente');
  deepStrictEqual(leggiCanali(r.canali), CANALI_BERGAMELLI, 'rilettura: canali diversi dal file');
  deepStrictEqual(leggiConfigMezzi(r.mezzi), CONFIG_MEZZI_BERGAMELLI, 'rilettura: configurazione dei mezzi diversa dal file');
  console.log(`rilettura: ${CANALI_BERGAMELLI.length} canali, ${CONFIG_MEZZI_BERGAMELLI.venditori.length} venditori, `
    + `${CONFIG_MEZZI_BERGAMELLI.categorie.length} categorie, ${CONFIG_MEZZI_BERGAMELLI.leasing.partner.length} partner del leasing: tutto come nel file`);

  // 5. utenti
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

  console.log(`\nfatto. Portale: /portale/${C.slug}`);
  process.exit(0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
