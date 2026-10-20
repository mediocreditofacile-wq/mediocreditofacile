// Carrozzeria Led Office (Emme 2 Servizi) sul motore dei portali (spec
// mcf_spec-ledoffice-motore_v1, decisioni di Alberto del 19/10/2026).
//
//  - settore "distinta", regole "prefiltro", nessun leasing, tetto ricerche 100 euro
//    al mese, verifiche fatturate a Emme 2 a 5 euro;
//  - canali Econocom, Grenke (spento) e Pagarent col 5%, checklist e categorie Led
//    Office, documenti firmati da EMME 2 SERVIZI S.R.L.: tutto da catalogo-ledoffice.ts;
//  - nessun invito: referente e agente si invitano quando lo dice Alberto, e fino ad
//    allora il portale resta fuori dall'indice /tools/portali-clienti.
//
// I dati dei clienti finali (clienti segnalati e pratiche lavorate fuori dal portale)
// non stanno nel repo: il seed li legge da una cartella fuori, con quattro file:
//   led-office.png, emme2-servizi.jpg    i loghi (dal template della proposta Led Office)
//   segnalati.json                       [{ piva, ragioneSociale, motivo, effetto, nota }]
//   pratiche-esterne.json                [{ piva, ragioneSociale, canale, data, esito, importo, fonte }]
//
// Idempotente: rilanciarlo riallinea configurazione, catalogo, segnalati e pratiche
// esterne ai valori dei file, non duplica e non tocca cio' che e' gia' uguale. Sulla
// produzione, dopo il primo giro, le modifiche si fanno dal Pannello MCF: un secondo
// giro riporterebbe tutto ai valori dei file.
//
//   npm run seed:motore-led-office                  produzione: collega l'admin MCF
//   npm run seed:motore-led-office -- --prova       branch di prova: collega gli utenti
//                                                   di prova di seed:motore-demo -- --prova
//   ... -- --dati <cartella>                        default ~/Desktop/PROGETTI/Clienti/M2 Servizi/seed-portale
// Da reti dove Postgres diretto non passa: DB_VIA_WEBSOCKET=1 davanti.

import { createHash, randomUUID } from 'node:crypto';
import { deepStrictEqual } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const PROVA = process.argv.includes('--prova');
if (PROVA) {
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST mancante in .env.local');
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

const iDati = process.argv.indexOf('--dati');
const DATI = iDati > -1 && process.argv[iDati + 1]
  ? resolve(process.argv[iDati + 1])
  : join(homedir(), 'Desktop/PROGETTI/Clienti/M2 Servizi/seed-portale');

const { query, queryUna, env } = await import('../src/lib/db');
const { pivaValida } = await import('../src/lib/piva');
const { BlobNotFoundError, get, head, put } = await import('@vercel/blob');
const { CANALI_LO, CATEGORIE_LO, CHECKLIST_LO, SOCIETA_EMME2, vociLedOffice } = await import('../src/lib/motore/catalogo-ledoffice');
const { leggiCanali, leggiCategorie, leggiChecklist, leggiSocieta } = await import('../src/lib/motore/config-distinta');

const SLUG = 'led-office';
const NOME = 'Led Office';
const CITTA = 'Santa Maria a Vico';
const PREFISSO = 'LO';
const TABELLA = 'pagarent';
const BRAND = { colore: '#1A1A1A', accento: '#D03948' };

/** I due loghi: file nella cartella dei dati -> percorso sullo store Blob privato */
const LOGHI = [
  { file: 'led-office.png', percorso: 'brand/led-office.png', tipo: 'image/png' },
  { file: 'emme2-servizi.jpg', percorso: 'brand/emme2-servizi.jpg', tipo: 'image/jpeg' },
] as const;
const LOGO_FORNITORE = LOGHI[0].percorso;
const SOCIETA = { ...SOCIETA_EMME2, logo: LOGHI[1].percorso };

const CARROZZERIA = {
  settore: 'distinta',
  etichetta_bene: 'Fornitura',
  partner_leasing: 'alba', // irrilevante: il leasing e' spento
  soglia_leasing: 0,
  tetto_mese_euro: 100,
  demo: false,
  documenti_extra: [] as string[],
  tabella_alternativa: null,
  regole_semaforo: 'prefiltro',
  leasing: false,
  // Euro per richiesta di verifica (un cliente al mese) addebitati a Emme 2: li vede solo MCF
  prezzo_verifica: 5,
};

/** Chi ha scritto le righe di storico, segnalati e pratiche esterne */
const DA_UTENTE = 'seed:motore-led-office';

const ADMIN_EMAIL = 'mediocreditofacile@gmail.com';
const UTENTI_PROVA: [string, 'referente' | 'agente'][] = [
  ['admin.demo@example.invalid', 'referente'],
  ['referente.demo@example.invalid', 'referente'],
  ['agente.demo@example.invalid', 'agente'],
  ['agente2.demo@example.invalid', 'agente'],
];

// --- dati fuori dal repo, controllati prima di scrivere ------------------------------

interface Segnalato { piva: string; ragioneSociale: string | null; motivo: string; effetto: string; nota: string | null }
interface PraticaEsterna {
  piva: string; ragioneSociale: string | null; canale: string | null; data: string;
  esito: string | null; importo: number | null; fonte: string | null;
}

const MOTIVI = ['insoluto', 'sofferenze', 'altro'];
const EFFETTI = ['blocco', 'rosso'];
const CANALI_ESTERNI = ['pagarent', 'reterent', 'grenke', 'ifis'];

async function leggiJson(nome: string): Promise<Record<string, unknown>[]> {
  const v: unknown = JSON.parse(await readFile(join(DATI, nome), 'utf8'));
  if (!Array.isArray(v)) throw new Error(`${nome}: mi aspetto un elenco`);
  return v as Record<string, unknown>[];
}

const testoONull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Una riga che non regge ferma il seed: scartarla in silenzio vorrebbe dire un cliente in meno nel prefiltro */
function controllaSegnalato(r: Record<string, unknown>, i: number): Segnalato {
  const piva = String(r.piva ?? '');
  const dove = `segnalati.json, riga ${i + 1}`;
  if (!pivaValida(piva)) throw new Error(`${dove}: partita IVA non valida (${piva})`);
  if (!MOTIVI.includes(r.motivo as string)) throw new Error(`${dove}: motivo ${String(r.motivo)}`);
  if (!EFFETTI.includes(r.effetto as string)) throw new Error(`${dove}: effetto ${String(r.effetto)}`);
  return { piva, ragioneSociale: testoONull(r.ragioneSociale), motivo: r.motivo as string, effetto: r.effetto as string, nota: testoONull(r.nota) };
}

function controllaPratica(r: Record<string, unknown>, i: number): PraticaEsterna {
  const piva = String(r.piva ?? '');
  const dove = `pratiche-esterne.json, riga ${i + 1}`;
  if (!pivaValida(piva)) throw new Error(`${dove}: partita IVA non valida (${piva})`);
  const data = String(r.data ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
    throw new Error(`${dove}: data non valida (${data})`);
  }
  const canale = r.canale ?? null;
  if (canale !== null && !CANALI_ESTERNI.includes(canale as string)) throw new Error(`${dove}: canale ${String(canale)}`);
  const importo = r.importo ?? null;
  if (importo !== null && !(typeof importo === 'number' && importo > 0)) throw new Error(`${dove}: importo ${String(importo)}`);
  return {
    piva, ragioneSociale: testoONull(r.ragioneSociale), canale: canale as string | null, data,
    esito: testoONull(r.esito), importo: importo as number | null, fonte: testoONull(r.fonte),
  };
}

// --- utenti ---------------------------------------------------------------------------

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

// --- loghi ------------------------------------------------------------------------------

const impronta = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/**
 * Carica un logo solo se il percorso e' libero. Se c'e' gia' non si sovrascrive mai:
 * uguale e' il giro precedente, diverso e' un logo messo da qualcun altro e va detto.
 */
async function caricaLogo(l: (typeof LOGHI)[number], token: string): Promise<'caricato' | 'identico' | 'diverso'> {
  const bytes = await readFile(join(DATI, l.file));
  try {
    await head(l.percorso, { token });
  } catch (e) {
    if (!(e instanceof BlobNotFoundError)) throw e;
    await put(l.percorso, bytes, { access: 'private', contentType: l.tipo, addRandomSuffix: false, allowOverwrite: false, token });
    return 'caricato';
  }
  const res = await get(l.percorso, { access: 'private', token });
  if (!res || res.statusCode !== 200 || !res.stream) throw new Error(`${l.percorso}: esiste ma non si legge`);
  const presente = new Uint8Array(await new Response(res.stream).arrayBuffer());
  return impronta(presente) === impronta(bytes) ? 'identico' : 'diverso';
}

// --- seed -------------------------------------------------------------------------------

async function main() {
  console.log(`database: ${PROVA ? 'branch di PROVA' : 'PRODUZIONE'}`);
  console.log(`dati: ${DATI}`);

  // Prima si controlla tutto quello che viene da fuori, poi si scrive
  const segnalati = (await leggiJson('segnalati.json')).map(controllaSegnalato);
  const pratiche = (await leggiJson('pratiche-esterne.json')).map(controllaPratica);
  for (const l of LOGHI) await readFile(join(DATI, l.file));
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN non configurato');

  // 1. organizzazione
  let org = await queryUna<{ id: string }>(`SELECT id FROM "organization" WHERE slug = $1`, [SLUG]);
  if (!org) {
    const id = randomUUID();
    await query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`, [id, NOME, SLUG]);
    org = { id };
    console.log('organizzazione creata');
  } else {
    console.log('organizzazione gia\' presente');
  }

  // 2. fornitore
  const forn = await query<{ nuovo: boolean }>(
    `INSERT INTO app.fornitore (slug, organization_id, nome, prefisso, tabella_canoni, citta, brand_colore, brand_accento, brand_logo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, tabella_canoni = EXCLUDED.tabella_canoni,
       citta = EXCLUDED.citta, brand_colore = EXCLUDED.brand_colore, brand_accento = EXCLUDED.brand_accento,
       brand_logo = EXCLUDED.brand_logo
     WHERE (app.fornitore.nome, app.fornitore.tabella_canoni, app.fornitore.citta, app.fornitore.brand_colore,
            app.fornitore.brand_accento, app.fornitore.brand_logo)
       IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.tabella_canoni, EXCLUDED.citta, EXCLUDED.brand_colore,
            EXCLUDED.brand_accento, EXCLUDED.brand_logo)
     RETURNING (xmax = 0) AS nuovo`,
    [SLUG, org.id, NOME, PREFISSO, TABELLA, CITTA, BRAND.colore, BRAND.accento, LOGO_FORNITORE],
  );
  console.log(`fornitore ${forn.length === 0 ? 'invariato' : forn[0].nuovo ? 'creato' : 'riallineato'}`);

  // 3. carrozzeria
  const c = CARROZZERIA;
  const carr = await query<{ nuovo: boolean }>(
    `INSERT INTO app.carrozzeria (slug, settore, etichetta_bene, partner_leasing, soglia_leasing, tetto_mese_euro,
                                  demo, documenti_extra, tabella_alternativa, regole_semaforo, leasing, prezzo_verifica,
                                  canali, checklist, categorie, societa_fornitrice)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (slug) DO UPDATE SET settore = EXCLUDED.settore, etichetta_bene = EXCLUDED.etichetta_bene,
       partner_leasing = EXCLUDED.partner_leasing, soglia_leasing = EXCLUDED.soglia_leasing,
       tetto_mese_euro = EXCLUDED.tetto_mese_euro, demo = EXCLUDED.demo, documenti_extra = EXCLUDED.documenti_extra,
       tabella_alternativa = EXCLUDED.tabella_alternativa, regole_semaforo = EXCLUDED.regole_semaforo,
       leasing = EXCLUDED.leasing, prezzo_verifica = EXCLUDED.prezzo_verifica, canali = EXCLUDED.canali,
       checklist = EXCLUDED.checklist, categorie = EXCLUDED.categorie, societa_fornitrice = EXCLUDED.societa_fornitrice,
       aggiornato = now()
     WHERE (app.carrozzeria.settore, app.carrozzeria.etichetta_bene, app.carrozzeria.partner_leasing,
            app.carrozzeria.soglia_leasing, app.carrozzeria.tetto_mese_euro, app.carrozzeria.demo,
            app.carrozzeria.documenti_extra, app.carrozzeria.tabella_alternativa, app.carrozzeria.regole_semaforo,
            app.carrozzeria.leasing, app.carrozzeria.prezzo_verifica, app.carrozzeria.canali,
            app.carrozzeria.checklist, app.carrozzeria.categorie, app.carrozzeria.societa_fornitrice)
       IS DISTINCT FROM (EXCLUDED.settore, EXCLUDED.etichetta_bene, EXCLUDED.partner_leasing,
            EXCLUDED.soglia_leasing, EXCLUDED.tetto_mese_euro, EXCLUDED.demo,
            EXCLUDED.documenti_extra, EXCLUDED.tabella_alternativa, EXCLUDED.regole_semaforo,
            EXCLUDED.leasing, EXCLUDED.prezzo_verifica, EXCLUDED.canali,
            EXCLUDED.checklist, EXCLUDED.categorie, EXCLUDED.societa_fornitrice)
     RETURNING (xmax = 0) AS nuovo`,
    [SLUG, c.settore, c.etichetta_bene, c.partner_leasing, c.soglia_leasing, c.tetto_mese_euro, c.demo,
     JSON.stringify(c.documenti_extra), c.tabella_alternativa, c.regole_semaforo, c.leasing, c.prezzo_verifica,
     JSON.stringify(CANALI_LO), JSON.stringify(CHECKLIST_LO), JSON.stringify(CATEGORIE_LO), JSON.stringify(SOCIETA)],
  );
  console.log(`carrozzeria ${SLUG} ${carr.length === 0 ? 'invariata' : carr[0].nuovo ? 'creata' : 'riallineata'}`
    + ` (${c.settore}, regole ${c.regole_semaforo}, ${CANALI_LO.map((k) => `${k.canale}${k.attivo ? '' : ' spento'}`).join(' > ')}, niente leasing)`);

  // 4. catalogo, con una riga di storico per ogni prezzo o validita' nuovi
  const voci = vociLedOffice();
  const conta = { nuove: 0, aggiornate: 0, invariate: 0, storico: 0 };
  for (const [i, v] of voci.entries()) {
    const r = await query<{ nuovo: boolean }>(
      `INSERT INTO app.catalogo_voce (fornitore_slug, codice, nome, descrizione, prezzo, attributi, ordine)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (fornitore_slug, codice) DO UPDATE SET nome = EXCLUDED.nome, descrizione = EXCLUDED.descrizione,
         prezzo = EXCLUDED.prezzo, attributi = EXCLUDED.attributi, ordine = EXCLUDED.ordine, aggiornato = now()
       WHERE (app.catalogo_voce.nome, app.catalogo_voce.descrizione, app.catalogo_voce.prezzo,
              app.catalogo_voce.attributi, app.catalogo_voce.ordine)
         IS DISTINCT FROM (EXCLUDED.nome, EXCLUDED.descrizione, EXCLUDED.prezzo, EXCLUDED.attributi, EXCLUDED.ordine)
       RETURNING (xmax = 0) AS nuovo`,
      [SLUG, v.codice, v.nome, v.descrizione, v.prezzo, JSON.stringify(v.attributi), i],
    );
    if (r.length === 0) conta.invariate++;
    else if (r[0].nuovo) conta.nuove++;
    else conta.aggiornate++;

    // Lo storico si confronta con la sua ultima riga: cosi' la prima riga c'e' sempre
    const validoFino = (v.attributi.valido_fino as string | undefined) ?? null;
    const ultima = await queryUna<{ prezzo: string; valido_fino: string | null }>(
      `SELECT prezzo, to_char(valido_fino, 'YYYY-MM-DD') AS valido_fino FROM app.catalogo_storico
        WHERE fornitore_slug = $1 AND codice = $2 ORDER BY registrato DESC, id DESC LIMIT 1`,
      [SLUG, v.codice],
    );
    if (!ultima || Number(ultima.prezzo) !== v.prezzo || ultima.valido_fino !== validoFino) {
      await query(
        `INSERT INTO app.catalogo_storico (fornitore_slug, codice, prezzo, valido_fino, da_utente) VALUES ($1,$2,$3,$4,$5)`,
        [SLUG, v.codice, v.prezzo, validoFino, DA_UTENTE],
      );
      conta.storico++;
    }
  }
  console.log(`catalogo: ${voci.length} voci (${conta.nuove} nuove, ${conta.aggiornate} aggiornate, ${conta.invariate} invariate), `
    + `${conta.storico} righe di storico prezzi`);

  const loghi = [];
  for (const l of LOGHI) loghi.push([l.percorso, await caricaLogo(l, token)] as const);
  for (const [percorso, esito] of loghi) {
    console.log(esito === 'diverso'
      ? `ATTENZIONE: ${percorso} esiste gia' con un contenuto diverso, non l'ho sovrascritto`
      : `logo ${percorso}: ${esito === 'caricato' ? 'caricato' : 'gia\' presente, identico'}`);
  }

  // 5. clienti segnalati (per partita IVA) e pratiche esterne (per partita IVA e data)
  const seg = { nuovi: 0, aggiornati: 0, invariati: 0 };
  for (const s of segnalati) {
    const r = await query<{ nuovo: boolean }>(
      `INSERT INTO app.cliente_segnalato (piva, ragione_sociale, motivo, effetto, nota, da_utente)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (piva) DO UPDATE SET ragione_sociale = EXCLUDED.ragione_sociale, motivo = EXCLUDED.motivo,
         effetto = EXCLUDED.effetto, nota = EXCLUDED.nota, da_utente = EXCLUDED.da_utente
       WHERE (app.cliente_segnalato.ragione_sociale, app.cliente_segnalato.motivo, app.cliente_segnalato.effetto,
              app.cliente_segnalato.nota)
         IS DISTINCT FROM (EXCLUDED.ragione_sociale, EXCLUDED.motivo, EXCLUDED.effetto, EXCLUDED.nota)
       RETURNING (xmax = 0) AS nuovo`,
      [s.piva, s.ragioneSociale, s.motivo, s.effetto, s.nota, DA_UTENTE],
    );
    if (r.length === 0) seg.invariati++;
    else if (r[0].nuovo) seg.nuovi++;
    else seg.aggiornati++;
  }
  console.log(`clienti segnalati: ${segnalati.length} (${seg.nuovi} nuovi, ${seg.aggiornati} aggiornati, ${seg.invariati} invariati)`);

  const pra = { nuove: 0, aggiornate: 0, invariate: 0 };
  for (const p of pratiche) {
    const chiave = [p.piva, p.data, SLUG];
    const esiste = await queryUna<{ id: string }>(
      `SELECT id FROM app.pratica_esterna WHERE piva = $1 AND data = $2::date AND fornitore_slug = $3 ORDER BY id LIMIT 1`,
      chiave,
    );
    if (!esiste) {
      await query(
        `INSERT INTO app.pratica_esterna (piva, ragione_sociale, fornitore_slug, canale, data, esito, importo, fonte)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8)`,
        [p.piva, p.ragioneSociale, SLUG, p.canale, p.data, p.esito, p.importo, p.fonte],
      );
      pra.nuove++;
      continue;
    }
    const agg = await query(
      `UPDATE app.pratica_esterna SET ragione_sociale = $2, canale = $3, esito = $4, importo = $5, fonte = $6
        WHERE id = $1 AND (ragione_sociale, canale, esito, importo, fonte) IS DISTINCT FROM ($2, $3, $4, $5::numeric, $6)
        RETURNING id`,
      [esiste.id, p.ragioneSociale, p.canale, p.esito, p.importo, p.fonte],
    );
    if (agg.length) pra.aggiornate++;
    else pra.invariate++;
  }
  console.log(`pratiche esterne: ${pratiche.length} (${pra.nuove} nuove, ${pra.aggiornate} aggiornate, ${pra.invariate} invariate)`);

  // 6. utenti
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

  await rilettura(segnalati, pratiche.length);

  const diversi = loghi.filter(([, e]) => e === 'diverso');
  if (diversi.length) {
    console.log(`\nfatto, ma con ${diversi.length} logo da controllare a mano. Portale: /portale/${SLUG}`);
    process.exit(2);
  }
  console.log(`\nfatto. Portale: /portale/${SLUG}`);
  process.exit(0);
}

/**
 * Rilegge dal database quello che il motore leggera' e lo confronta col file: i lettori
 * di config-distinta.ts scartano in silenzio un elemento scritto male, e una voce della
 * checklist scartata sarebbe un documento che nessuno chiede piu'.
 */
async function rilettura(segnalati: Segnalato[], nPratiche: number) {
  const r = await queryUna<{ canali: unknown; checklist: unknown; categorie: unknown; societa_fornitrice: unknown }>(
    `SELECT canali, checklist, categorie, societa_fornitrice FROM app.carrozzeria WHERE slug = $1`,
    [SLUG],
  );
  if (!r) throw new Error('rilettura: carrozzeria assente');
  deepStrictEqual(leggiCanali(r.canali), CANALI_LO, 'rilettura: canali diversi dal file');
  deepStrictEqual(leggiChecklist(r.checklist), CHECKLIST_LO, 'rilettura: checklist diversa dal file');
  deepStrictEqual(leggiCategorie(r.categorie), CATEGORIE_LO, 'rilettura: categorie diverse dal file');
  deepStrictEqual(leggiSocieta(r.societa_fornitrice), SOCIETA, 'rilettura: societa\' fornitrice diversa dal file');

  const nomi = new Set(CATEGORIE_LO.map((k) => k.nome));
  const voci = await query<{ codice: string; categoria: string | null; valido_fino: string | null }>(
    `SELECT codice, attributi->>'categoria' AS categoria, attributi->>'valido_fino' AS valido_fino
       FROM app.catalogo_voce WHERE fornitore_slug = $1`,
    [SLUG],
  );
  const attese = new Set(vociLedOffice().map((v) => v.codice));
  const mancanti = [...attese].filter((k) => !voci.some((v) => v.codice === k));
  if (mancanti.length) throw new Error(`rilettura: voci mancanti ${mancanti.join(', ')}`);
  const senzaCategoria = voci.filter((v) => !v.categoria || !nomi.has(v.categoria) || !v.valido_fino).map((v) => v.codice);
  if (senzaCategoria.length) throw new Error(`rilettura: voci senza categoria o validita' ${senzaCategoria.join(', ')}`);

  for (const s of segnalati) {
    const letto = await queryUna<{ motivo: string; effetto: string }>(
      `SELECT motivo, effetto FROM app.cliente_segnalato WHERE piva = $1`, [s.piva],
    );
    deepStrictEqual({ ...letto }, { motivo: s.motivo, effetto: s.effetto }, `rilettura: segnalato ${s.piva}`);
  }
  const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM app.pratica_esterna WHERE fornitore_slug = $1`, [SLUG]);
  if (Number(n) !== nPratiche) throw new Error(`rilettura: ${n} pratiche esterne nel database, ${nPratiche} nel file`);

  console.log(`rilettura: canali ${CANALI_LO.length}, checklist ${CHECKLIST_LO.voci.length} voci, categorie ${CATEGORIE_LO.length}, `
    + `societa' fornitrice, ${voci.length} voci a catalogo, ${segnalati.length} segnalati, ${n} pratiche esterne: tutto come nel file`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
