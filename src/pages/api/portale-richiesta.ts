export const prerender = false;

// Richiesta di accesso al portale, dalla rete del fornitore.
//
// E' l'unico endpoint dei portali nominali che risponde SENZA sessione: lo usa
// l'installatore che ha letto la lettera e non ha ancora un accesso. Per questo
// non crea niente di utilizzabile: scrive una riga che il referente deve
// approvare. Un modulo pubblico che attiva da solo farebbe entrare chiunque nel
// portale del fornitore, e da li' si generano offerte col suo marchio.

import { query, queryUna } from '../../lib/db';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail } from '../../lib/mail-portale';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

const ORIGINI = [
  'https://www.mediocreditofacile.it',
  'https://mediocreditofacile.it',
  'http://localhost:4321',
];

export async function POST({ request }: { request: Request }) {
  const origin = request.headers.get('origin');
  if (origin && !ORIGINI.includes(origin)) return json({ ok: false, error: 'origine_non_valida' }, 403);

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const testo = (k: string, max = 160) => String(corpo[k] ?? '').trim().slice(0, max);
  const slug = testo('fornitore', 60);
  const nome = testo('nome', 120);
  const email = testo('email', 160).toLowerCase();
  const azienda = testo('azienda', 160);
  const telefono = testo('telefono', 40);
  const nota = testo('nota', 500);

  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: 'dati_incompleti' }, 400);
  }
  // Honeypot: i moduli pubblici raccolgono robot, e un campo che nessun umano
  // vede costa meno di un captcha.
  if (testo('sito', 80)) {
    console.warn(JSON.stringify({ event: 'richiesta_accesso_scartata', slug }));
    return json({ ok: true });
  }

  const fornitore = await queryUna<{ organization_id: string; nome: string; attivo: boolean }>(
    `SELECT organization_id, nome, attivo FROM app.fornitore WHERE slug = $1`,
    [slug],
  );
  if (!fornitore || !fornitore.attivo) return json({ ok: false, error: 'fornitore_sconosciuto' }, 404);

  // Chi ha gia' un accesso non deve mettersi in fila: glielo diciamo.
  const gia = await queryUna(
    `SELECT 1 FROM "member" m JOIN "user" u ON u.id = m."userId"
      WHERE m."organizationId" = $1 AND lower(u.email) = $2`,
    [fornitore.organization_id, email],
  );
  if (gia) return json({ ok: false, error: 'hai_gia_accesso' }, 409);

  try {
    await query(
      `INSERT INTO app.richiesta_accesso (organization_id, nome, azienda, email, telefono, nota)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [fornitore.organization_id, nome, azienda || null, email, telefono || null, nota || null],
    );
  } catch (e) {
    if (String(e).includes('richiesta_aperta_idx')) return json({ ok: false, error: 'richiesta_gia_inviata' }, 409);
    throw e;
  }

  const riga = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:150px"><strong>${k}</strong></td><td>${escapeHtml(v)}</td></tr>`;
  void inviaMail({
    to: DESTINATARIO_MCF,
    subject: `Richiesta accesso portale ${fornitore.nome} — ${nome}`,
    html: layoutMail('Richiesta di accesso al portale', `
      <p style="font-size:15px;line-height:1.6">
        Un installatore della rete di ${escapeHtml(fornitore.nome)} ha chiesto l'accesso al portale.
        La richiesta e' in attesa: si approva dalla sezione "La tua rete".
      </p>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${riga('Nome', nome)}
        ${riga('Azienda', azienda || '-')}
        ${riga('Email', email)}
        ${riga('Telefono', telefono || '-')}
        ${riga('Nota', nota || '-')}
      </table>
    `),
  });

  console.log(JSON.stringify({ event: 'richiesta_accesso', fornitore: slug, email }));
  return json({ ok: true });
}
