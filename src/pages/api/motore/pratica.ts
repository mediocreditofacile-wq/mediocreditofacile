export const prerender = false;

// Caricamento di una pratica dal portale del motore.
// POST /api/motore/pratica
//   { f, ricercaId, propostaId?, bozza, prodotto, durata, importo,
//     formaGiuridica, referente: {nome, telefono, email}, iban, note, documenti: [...] }
//
// Cellulare ed email del referente e IBAN dell'azienda sono obbligatori e si
// ricontrollano qui (src/lib/dati-cliente-pratica.ts): il browser li controlla
// gia', ma il browser si aggira.
//
// Il cliente e' quello della ricerca di merito, non uno scritto a mano. I
// documenti sono gia' sullo store (caricati dal browser via /api/motore/upload)
// e si tengono solo quelli nella cartella della bozza. All'invio parte la
// verifica eventi negativi, il cui esito vede solo MCF.
//
// Settore distinta (Led Office): tutta la richiesta passa da creaPraticaDistinta,
// qualunque cosa mandi il browser. Li' importo, righe e canale si rileggono dalla
// proposta salvata, il prefiltro si ricalcola sul server (un rosso arrivato dopo
// trasforma l'invio in una segnalazione), la forma viene dal Registro e i documenti
// si tengono per voce della checklist. Il corpo, in piu' di quello sopra:
//   { segnalazione?: true, righe?, consegna?, motivazioni?, ledwallConfermato?,
//     documenti: [{ nome, pathname, size, voce }] }
// La risposta dice solo { ok, id, segnalazione }: niente canale ne' importi del locatore.

import { controllaDatiCliente } from '../../../lib/dati-cliente-pratica';
import { queryUna } from '../../../lib/db';
import { ricercaVisibile } from '../../../lib/motore/calcolo-proposta';
import { prodottoAmmesso } from '../../../lib/motore/carrozzeria';
import { creaPratica, documentiDellaBozza, bozzaValida, FORME } from '../../../lib/motore/pratica';
import { creaPraticaDistinta } from '../../../lib/motore/pratica-distinta';
import { corpoJson, filtroVisibilita, json, sessioneMotore } from '../../../lib/motore/sessione';

const testo = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export async function POST({ request }: { request: Request }) {
  const corpo = await corpoJson(request);
  if (!corpo) return json({ ok: false, error: 'invalid_json' }, 400);
  const e = await sessioneMotore(request, String(corpo.f ?? ''), { permesso: { preventivo: ['crea'] } });
  if (!e.ok) return e.risposta;

  // Settore distinta: mai il percorso di sempre, che prende l'importo dal browser
  if (e.carrozzeria.settore === 'distinta') {
    try {
      const r = await creaPraticaDistinta(e, corpo);
      if (r.ok) return json({ ok: true, id: r.id, segnalazione: r.segnalazione });
      const { ok: _ok, status, ...errore } = r;
      return json({ ok: false, ...errore }, status);
    } catch (err) {
      console.error(JSON.stringify({ evento: 'motore_pratica_errore', fornitore: e.carrozzeria.slug, msg: String(err) }));
      return json({ ok: false, error: 'pratica_non_riuscita' }, 500);
    }
  }

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
  const cliente = controllaDatiCliente({ telefono: ref.telefono, email: ref.email, iban: corpo.iban });
  if (!cliente.ok) return json({ ok: false, error: cliente.errore, messaggio: cliente.messaggio }, 400);
  const referente = { nome: testo(ref.nome, 120), telefono: testo(cliente.telefono, 40), email: testo(cliente.email, 160) };

  try {
    const id = await creaPratica(e, {
      ricerca,
      propostaId,
      bozza,
      // Col leasing spento sulla carrozzeria (Duplex) si carica solo noleggio, qualunque cosa mandi il browser
      prodotto: prodottoAmmesso(e.carrozzeria, corpo.prodotto),
      durata,
      importo,
      formaGiuridica: (FORME as readonly string[]).includes(forma) ? forma : 'Altro',
      referente,
      iban: cliente.iban,
      note: testo(corpo.note, 2000),
      documenti: documentiDellaBozza(e.carrozzeria.slug, bozza, corpo.documenti),
    });
    return json({ ok: true, id });
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_pratica_errore', fornitore: e.carrozzeria.slug, msg: String(err) }));
    return json({ ok: false, error: 'pratica_non_riuscita' }, 500);
  }
}
