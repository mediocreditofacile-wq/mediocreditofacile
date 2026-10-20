export const prerender = false;

// Pannello MCF della carrozzeria: configurazione, catalogo, spesa del mese.
// Solo l'admin MCF.
//
// GET  /api/motore/admin?f=<slug>
// POST /api/motore/admin { f, azione, ... }
//   azione 'config'   -> settore, etichetta, partner leasing, soglia, tetto,
//                        demo, documenti extra, listino del noleggio, colori
//   azione 'voce'     -> crea o aggiorna una voce del catalogo (per codice)
//   azione 'importa'  -> molte voci insieme, dalle righe incollate da Excel
//   azione 'attiva'   -> accende o spegne una voce
// Solo sul settore distinta (Led Office, spec mcf_spec-ledoffice-motore_v1 par. 10):
//   azione 'canali'             { canali }      -> canali di quotazione, in ordine
//   azione 'societa'            { societa }     -> la societa' che firma i documenti
//   azione 'categorie'          { categorie }   -> categorie con settori tipici e flag
//   azione 'checklist'          { checklist }   -> documenti della pratica
//   azione 'segnala'            { piva, ragioneSociale, motivo, effetto, nota }
//   azione 'togli-segnalazione' { piva }
//   azione 'pratica-esterna'    { piva, ragioneSociale, canale, data, esito, importo }
//
// Il catalogo si aggiorna per codice: reimportare lo stesso Excel aggiorna
// prezzi e nomi senza duplicare. Le voci non si cancellano, si spengono: un
// preventivo vecchio deve poter dire su quale voce era stato fatto.
//
// Sul settore distinta canali, societa', categorie e checklist si salvano come li
// manda il pannello o non si salvano: se il lettore del motore scarterebbe o
// cambierebbe qualcosa la risposta e' 400 con un messaggio che dice cosa
// (pannello-mcf.ts). I clienti segnalati sono un elenco di MCF, comune a tutti i
// fornitori e letto solo dal prefiltro: togliere una segnalazione cancella la
// riga e lo lascia nel log. Le pratiche esterne dal pannello si aggiungono e basta.
// Canale, maggiorazione e proposta per il locatore di proposte e pratiche escono
// solo da qui: le API di referente e agente non li leggono.

import { query } from '../../../lib/db';
import { catalogo, type Carrozzeria } from '../../../lib/motore/carrozzeria';
import { leggiVoceConMotivo, numero, testo, type Voce } from '../../../lib/motore/catalogo-import';
import { CANALI } from '../../../lib/motore/config-distinta';
import { CANALI_ESTERNI, NOMI_CANALE } from '../../../lib/motore/nomi-canale';
import {
  categorieOrfane,
  controllaCanali,
  controllaCategorie,
  controllaChecklist,
  controllaPraticaEsterna,
  controllaSegnalazione,
  controllaSocieta,
  sceltaDaElenco,
} from '../../../lib/motore/pannello-mcf';
import { cambiaStorico, registraStorico, ultimoStorico } from '../../../lib/motore/storico-prezzi';
import { corpoJson, json, sessioneMotore } from '../../../lib/motore/sessione';
import { spesaDelMese } from '../../../lib/openapi';
import { contoRichieste, meseDi, mesePrecedenteDi, riepilogoMesi } from '../../../lib/motore/richieste';
import { pivaValida, pulisciPiva } from '../../../lib/piva';
import { tabellaSeEsiste } from '../../../lib/tabelle-canoni';
import { PIONEER_LETTO } from '../../../data/grenke';

const PARTNER = ['sella', 'alba', 'credem'];
const SETTORI = ['fotovoltaico', 'generico', 'macchine', 'distinta'];
const LISTINI = ['esg', 'pagarent', 'sputnik', 'sputnik-duplex', 'grace-duplex'];
const REGOLE = ['credit-policy', 'locatore', 'prefiltro'];
const COLORE = /^#[0-9a-fA-F]{6}$/;

/** Le azioni che esistono solo sul settore distinta */
const AZIONI_DISTINTA = ['canali', 'societa', 'categorie', 'checklist', 'segnala', 'togli-segnalazione', 'pratica-esterna'];

/** Le ultime proposte e pratiche mostrate nel pannello */
const ULTIME = 50;

/**
 * Una voce del catalogo. Sul settore distinta lascia anche la riga di storico quando
 * prezzo o validita' cambiano rispetto all'ultima riga (storico-prezzi.ts); sugli
 * altri settori il catalogo si salva come sempre, senza storico.
 *
 * `conValidita` dice se la riga aveva la colonna della validita'. Senza la colonna
 * (un reimport dei soli prezzi) la validita' salvata resta: gli attributi si
 * sostituiscono per intero, e senza questa eccezione la scadenza sparirebbe. Con la
 * colonna vuota invece la validita' si toglie, perche' e' quello che c'e' scritto.
 */
async function salvaVoce(slug: string, v: Voce, storico: { utente: string } | null, conValidita: boolean) {
  const prima = storico ? await ultimoStorico(slug, v.codice) : null;
  const righe = await query<{ valido_fino: string | null }>(
    // Una voce nuova va in coda al catalogo; una che esiste tiene il suo posto
    `INSERT INTO app.catalogo_voce (fornitore_slug, codice, nome, descrizione, prezzo, attributi, ordine)
     VALUES ($1,$2,$3,$4,$5,$6,
             (SELECT COALESCE(max(ordine), -1) + 1 FROM app.catalogo_voce WHERE fornitore_slug = $1))
     ON CONFLICT (fornitore_slug, codice) DO UPDATE SET nome = EXCLUDED.nome, descrizione = EXCLUDED.descrizione,
       prezzo = EXCLUDED.prezzo,
       attributi = CASE WHEN $7::boolean THEN EXCLUDED.attributi
                   ELSE EXCLUDED.attributi || jsonb_strip_nulls(jsonb_build_object('valido_fino', app.catalogo_voce.attributi->'valido_fino')) END,
       attivo = true, aggiornato = now()
     RETURNING attributi->>'valido_fino' AS valido_fino`,
    [slug, v.codice, v.nome, v.descrizione, v.prezzo, JSON.stringify(v.attributi), conValidita],
  );
  if (!storico) return;
  // La validita' che la voce ha davvero dopo il salvataggio, anche quella tenuta
  const salvata = righe[0] ? righe[0].valido_fino ?? null : null;
  const scritta = typeof v.attributi.valido_fino === 'string' ? v.attributi.valido_fino : null;
  const dopo = { prezzo: v.prezzo, validoFino: righe[0] ? salvata : scritta };
  if (cambiaStorico(prima, dopo)) await registraStorico(slug, v.codice, dopo, storico.utente);
}

/** La riga aveva la colonna della validita' (anche vuota)? */
const haValidita = (r: unknown) =>
  r !== null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, 'valido_fino')
  && (r as Record<string, unknown>).valido_fino !== undefined;

/** Sul settore distinta una voce senza una categoria del pannello fermerebbe la distinta */
const categoriaNota = (k: Carrozzeria, v: Voce) =>
  k.settore !== 'distinta' || (k.categorie ?? []).some((c) => c.nome === v.attributi.categoria);

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const numeroONull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Cio' che solo il settore distinta legge dal database: segnalati, pratiche esterne, storico, proposte e pratiche */
async function datiDistinta(slug: string) {
  const [segnalati, esterne, storico, proposte, pratiche] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT piva, ragione_sociale, motivo, effetto, nota, creato, da_utente FROM app.cliente_segnalato ORDER BY creato DESC`,
    ),
    query<Record<string, unknown>>(
      `SELECT id, piva, ragione_sociale, canale, to_char(data, 'YYYY-MM-DD') AS data, esito, importo, fonte
         FROM app.pratica_esterna WHERE fornitore_slug = $1 ORDER BY data DESC, id DESC`,
      [slug],
    ),
    query<Record<string, unknown>>(
      `SELECT codice, prezzo, to_char(valido_fino, 'YYYY-MM-DD') AS valido_fino, registrato, da_utente
         FROM app.catalogo_storico WHERE fornitore_slug = $1 ORDER BY codice, registrato DESC, id DESC LIMIT 2000`,
      [slug],
    ),
    query<Record<string, unknown>>(
      `SELECT id, creato, cliente_nome, piva, prezzo, canale, riservato FROM app.proposta
        WHERE fornitore_slug = $1 ORDER BY creato DESC LIMIT ${ULTIME}`,
      [slug],
    ),
    query<Record<string, unknown>>(
      `SELECT id, creato, cliente_nome, piva, importo, stato, canale, riservato,
              (dati->>'segnalazione') = 'true' AS segnalazione
         FROM app.pratica WHERE fornitore_slug = $1 ORDER BY creato DESC LIMIT ${ULTIME}`,
      [slug],
    ),
  ]);

  const perVoce: Record<string, unknown[]> = {};
  for (const r of storico) {
    (perVoce[String(r.codice)] ??= []).push({
      prezzo: Number(r.prezzo), validoFino: r.valido_fino ?? null, registrato: iso(r.registrato), daUtente: r.da_utente ?? null,
    });
  }
  return {
    segnalati: segnalati.map((r) => ({
      piva: r.piva, ragioneSociale: r.ragione_sociale ?? null, motivo: r.motivo, effetto: r.effetto,
      nota: r.nota ?? null, creato: iso(r.creato), daUtente: r.da_utente ?? null,
    })),
    praticheEsterne: esterne.map((r) => ({
      id: String(r.id), piva: r.piva, ragioneSociale: r.ragione_sociale ?? null, canale: r.canale ?? null,
      data: r.data, esito: r.esito ?? null, importo: numeroONull(r.importo), fonte: r.fonte ?? null,
    })),
    storico: perVoce,
    proposte: proposte.map((r) => ({
      id: r.id, creato: iso(r.creato), cliente: r.cliente_nome, piva: r.piva, importo: Number(r.prezzo),
      canale: r.canale ?? null, riservato: r.riservato ?? null,
    })),
    pratiche: pratiche.map((r) => ({
      id: r.id, creato: iso(r.creato), cliente: r.cliente_nome, piva: r.piva, importo: Number(r.importo),
      stato: r.stato, segnalazione: Boolean(r.segnalazione), canale: r.canale ?? null, riservato: r.riservato ?? null,
    })),
  };
}

export async function GET({ request }: { request: Request }) {
  const e = await sessioneMotore(request, new URL(request.url).searchParams.get('f'));
  if (!e.ok) return e.risposta;
  if (e.contesto.ruolo !== 'admin') return json({ ok: false, error: 'permesso_negato' }, 403);
  const c = e.carrozzeria;
  const spesa = await spesaDelMese();
  const mia = spesa.perSorgente[`carrozzeria/${c.slug}`] ?? { chiamate: 0, totale: 0, perServizio: {} };

  // Richieste da addebitare al fornitore: un cliente al mese (richieste.ts).
  // Il mese corrente col margine sulla spesa Openapi, il precedente da fatturare.
  const verifiche = await query<{ id: string; piva: string; creato: string }>(
    `SELECT id, piva, creato FROM app.ricerca_merito WHERE fornitore_slug = $1 AND creato >= now() - interval '70 days'`,
    [c.slug],
  );
  const perMese = riepilogoMesi(verifiche);
  const corrente = meseDi(new Date());
  const precedente = mesePrecedenteDi(corrente);
  const quante = (m: string) => perMese.find((x) => x.mese === m)?.richieste ?? 0;
  const richieste = {
    prezzo: c.prezzoVerifica,
    corrente: { mese: corrente, richieste: quante(corrente), ...contoRichieste(quante(corrente), c.prezzoVerifica, mia.totale) },
    precedente: { mese: precedente, richieste: quante(precedente), ...contoRichieste(quante(precedente), c.prezzoVerifica, null) },
  };

  // Le tabelle del settore distinta si leggono solo li': Duplex e gli altri restano come prima
  const distinta = c.settore === 'distinta'
    ? await datiDistinta(c.slug)
    : { segnalati: [], praticheEsterne: [], storico: {}, proposte: [], pratiche: [] };

  return json({
    ok: true,
    config: {
      settore: c.settore, etichettaBene: c.etichettaBene, partnerLeasing: c.partnerLeasing,
      sogliaLeasing: c.sogliaLeasing, tettoMeseEuro: c.tettoMeseEuro, demo: c.demo,
      documentiExtra: c.documentiExtra, tabellaCanoni: c.tabellaCanoni,
      colore: c.brand.colore, accento: c.brand.accento, attivo: c.attivo,
      tabellaAlternativa: c.tabellaAlternativa, regoleSemaforo: c.regoleSemaforo, leasing: c.leasing,
      prezzoVerifica: c.prezzoVerifica,
    },
    // Le scelte possibili arrivano da qui e non dal codice della pagina: i nomi
    // dei partner sono ratio interna e il browser degli agenti non li scarica
    opzioni: {
      partner: PARTNER.map((p) => ({ valore: p, etichetta: p[0].toUpperCase() + p.slice(1) })),
      listini: [
        { valore: 'esg', etichetta: 'Grenke ESG++++ (fotovoltaico)' },
        { valore: 'sputnik', etichetta: 'Grenke Sputnik++++ (beni strumentali)' },
        { valore: 'pagarent', etichetta: 'PagaRent' },
        { valore: 'sputnik-duplex', etichetta: 'Grenke Sputnik++++ Duplex (tradizionale)' },
        { valore: 'grace-duplex', etichetta: 'Grenke Grace Period Duplex' },
      ],
      regole: [
        { valore: 'credit-policy', etichetta: 'Credit policy (tool Marotta)' },
        { valore: 'locatore', etichetta: 'Criteri del locatore' },
        { valore: 'prefiltro', etichetta: 'Prefiltro (settore distinta)' },
      ],
      canali: CANALI.map((valore) => ({ valore, etichetta: NOMI_CANALE[valore] })),
      canaliEsterni: CANALI_ESTERNI.map((valore) => ({ valore, etichetta: NOMI_CANALE[valore] })),
    },
    catalogo: await catalogo(c.slug, false),
    spesa: { mese: spesa.mese, euro: mia.totale, chiamate: mia.chiamate, perServizio: mia.perServizio },
    richieste,
    canali: c.canali,
    societaFornitrice: c.societaFornitrice,
    categorie: c.categorie,
    checklist: c.checklist,
    pioneerLetto: PIONEER_LETTO,
    // Accanto al canale: l'instradamento ignora Grenke finche' la tabella non ha una data di lettura
    avvisiCanale: PIONEER_LETTO === null ? { grenke: 'Data di lettura della tabella Pioneer mancante: Grenke resta spento' } : {},
    ...distinta,
  });
}

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''));
  if (!e.ok) return e.risposta;
  if (e.contesto.ruolo !== 'admin') return json({ ok: false, error: 'permesso_negato' }, 403);
  const k = e.carrozzeria;
  const slug = k.slug;
  const azione = String(corpo.azione ?? '');
  const utente = e.contesto.email || e.contesto.userId;
  const storico = k.settore === 'distinta' ? { utente } : null;
  const rifiuto = (messaggio: string) => json({ ok: false, error: 'config_non_valida', messaggio }, 400);

  if (azione === 'config') {
    const c = (corpo.config ?? {}) as Record<string, unknown>;
    const partner = PARTNER.includes(String(c.partnerLeasing)) ? String(c.partnerLeasing) : k.partnerLeasing;
    const soglia = numero(c.sogliaLeasing);
    const tetto = numero(c.tettoMeseEuro);
    // Vuoto = il fornitore non paga le verifiche. Assente (una pagina vecchia
    // che non conosce il campo) = resta il prezzo di prima. Fuori misura o
    // illeggibile = rifiuto: prima diventava "non si fattura" senza dirlo
    let prezzoVerifica: number | null = k.prezzoVerifica;
    if (c.prezzoVerifica === '' || c.prezzoVerifica === null) prezzoVerifica = null;
    else if (c.prezzoVerifica !== undefined) {
      const letto = numero(c.prezzoVerifica);
      if (!(letto >= 0 && letto <= 1000)) {
        return rifiuto('Prezzo per richiesta non valido: un numero fra 0 e 1.000 euro, oppure vuoto se non si fattura. Nessuna modifica salvata.');
      }
      prezzoVerifica = Math.round(letto * 100) / 100;
    }
    const extra = Array.isArray(c.documentiExtra)
      ? c.documentiExtra.map((d) => testo(d, 160)).filter(Boolean).slice(0, 12)
      : k.documentiExtra;
    // Un settore che non si riconosce lascia la colonna com'e': mai un ripiego su
    // 'generico' al posto di un valore salvato (una pagina vecchia senza 'distinta')
    await query(
      `UPDATE app.carrozzeria SET settore = COALESCE($2, settore), etichetta_bene = $3, partner_leasing = $4, soglia_leasing = $5,
              tetto_mese_euro = $6, demo = $7, documenti_extra = $8, tabella_alternativa = $9,
              regole_semaforo = $10, leasing = $11, prezzo_verifica = $12, aggiornato = now() WHERE slug = $1`,
      [slug, sceltaDaElenco(c.settore, SETTORI),
       testo(c.etichettaBene, 80) || k.etichettaBene, partner,
       soglia >= 0 ? soglia : k.sogliaLeasing, tetto >= 0 ? tetto : k.tettoMeseEuro,
       Boolean(c.demo), JSON.stringify(extra),
       // Vuoto = nessun listino affiancato; un valore che non si riconosce lascia quello di prima
       c.tabellaAlternativa === '' || c.tabellaAlternativa === null ? null
         : LISTINI.includes(String(c.tabellaAlternativa)) ? String(c.tabellaAlternativa) : k.tabellaAlternativa,
       sceltaDaElenco(c.regoleSemaforo, REGOLE) ?? k.regoleSemaforo,
       c.leasing === undefined ? k.leasing : Boolean(c.leasing),
       prezzoVerifica],
    );
    await query(
      `UPDATE app.fornitore SET tabella_canoni = $2, brand_colore = $3, brand_accento = $4 WHERE slug = $1`,
      [slug, LISTINI.includes(String(c.tabellaCanoni)) ? String(c.tabellaCanoni) : k.tabellaCanoni,
       COLORE.test(String(c.colore)) ? String(c.colore) : k.brand.colore,
       COLORE.test(String(c.accento)) ? String(c.accento) : k.brand.accento],
    );
    console.log(JSON.stringify({ evento: 'motore_admin_config', fornitore: slug, userId: e.contesto.userId }));
    return json({ ok: true });
  }

  if (azione === 'voce') {
    const letta = leggiVoceConMotivo((corpo.voce ?? {}) as Record<string, unknown>);
    if (!letta.ok) return json({ ok: false, error: 'voce_non_valida', ...(letta.motivo ? { messaggio: letta.motivo } : {}) }, 400);
    if (!categoriaNota(k, letta.voce)) return json({ ok: false, error: 'categoria_non_valida' }, 400);
    await salvaVoce(slug, letta.voce, storico, haValidita(corpo.voce));
    return json({ ok: true });
  }

  if (azione === 'importa') {
    const righe = Array.isArray(corpo.righe) ? corpo.righe.slice(0, 500) : [];
    const scartate: number[] = [];
    const senzaCategoria: number[] = [];
    // Righe scartate con un motivo da dire (kWp, kWh, passo o massimo ambigui)
    const ambigue: { riga: number; motivo: string }[] = [];
    let salvate = 0;
    for (const [i, r] of righe.entries()) {
      const letta = leggiVoceConMotivo(r as Record<string, unknown>);
      if (!letta.ok) {
        if (letta.motivo) ambigue.push({ riga: i + 1, motivo: letta.motivo });
        else scartate.push(i + 1);
        continue;
      }
      if (!categoriaNota(k, letta.voce)) { senzaCategoria.push(i + 1); continue; }
      await salvaVoce(slug, letta.voce, storico, haValidita(r));
      salvate++;
    }
    console.log(JSON.stringify({
      evento: 'motore_admin_import', fornitore: slug, salvate,
      scartate: scartate.length + senzaCategoria.length + ambigue.length,
    }));
    return json({ ok: true, salvate, scartate, senzaCategoria, ambigue });
  }

  if (azione === 'attiva') {
    await query(`UPDATE app.catalogo_voce SET attivo = $3, aggiornato = now() WHERE fornitore_slug = $1 AND codice = $2`,
      [slug, testo(corpo.codice, 40), Boolean(corpo.attivo)]);
    return json({ ok: true });
  }

  if (!AZIONI_DISTINTA.includes(azione)) return json({ ok: false, error: 'azione_sconosciuta' }, 400);
  if (k.settore !== 'distinta') return json({ ok: false, error: 'solo_distinta' }, 400);

  /** Una colonna jsonb di configurazione, dopo il controllo */
  const salvaColonna = async (colonna: 'canali' | 'societa_fornitrice' | 'categorie' | 'checklist', valore: unknown) => {
    await query(`UPDATE app.carrozzeria SET ${colonna} = $2, aggiornato = now() WHERE slug = $1`, [slug, JSON.stringify(valore)]);
    console.log(JSON.stringify({ evento: 'motore_admin_config', fornitore: slug, colonna, userId: e.contesto.userId }));
    return json({ ok: true });
  };

  if (azione === 'canali') {
    const c = controllaCanali(corpo.canali, (id) => tabellaSeEsiste(id) !== null);
    return c.ok ? salvaColonna('canali', c.valore) : rifiuto(c.errore);
  }

  if (azione === 'societa') {
    // Il logo e' un file sullo store: dal pannello non si cambia, resta quello salvato
    const inviata = { ...((corpo.societa ?? {}) as Record<string, unknown>), logo: k.societaFornitrice?.logo ?? null };
    const c = controllaSocieta(inviata);
    return c.ok ? salvaColonna('societa_fornitrice', c.valore) : rifiuto(c.errore);
  }

  if (azione === 'categorie') {
    const c = controllaCategorie(corpo.categorie);
    if (!c.ok) return rifiuto(c.errore);
    const orfane = categorieOrfane(c.valore, await catalogo(slug, false));
    if (orfane.length) {
      return rifiuto(`${orfane.map((n) => `«${n}»`).join(', ')} ${orfane.length === 1 ? 'è usata' : 'sono usate'} da voci accese del catalogo: cambia o spegni prima quelle voci. Nessuna modifica salvata.`);
    }
    return salvaColonna('categorie', c.valore);
  }

  if (azione === 'checklist') {
    const c = controllaChecklist(corpo.checklist);
    return c.ok ? salvaColonna('checklist', c.valore) : rifiuto(c.errore);
  }

  if (azione === 'segnala') {
    const c = controllaSegnalazione(corpo);
    if (!c.ok) return rifiuto(c.errore);
    const s = c.valore;
    await query(
      `INSERT INTO app.cliente_segnalato (piva, ragione_sociale, motivo, effetto, nota, da_utente)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (piva) DO UPDATE SET ragione_sociale = EXCLUDED.ragione_sociale, motivo = EXCLUDED.motivo,
         effetto = EXCLUDED.effetto, nota = EXCLUDED.nota, da_utente = EXCLUDED.da_utente`,
      [s.piva, s.ragioneSociale, s.motivo, s.effetto, s.nota, utente],
    );
    console.log(JSON.stringify({ evento: 'motore_segnalato', piva: s.piva, effetto: s.effetto, userId: e.contesto.userId }));
    return json({ ok: true });
  }

  if (azione === 'togli-segnalazione') {
    const piva = pulisciPiva(String(corpo.piva ?? ''));
    if (!pivaValida(piva)) return rifiuto('Partita IVA non valida: servono 11 cifre con la cifra di controllo giusta.');
    const tolte = await query(`DELETE FROM app.cliente_segnalato WHERE piva = $1 RETURNING piva`, [piva]);
    if (!tolte.length) return json({ ok: false, error: 'segnalazione_non_trovata' }, 404);
    console.log(JSON.stringify({ evento: 'motore_segnalato_tolto', piva, userId: e.contesto.userId }));
    return json({ ok: true });
  }

  // azione === 'pratica-esterna'
  const c = controllaPraticaEsterna(corpo);
  if (!c.ok) return rifiuto(c.errore);
  const p = c.valore;
  await query(
    `INSERT INTO app.pratica_esterna (piva, ragione_sociale, fornitore_slug, canale, data, esito, importo, fonte)
     VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8)`,
    [p.piva, p.ragioneSociale, slug, p.canale, p.data, p.esito, p.importo, 'Pannello MCF'],
  );
  console.log(JSON.stringify({ evento: 'motore_pratica_esterna', fornitore: slug, userId: e.contesto.userId }));
  return json({ ok: true });
}
