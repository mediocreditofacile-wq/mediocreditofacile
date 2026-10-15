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
//
// Il catalogo si aggiorna per codice: reimportare lo stesso Excel aggiorna
// prezzi e nomi senza duplicare. Le voci non si cancellano, si spengono: un
// preventivo vecchio deve poter dire su quale voce era stato fatto.

import { query } from '../../../lib/db';
import { catalogo } from '../../../lib/motore/carrozzeria';
import { leggiVoce, numero, testo, type Voce } from '../../../lib/motore/catalogo-import';
import { corpoJson, json, sessioneMotore } from '../../../lib/motore/sessione';
import { spesaDelMese } from '../../../lib/openapi';
import { contoRichieste, meseDi, mesePrecedenteDi, riepilogoMesi } from '../../../lib/motore/richieste';

const PARTNER = ['sella', 'alba', 'credem'];
const SETTORI = ['fotovoltaico', 'generico', 'macchine'];
const LISTINI = ['esg', 'pagarent', 'sputnik', 'sputnik-duplex', 'grace-duplex'];
const REGOLE = ['credit-policy', 'locatore'];
const COLORE = /^#[0-9a-fA-F]{6}$/;

async function salvaVoce(slug: string, v: Voce) {
  await query(
    // Una voce nuova va in coda al catalogo; una che esiste tiene il suo posto
    `INSERT INTO app.catalogo_voce (fornitore_slug, codice, nome, descrizione, prezzo, attributi, ordine)
     VALUES ($1,$2,$3,$4,$5,$6,
             (SELECT COALESCE(max(ordine), -1) + 1 FROM app.catalogo_voce WHERE fornitore_slug = $1))
     ON CONFLICT (fornitore_slug, codice) DO UPDATE SET nome = EXCLUDED.nome, descrizione = EXCLUDED.descrizione,
       prezzo = EXCLUDED.prezzo, attributi = EXCLUDED.attributi, attivo = true, aggiornato = now()`,
    [slug, v.codice, v.nome, v.descrizione, v.prezzo, JSON.stringify(v.attributi)],
  );
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
      ],
    },
    catalogo: await catalogo(c.slug, false),
    spesa: { mese: spesa.mese, euro: mia.totale, chiamate: mia.chiamate, perServizio: mia.perServizio },
    richieste,
  });
}

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''));
  if (!e.ok) return e.risposta;
  if (e.contesto.ruolo !== 'admin') return json({ ok: false, error: 'permesso_negato' }, 403);
  const slug = e.carrozzeria.slug;
  const azione = String(corpo.azione ?? '');

  if (azione === 'config') {
    const k = (corpo.config ?? {}) as Record<string, unknown>;
    const partner = PARTNER.includes(String(k.partnerLeasing)) ? String(k.partnerLeasing) : e.carrozzeria.partnerLeasing;
    const soglia = numero(k.sogliaLeasing);
    const tetto = numero(k.tettoMeseEuro);
    // Vuoto = il fornitore non paga le verifiche. Assente (una pagina vecchia
    // che non conosce il campo) = resta il prezzo di prima
    const prezzoLetto = k.prezzoVerifica === undefined
      ? e.carrozzeria.prezzoVerifica
      : k.prezzoVerifica === '' || k.prezzoVerifica === null ? null : numero(k.prezzoVerifica);
    const prezzoVerifica = prezzoLetto !== null && prezzoLetto >= 0 && prezzoLetto <= 1000 ? Math.round(prezzoLetto * 100) / 100 : null;
    const extra = Array.isArray(k.documentiExtra)
      ? k.documentiExtra.map((d) => testo(d, 160)).filter(Boolean).slice(0, 12)
      : e.carrozzeria.documentiExtra;
    await query(
      `UPDATE app.carrozzeria SET settore = $2, etichetta_bene = $3, partner_leasing = $4, soglia_leasing = $5,
              tetto_mese_euro = $6, demo = $7, documenti_extra = $8, tabella_alternativa = $9,
              regole_semaforo = $10, leasing = $11, prezzo_verifica = $12, aggiornato = now() WHERE slug = $1`,
      [slug, SETTORI.includes(String(k.settore)) ? String(k.settore) : 'generico',
       testo(k.etichettaBene, 80) || e.carrozzeria.etichettaBene, partner,
       soglia >= 0 ? soglia : e.carrozzeria.sogliaLeasing, tetto >= 0 ? tetto : e.carrozzeria.tettoMeseEuro,
       Boolean(k.demo), JSON.stringify(extra),
       LISTINI.includes(String(k.tabellaAlternativa)) ? String(k.tabellaAlternativa) : null,
       REGOLE.includes(String(k.regoleSemaforo)) ? String(k.regoleSemaforo) : e.carrozzeria.regoleSemaforo,
       k.leasing === undefined ? e.carrozzeria.leasing : Boolean(k.leasing),
       prezzoVerifica],
    );
    await query(
      `UPDATE app.fornitore SET tabella_canoni = $2, brand_colore = $3, brand_accento = $4 WHERE slug = $1`,
      [slug, LISTINI.includes(String(k.tabellaCanoni)) ? String(k.tabellaCanoni) : e.carrozzeria.tabellaCanoni,
       COLORE.test(String(k.colore)) ? String(k.colore) : e.carrozzeria.brand.colore,
       COLORE.test(String(k.accento)) ? String(k.accento) : e.carrozzeria.brand.accento],
    );
    console.log(JSON.stringify({ evento: 'motore_admin_config', fornitore: slug, userId: e.contesto.userId }));
    return json({ ok: true });
  }

  if (azione === 'voce') {
    const v = leggiVoce((corpo.voce ?? {}) as Record<string, unknown>);
    if (!v) return json({ ok: false, error: 'voce_non_valida' }, 400);
    await salvaVoce(slug, v);
    return json({ ok: true });
  }

  if (azione === 'importa') {
    const righe = Array.isArray(corpo.righe) ? corpo.righe.slice(0, 500) : [];
    const scartate: number[] = [];
    let salvate = 0;
    for (const [i, r] of righe.entries()) {
      const v = leggiVoce(r as Record<string, unknown>);
      if (!v) { scartate.push(i + 1); continue; }
      await salvaVoce(slug, v);
      salvate++;
    }
    console.log(JSON.stringify({ evento: 'motore_admin_import', fornitore: slug, salvate, scartate: scartate.length }));
    return json({ ok: true, salvate, scartate });
  }

  if (azione === 'attiva') {
    await query(`UPDATE app.catalogo_voce SET attivo = $3, aggiornato = now() WHERE fornitore_slug = $1 AND codice = $2`,
      [slug, testo(corpo.codice, 40), Boolean(corpo.attivo)]);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'azione_sconosciuta' }, 400);
}
