export const prerender = false;

/**
 * Scheda azienda per lo strumento di valutazione interno MCF.
 * GET /api/azienda?piva=00178340261
 *
 * Autenticazione: bearer con VALUTAZIONE_KEY. E' uno strumento interno che
 * spende soldi veri a ogni chiamata, quindi l'endpoint non e' mai pubblico.
 */

import { schedaAzienda, spesaDelMese, esitiVerifiche } from '../../lib/openapi';

function autorizzato(request: Request): boolean {
  const atteso = import.meta.env.VALUTAZIONE_KEY as string;
  if (!atteso) return false;
  const h = request.headers.get('authorization') ?? '';
  return h === `Bearer ${atteso}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);

  const url = new URL(request.url);
  const piva = (url.searchParams.get('piva') ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(piva)) return json({ errore: 'partita IVA non valida' }, 400);

  try {
    const scheda = await schedaAzienda(piva, { conNegativita: true });
    if (!scheda.trovata) return json({ trovata: false, piva });
    // Esiti delle verifiche gia' pagate su azienda, soci e amministratori: solo blob,
    // nessuna chiamata Openapi. Stanno fuori dalla cache della scheda perche' hanno
    // una vita loro: un report pagato oggi deve comparire anche su una scheda di ieri.
    const codici = [
      piva,
      ...(scheda.soci ?? []).map((s: any) => String(s?.taxCode ?? '')),
      ...((scheda.full?.managers ?? []) as any[]).map((m) => String(m?.taxCode ?? '')),
    ];
    const [spesa, verifiche] = await Promise.all([spesaDelMese(), esitiVerifiche(codici)]);
    console.log(JSON.stringify({ evento: 'scheda_azienda', piva, daCache: !!scheda.daCache, verifiche: Object.keys(verifiche).length }));
    return json({ ...scheda, spesa, verifiche });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'scheda_azienda_errore', piva, msg }));
    return json({ errore: msg }, 502);
  }
}
