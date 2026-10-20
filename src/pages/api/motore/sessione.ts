export const prerender = false;

// Apertura del portale: chi sei, per quale fornitore lavori, cosa vende.
// GET /api/motore/sessione?f=<slug>
//
// Risponde con la parte della carrozzeria che il browser puo' vedere: nome,
// marchio, settore, catalogo con i prezzi di listino e, sul settore distinta,
// categorie e checklist (carrozzeriaPerBrowser). Il partner del leasing, la
// tabella del noleggio, i canali con le maggiorazioni e la societa' fornitrice
// restano qui: sono la ratio interna di MCF.

import { catalogo, carrozzeriaPerBrowser } from '../../../lib/motore/carrozzeria';
import { json, sessioneMotore } from '../../../lib/motore/sessione';

export async function GET({ request }: { request: Request }) {
  const slug = new URL(request.url).searchParams.get('f');
  const e = await sessioneMotore(request, slug);
  if (!e.ok) return e.risposta;
  const { contesto, carrozzeria: c } = e;

  return json({
    ok: true,
    ruolo: contesto.ruolo,
    vedeTutto: e.vedeTutto,
    utente: { id: contesto.userId, nome: contesto.nome, email: contesto.email },
    carrozzeria: carrozzeriaPerBrowser(c),
    catalogo: (await catalogo(c.slug)).map((v) => ({
      codice: v.codice,
      nome: v.nome,
      descrizione: v.descrizione,
      prezzo: v.prezzo,
      attributi: v.attributi,
    })),
  });
}
