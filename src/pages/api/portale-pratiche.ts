export const prerender = false;

// Pratiche dei portali partner ad accesso nominale (oggi /tools/stilo).
//
// GET  ?partner=<slug>             chi sei e le pratiche che puoi vedere
//                                  (fa anche da controllo di sessione per il gate)
// GET  ?partner=<slug>&doc=<path>  un documento, se sta in una pratica che vedi
// POST {partner, id, stato}        cambia lo stato: solo MCF
//
// Fratello di /api/pratiche-expo, che resta per i portali a password. Qui il
// fornitore e il ruolo li decide la sessione (src/lib/portale-auth.ts), le
// regole di visibilita' stanno in src/lib/pratiche-visibilita.ts.

import { getPartner } from '../../data/portali-partner';
import { richiediSessione, vedeTuttoIlFornitore } from '../../lib/portale-auth';
import { praticheVisibili, rispostaDocumento, scriviStato } from '../../lib/pratiche-nominali';
import { documentoVisibile, praticaPerElenco } from '../../lib/pratiche-visibilita';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

/** Solo i portali passati agli accessi personali rispondono qui */
function partnerNominale(slug: unknown) {
  const p = typeof slug === 'string' ? getPartner(slug) : null;
  return p?.accessoNominale ? p : null;
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const partner = partnerNominale(url.searchParams.get('partner'));
  if (!partner) return json({ ok: false, error: 'fornitore_sconosciuto' }, 404);

  const esito = await richiediSessione(request, {
    slugRichiesto: partner.slug,
    permesso: { preventivo: ['leggi-propri'] },
  });
  if (!esito.ok) return esito.risposta;
  const { contesto } = esito;
  const lettore = { userId: contesto.userId, vedeTutto: vedeTuttoIlFornitore(contesto) };

  try {
    const pratiche = await praticheVisibili(partner.slug, lettore);

    const doc = url.searchParams.get('doc');
    if (doc !== null) {
      if (!documentoVisibile(pratiche, doc, partner.slug, lettore)) {
        console.warn(JSON.stringify({
          event: 'portale_doc_rifiutato', userId: contesto.userId, partner: partner.slug, percorso: doc,
        }));
        return new Response('Documento non disponibile', { status: 403 });
      }
      return await rispostaDocumento(doc);
    }

    return json({
      ok: true,
      ruolo: contesto.ruolo,
      vedeTutto: lettore.vedeTutto,
      utente: { id: contesto.userId, nome: contesto.nome, email: contesto.email },
      // L'IBAN del cliente resta nel record e nella mail a MCF, non nella lista
      pratiche: pratiche.map((p) => praticaPerElenco(p)),
    });
  } catch (e) {
    console.error(JSON.stringify({ event: 'portale_pratiche_errore', partner: partner.slug, error: String(e) }));
    return json({ ok: false, error: 'lettura_non_riuscita' }, 500);
  }
}

export async function POST({ request }: { request: Request }) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  const partner = partnerNominale(corpo.partner);
  if (!partner) return json({ ok: false, error: 'fornitore_sconosciuto' }, 404);

  const esito = await richiediSessione(request, { slugRichiesto: partner.slug });
  if (!esito.ok) return esito.risposta;
  // Gli stati li muove MCF: il partner li vede e basta
  if (esito.contesto.ruolo !== 'admin') return json({ ok: false, error: 'permesso_negato' }, 403);

  try {
    const r = await scriviStato(partner.slug, String(corpo.id ?? '').trim(), String(corpo.stato ?? '').trim(), esito.contesto.email);
    if (!r.ok) return json({ ok: false, error: r.errore }, r.errore === 'pratica_non_trovata' ? 404 : 400);
    console.log(JSON.stringify({ event: 'pratica_stato', partner: partner.slug, id: corpo.id, stato: corpo.stato }));
    return json({ ok: true, pratica: praticaPerElenco(r.pratica) });
  } catch (e) {
    console.error(JSON.stringify({ event: 'pratica_stato_error', partner: partner.slug, error: String(e) }));
    return json({ ok: false, error: 'aggiornamento_non_riuscito' }, 500);
  }
}
