export const prerender = false;

// Apertura del portale: chi sei, per quale fornitore lavori, cosa vende.
// GET /api/motore/sessione?f=<slug>
//
// Risponde con la parte della carrozzeria che il browser puo' vedere: nome,
// marchio, settore, catalogo con i prezzi di listino. Il partner del leasing e
// la tabella del noleggio restano qui: sono la ratio interna di MCF.

import { catalogo } from '../../../lib/motore/carrozzeria';
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
    carrozzeria: {
      slug: c.slug,
      nome: c.nome,
      citta: c.citta,
      settore: c.settore,
      etichettaBene: c.etichettaBene,
      sogliaLeasing: c.sogliaLeasing,
      demo: c.demo,
      colore: c.brand.colore,
      accento: c.brand.accento,
      documentiExtra: c.documentiExtra,
    },
    catalogo: (await catalogo(c.slug)).map((v) => ({
      codice: v.codice,
      nome: v.nome,
      descrizione: v.descrizione,
      prezzo: v.prezzo,
      attributi: v.attributi,
    })),
  });
}
