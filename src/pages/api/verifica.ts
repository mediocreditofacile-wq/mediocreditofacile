export const prerender = false;

/**
 * Verifiche a richiesta su soci e amministratori.
 *
 *   POST /api/verifica  {tipo:"negativita", cf}                    -> {id}
 *   POST /api/verifica  {tipo:"report", nome, cognome, cf}         -> {id}
 *   GET  /api/verifica?tipo=negativita&id=...                      -> {pronto, dati}
 *
 * Sono asincrone: la negativita' ci mette oltre un minuto, quindi il browser
 * avvia e poi ripassa a chiedere l'esito. Ogni chiamata costa, per questo
 * l'endpoint parte solo su richiesta esplicita e mai in automatico.
 */

import { avviaNegativita, esitoNegativita, avviaReportPersona, esitoReportPersona } from '../../lib/openapi';

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

export async function POST({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);

  const body = await request.json().catch(() => null);
  const tipo = body?.tipo;
  try {
    if (tipo === 'negativita') {
      const cf = String(body?.cf ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{11,16}$/.test(cf)) return json({ errore: 'codice fiscale o partita IVA non valida' }, 400);
      const id = await avviaNegativita(cf);
      console.log(JSON.stringify({ evento: 'verifica_negativita', cf, id }));
      return json({ id });
    }
    if (tipo === 'report') {
      const { nome, cognome } = body ?? {};
      const cf = String(body?.cf ?? '').trim().toUpperCase();
      if (!nome || !cognome || !cf) return json({ errore: 'servono nome, cognome e codice fiscale' }, 400);
      const id = await avviaReportPersona(String(nome), String(cognome), cf);
      console.log(JSON.stringify({ evento: 'verifica_report_persona', cf, id }));
      return json({ id });
    }
    return json({ errore: 'tipo non riconosciuto' }, 400);
  } catch (err) {
    return json({ errore: err instanceof Error ? err.message : 'errore sconosciuto' }, 502);
  }
}

export async function GET({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const tipo = url.searchParams.get('tipo') ?? 'negativita';
  if (!id) return json({ errore: 'id mancante' }, 400);

  try {
    const r = tipo === 'report' ? await esitoReportPersona(id) : await esitoNegativita(id);
    return json(r);
  } catch (err) {
    return json({ errore: err instanceof Error ? err.message : 'errore sconosciuto' }, 502);
  }
}
