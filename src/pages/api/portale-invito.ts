export const prerender = false;

// Attivazione di un invito.
//
// Due strade, perche' gli agenti sono plurimandatari e uno puo' avere gia' un
// account nostro per un altro fornitore:
//  - non esiste ancora: sceglie nome e password, l'account nasce qui
//  - esiste gia': fa il login con le sue credenziali e il rapporto si aggiunge
//
// L'id dell'invito e' la credenziale: chi ce l'ha ha ricevuto la mail su quella
// casella. Per questo il GET non richiede sessione, ma restituisce il minimo
// indispensabile e niente che non serva a compilare il modulo.

import { randomUUID } from 'node:crypto';
import { auth } from '../../lib/auth';
import { query, queryUna } from '../../lib/db';
import { segnaAccettato } from '../../lib/inviti';

function json(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...headers },
  });
}

interface RigaInvito {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  org_nome: string;
  org_slug: string;
}

async function leggiInvito(id: string): Promise<RigaInvito | null> {
  if (!id) return null;
  return queryUna<RigaInvito>(
    `SELECT i.id, i."organizationId", i.email, i.role, i.status, i."expiresAt",
            o.name AS org_nome, o.slug AS org_slug
       FROM "invitation" i
       JOIN "organization" o ON o.id = i."organizationId"
      WHERE i.id = $1`,
    [id],
  );
}

function statoInvito(inv: RigaInvito | null): { valido: boolean; motivo?: string } {
  if (!inv) return { valido: false, motivo: 'invito_inesistente' };
  if (inv.status === 'accepted') return { valido: false, motivo: 'invito_gia_usato' };
  if (inv.status !== 'pending') return { valido: false, motivo: 'invito_annullato' };
  if (new Date(inv.expiresAt).getTime() < Date.now()) return { valido: false, motivo: 'invito_scaduto' };
  return { valido: true };
}

export async function GET({ request }: { request: Request }) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const inv = await leggiInvito(id);
  const stato = statoInvito(inv);
  if (!stato.valido || !inv) return json({ ok: false, error: stato.motivo }, 404);

  const utente = await queryUna<{ id: string }>(`SELECT id FROM "user" WHERE lower(email) = lower($1)`, [inv.email]);

  return json({
    ok: true,
    email: inv.email,
    ruolo: inv.role,
    organizzazione: inv.org_nome,
    slug: inv.org_slug,
    // Cambia solo il modulo da mostrare: password nuova oppure login.
    accountEsistente: Boolean(utente),
  });
}

/** Aggiunge il rapporto e chiude l'invito. Idempotente sul membro. */
async function attivaRapporto(inv: RigaInvito, userId: string): Promise<void> {
  await query(
    `INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt")
     SELECT $1, $2, $3, $4, now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "member" WHERE "organizationId" = $2 AND "userId" = $3
      )`,
    [randomUUID(), inv.organizationId, userId, inv.role],
  );
  // Un rapporto riaperto torna attivo: se la persona era stata sospesa e viene
  // reinvitata, l'invito deve valere qualcosa.
  await query(
    `INSERT INTO app.membro_stato (organization_id, user_id, attivo)
     VALUES ($1,$2,true)
     ON CONFLICT (organization_id, user_id) DO UPDATE SET attivo = true, aggiornato = now()`,
    [inv.organizationId, userId],
  );
  await query(`UPDATE "invitation" SET status = 'accepted' WHERE id = $1`, [inv.id]);
  await segnaAccettato(inv.id);
}

export async function POST({ request }: { request: Request }) {
  // Anche qui vale il controllo di origine: e' una richiesta che crea account.
  const origin = request.headers.get('origin');
  const origini = ['https://www.mediocreditofacile.it', 'https://mediocreditofacile.it', 'http://localhost:4321'];
  if (origin && !origini.includes(origin)) return json({ ok: false, error: 'origine_non_valida' }, 403);

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const inv = await leggiInvito(String(corpo.id ?? ''));
  const stato = statoInvito(inv);
  if (!stato.valido || !inv) return json({ ok: false, error: stato.motivo }, 410);

  // Strada 1: l'agente ha gia' un account e ha appena fatto il login.
  const sessione = await auth.api.getSession({ headers: request.headers });
  if (sessione?.user) {
    if (sessione.user.email.toLowerCase() !== inv.email.toLowerCase()) {
      return json({ ok: false, error: 'invito_di_un_altra_email' }, 403);
    }
    await attivaRapporto(inv, sessione.user.id);
    return json({ ok: true, slug: inv.org_slug });
  }

  // Strada 2: account nuovo. La password la sceglie l'agente adesso: nessuna
  // password provvisoria da comunicare, quindi niente credenziali che girano.
  const password = String(corpo.password ?? '');
  const nome = String(corpo.nome ?? '').trim().slice(0, 120);
  if (password.length < 10) return json({ ok: false, error: 'password_troppo_corta' }, 400);
  if (!nome) return json({ ok: false, error: 'nome_mancante' }, 400);

  let risposta: Response;
  try {
    risposta = await auth.api.signUpEmail({
      body: { email: inv.email, password, name: nome },
      asResponse: true,
    });
  } catch (e) {
    console.error(JSON.stringify({ event: 'invito_signup_error', invito: inv.id, error: String(e) }));
    return json({ ok: false, error: 'creazione_account_fallita' }, 400);
  }
  if (!risposta.ok) {
    return json({ ok: false, error: 'creazione_account_fallita' }, 400);
  }

  const utente = await queryUna<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = lower($1)`,
    [inv.email],
  );
  if (!utente) return json({ ok: false, error: 'creazione_account_fallita' }, 500);

  await attivaRapporto(inv, utente.id);
  // L'account e' appena nato ed e' gia' autenticato: si passa avanti il cookie.
  const cookie = risposta.headers.get('set-cookie');
  return json({ ok: true, slug: inv.org_slug }, 200, cookie ? { 'set-cookie': cookie } : {});
}
