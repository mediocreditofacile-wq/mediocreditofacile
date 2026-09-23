export const prerender = false;

/**
 * Verifiche a richiesta su soci e amministratori.
 *
 *   POST /api/verifica  {tipo:"negativita", cf}                    -> {id, pronto, dati?}
 *   POST /api/verifica  {tipo:"report", nome, cognome, cf}         -> {id, pronto, dati?}
 *   GET  /api/verifica?tipo=negativita&id=...&cf=...               -> {pronto, dati}
 *   POST /api/verifica  {tipo:"recupera", tipoVerifica, cf, id?, dati?, avviata?}
 *
 * Sono asincrone: la negativita' ci mette oltre un minuto, il report persona anche
 * di piu', quindi il browser avvia e poi ripassa a chiedere l'esito. Ogni avvio
 * costa, per questo prima di chiamare Openapi si guarda il registro
 * openapi/verifiche/{cf}.json: se la stessa verifica e' gia' stata pagata negli
 * ultimi 30 giorni si risponde da li', senza spesa. L'id si salva appena la
 * chiamata parte, cosi' un ricaricamento a meta' attesa non lo perde.
 *
 * "recupera" serve a rimettere nel registro verifiche pagate e mai salvate: con
 * l'id interroga Openapi sull'esito (lettura, non un nuovo avvio), senza id scrive
 * l'esito passato a mano.
 */

import {
  avviaNegativita, esitoNegativita, avviaReportPersona, esitoReportPersona,
  leggiVerifica, scriviVerifica,
} from '../../lib/openapi';
import { decidiVerifica, riduciNegativita, type TipoVerifica } from '../../lib/verifiche-cache';

function autorizzato(request: Request): boolean {
  const atteso = import.meta.env.VALUTAZIONE_KEY as string;
  if (!atteso) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${atteso}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const normCf = (v: unknown) => String(v ?? '').trim().toUpperCase();
const cfValido = (cf: string) => /^[A-Z0-9]{11,16}$/.test(cf);

/** Chiede l'esito a Openapi e lo riduce alla forma che si conserva. */
async function esitoDaOpenapi(tipo: TipoVerifica, id: string): Promise<{ pronto: boolean; dati?: any }> {
  if (tipo === 'report') return esitoReportPersona(id);
  const r = await esitoNegativita(id);
  return r.pronto ? { pronto: true, dati: riduciNegativita(r.dati) } : r;
}

/** Salva l'id appena avviato. Se il blob non scrive, la verifica prosegue comunque. */
async function salvaAvvio(cf: string, tipo: TipoVerifica, id: string) {
  try {
    await scriviVerifica(cf, tipo, { id, avviata: new Date().toISOString(), pronto: false });
  } catch (err) {
    console.error(JSON.stringify({ evento: 'verifica_registro_errore', cf, tipo, id, msg: String(err) }));
  }
}

async function avvia(tipo: TipoVerifica, cf: string, body: any) {
  const decisione = decidiVerifica(await leggiVerifica(cf), tipo);
  if (decisione.azione === 'registro') {
    console.log(JSON.stringify({ evento: 'verifica_da_registro', tipo, cf, id: decisione.id, pronto: decisione.pronto }));
    return json({ id: decisione.id, pronto: decisione.pronto, dati: decisione.dati, avviata: decisione.avviata, daRegistro: true });
  }

  const id = tipo === 'report'
    ? await avviaReportPersona(String(body.nome), String(body.cognome), cf)
    : await avviaNegativita(cf);
  if (!id) return json({ errore: 'Openapi non ha restituito un id' }, 502);
  await salvaAvvio(cf, tipo, id);
  console.log(JSON.stringify({ evento: tipo === 'report' ? 'verifica_report_persona' : 'verifica_negativita', cf, id, motivo: decisione.motivo }));
  return json({ id, pronto: false });
}

async function recupera(body: any) {
  const tipo: TipoVerifica = body?.tipoVerifica === 'report' ? 'report' : 'negativita';
  const cf = normCf(body?.cf);
  if (!cfValido(cf)) return json({ errore: 'codice fiscale o partita IVA non valida' }, 400);
  const id = String(body?.id ?? '').trim();
  const avviata = body?.avviata ? new Date(body.avviata).toISOString() : new Date().toISOString();

  if (id) {
    const r = await esitoDaOpenapi(tipo, id);
    await scriviVerifica(cf, tipo, r.pronto
      ? { id, avviata, pronto: true, dati: r.dati, concluso: new Date().toISOString() }
      : { id, avviata, pronto: false });
    console.log(JSON.stringify({ evento: 'verifica_recuperata', tipo, cf, id, pronto: r.pronto }));
    return json({ cf, tipo, id, pronto: r.pronto, dati: r.dati });
  }

  // senza id si registra un esito gia' noto (letto a schermo prima che sparisse)
  if (!body?.dati || typeof body.dati !== 'object') return json({ errore: 'servono id oppure dati' }, 400);
  const dati = tipo === 'negativita' ? riduciNegativita(body.dati) : body.dati;
  const manuale = `manuale-${avviata.slice(0, 10)}`;
  await scriviVerifica(cf, tipo, { id: manuale, avviata, pronto: true, dati, concluso: avviata });
  console.log(JSON.stringify({ evento: 'verifica_recuperata', tipo, cf, id: manuale, pronto: true }));
  return json({ cf, tipo, id: manuale, pronto: true, dati });
}

export async function POST({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);

  const body = await request.json().catch(() => null);
  const tipo = body?.tipo;
  try {
    if (tipo === 'negativita') {
      const cf = normCf(body?.cf);
      if (!cfValido(cf)) return json({ errore: 'codice fiscale o partita IVA non valida' }, 400);
      return await avvia('negativita', cf, body);
    }
    if (tipo === 'report') {
      const cf = normCf(body?.cf);
      if (!body?.nome || !body?.cognome || !cf) return json({ errore: 'servono nome, cognome e codice fiscale' }, 400);
      return await avvia('report', cf, body);
    }
    if (tipo === 'recupera') return await recupera(body);
    return json({ errore: 'tipo non riconosciuto' }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'verifica_errore', tipo, msg }));
    return json({ errore: msg }, 502);
  }
}

export async function GET({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const tipo: TipoVerifica = url.searchParams.get('tipo') === 'report' ? 'report' : 'negativita';
  const cf = normCf(url.searchParams.get('cf'));
  if (!id) return json({ errore: 'id mancante' }, 400);

  try {
    // esito gia' in registro con lo stesso id: si risponde senza passare da Openapi
    const registro = cf ? await leggiVerifica(cf) : null;
    const voce = registro?.[tipo];
    if (voce?.id === id && voce.pronto) return json({ pronto: true, dati: voce.dati, avviata: voce.avviata });

    const r = await esitoDaOpenapi(tipo, id);
    // si scrive solo sulla verifica che il registro conosce con quell'id (o su un registro vuoto):
    // un id vecchio non deve sovrascrivere un esito piu' recente
    if (r.pronto && cf && cfValido(cf) && (!voce || voce.id === id)) {
      const avviata = voce?.avviata ?? new Date().toISOString();
      await scriviVerifica(cf, tipo, { id, avviata, pronto: true, dati: r.dati, concluso: new Date().toISOString() })
        .catch((err) => console.error(JSON.stringify({ evento: 'verifica_registro_errore', cf, tipo, id, msg: String(err) })));
      console.log(JSON.stringify({ evento: 'verifica_conclusa', tipo, cf, id }));
      return json({ ...r, avviata });
    }
    return json(r);
  } catch (err) {
    return json({ errore: err instanceof Error ? err.message : 'errore sconosciuto' }, 502);
  }
}
