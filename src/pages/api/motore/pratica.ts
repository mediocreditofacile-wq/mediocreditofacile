export const prerender = false;

// Caricamento di una pratica dal portale del motore.
// POST /api/motore/pratica
//   { f, ricercaId, propostaId?, bozza, prodotto, durata, importo,
//     formaGiuridica, referente: {nome, telefono, email}, note, documenti: [...] }
//
// Il cliente e' quello della ricerca di merito, non uno scritto a mano. I
// documenti sono gia' sullo store (caricati dal browser via /api/motore/upload)
// e si tengono solo quelli nella cartella della bozza. All'invio parte la
// verifica eventi negativi, il cui esito vede solo MCF.

import { queryUna } from '../../../lib/db';
import { ricercaVisibile } from '../../../lib/motore/calcolo-proposta';
import { creaPratica, documentiDellaBozza, bozzaValida, FORME } from '../../../lib/motore/pratica';
import { corpoJson, filtroVisibilita, json, sessioneMotore } from '../../../lib/motore/sessione';

const testo = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''), { permesso: { preventivo: ['crea'] } });
  if (!e.ok) return e.risposta;

  const ricerca = await ricercaVisibile(e, testo(corpo.ricercaId, 60));
  if (!ricerca) return json({ ok: false, error: 'ricerca_non_trovata' }, 404);

  // Il preventivo, se indicato, deve essere visibile e dello stesso cliente
  let propostaId: string | null = testo(corpo.propostaId, 60) || null;
  if (propostaId) {
    const { where, valori } = filtroVisibilita(e, '', 3);
    const p = await queryUna(`SELECT 1 FROM app.proposta WHERE id = $1 AND piva = $2 AND ${where}`,
      [propostaId, ricerca.piva, ...valori]);
    if (!p) propostaId = null;
  }

  const bozza = testo(corpo.bozza, 40);
  if (!bozzaValida(bozza)) return json({ ok: false, error: 'bozza_non_valida' }, 400);
  const importo = Math.round(Number(corpo.importo) * 100) / 100;
  if (!(importo > 0) || importo > 10_000_000) return json({ ok: false, error: 'importo_non_valido' }, 400);
  const durata = Math.round(Number(corpo.durata));
  if (!(durata >= 12 && durata <= 120)) return json({ ok: false, error: 'durata_non_valida' }, 400);
  const forma = testo(corpo.formaGiuridica, 40);
  const ref = (corpo.referente ?? {}) as Record<string, unknown>;
  const referente = { nome: testo(ref.nome, 120), telefono: testo(ref.telefono, 40), email: testo(ref.email, 160) };
  if (!referente.telefono && !referente.email) return json({ ok: false, error: 'referente_mancante' }, 400);

  try {
    const id = await creaPratica(e, {
      ricerca,
      propostaId,
      bozza,
      prodotto: corpo.prodotto === 'leasing' ? 'leasing' : 'noleggio',
      durata,
      importo,
      formaGiuridica: (FORME as readonly string[]).includes(forma) ? forma : 'Altro',
      referente,
      note: testo(corpo.note, 2000),
      documenti: documentiDellaBozza(e.carrozzeria.slug, bozza, corpo.documenti),
    });
    return json({ ok: true, id });
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_pratica_errore', fornitore: e.carrozzeria.slug, msg: String(err) }));
    return json({ ok: false, error: 'pratica_non_riuscita' }, 500);
  }
}
