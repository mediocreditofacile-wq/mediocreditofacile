export const prerender = false;

// Pannello del referente: chi c'e' nella rete, chi e' stato invitato, chi e'
// sospeso. Il referente agisce solo sulla propria organizzazione, e questo non
// dipende dall'interfaccia: l'organizzazione esce dalla sessione.

import { query } from '../../lib/db';
import { accodaInvito, invitiDi, inviaSubito, svuotaCoda } from '../../lib/inviti';
import { richiediSessione, type Contesto } from '../../lib/portale-auth';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

/** L'utente indicato e' della stessa organizzazione di chi sta agendo? */
async function stessaRete(contesto: Contesto, userId: string): Promise<boolean> {
  const righe = await query(
    `SELECT 1 FROM "member" WHERE "userId" = $1 AND "organizationId" = $2`,
    [userId, contesto.organizationId],
  );
  return righe.length > 0;
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const esito = await richiediSessione(request, {
    slugRichiesto: url.searchParams.get('partner'),
    permesso: { utente: ['lista'] },
  });
  if (!esito.ok) return esito.risposta;
  const { contesto } = esito;
  if (!contesto.organizationId) return json({ ok: false, error: 'fornitore_non_indicato' }, 400);

  const membri = await query(
    `SELECT u.id, u.name AS nome, u.email, m.role AS ruolo, m."createdAt" AS dal,
            COALESCE(ms.attivo, true) AS attivo,
            u.banned AS bloccato_mcf,
            (SELECT count(*) FROM app.preventivo p
               WHERE p.user_id = u.id AND p.organization_id = m."organizationId") AS preventivi,
            (SELECT max(p.creato) FROM app.preventivo p
               WHERE p.user_id = u.id AND p.organization_id = m."organizationId") AS ultimo_preventivo
       FROM "member" m
       JOIN "user" u ON u.id = m."userId"
       LEFT JOIN app.membro_stato ms
              ON ms.organization_id = m."organizationId" AND ms.user_id = m."userId"
      WHERE m."organizationId" = $1
      ORDER BY u.name ASC`,
    [contesto.organizationId],
  );

  // Le richieste ancora da guardare stanno in cima: sono l'unica cosa in
  // questa schermata che aspetta una decisione.
  const richieste = await query(
    `SELECT id::text, nome, azienda, email, telefono, nota, stato, creato
       FROM app.richiesta_accesso
      WHERE organization_id = $1
      ORDER BY (stato = 'nuova') DESC, creato DESC
      LIMIT 200`,
    [contesto.organizationId],
  );

  return json({
    ok: true,
    ruolo: contesto.ruolo,
    membri,
    inviti: await invitiDi(contesto.organizationId),
    richieste,
  });
}

export async function POST({ request }: { request: Request }) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const azione = String(corpo.azione ?? '');
  const permesso =
    azione === 'invita' || azione === 'manda_ora' || azione === 'svuota_coda' ||
    azione === 'approva_richiesta' || azione === 'rifiuta_richiesta'
      ? { utente: ['invita'] as const }
      : { utente: ['disattiva'] as const };

  const esito = await richiediSessione(request, {
    slugRichiesto: typeof corpo.partner === 'string' ? corpo.partner : null,
    permesso,
  });
  if (!esito.ok) return esito.risposta;
  const { contesto } = esito;
  if (!contesto.organizationId) return json({ ok: false, error: 'fornitore_non_indicato' }, 400);

  if (azione === 'invita') {
    const ruolo = corpo.ruolo === 'referente' ? 'referente' : 'agente';
    // Solo l'admin MCF nomina altri referenti: un referente moltiplica se stesso
    // e da li' in poi nessuno sa piu' chi comanda la rete.
    if (ruolo === 'referente' && contesto.ruolo !== 'admin') {
      return json({ ok: false, error: 'solo_mcf_nomina_referenti' }, 403);
    }
    const r = await accodaInvito({
      organizationId: contesto.organizationId,
      email: String(corpo.email ?? ''),
      nome: String(corpo.nome ?? ''),
      ruolo,
      creatoDa: contesto.userId,
    });
    return json(r.ok ? { ok: true } : { ok: false, error: r.motivo }, r.ok ? 200 : 409);
  }

  if (azione === 'approva_richiesta' || azione === 'rifiuta_richiesta') {
    const id = String(corpo.richiesta ?? '');
    const approva = azione === 'approva_richiesta';
    // La richiesta si legge dalla propria organizzazione, non per id nudo:
    // l'id e' un numero e indovinarlo e' banale.
    const r = await query<{ nome: string; email: string }>(
      `UPDATE app.richiesta_accesso
          SET stato = $3, gestita_da = $4, gestita_il = now()
        WHERE id = $1::bigint AND organization_id = $2 AND stato = 'nuova'
        RETURNING nome, email`,
      [id, contesto.organizationId, approva ? 'approvata' : 'rifiutata', contesto.userId],
    );
    if (!r.length) return json({ ok: false, error: 'richiesta_non_trovata' }, 404);
    if (!approva) return json({ ok: true, approvata: false });

    // Approvare vuol dire accodare l'invito: da li' in poi il percorso e'
    // quello di sempre, password scelta dall'agente e nessuna credenziale
    // che gira a voce.
    const esito = await accodaInvito({
      organizationId: contesto.organizationId,
      email: r[0].email,
      nome: r[0].nome,
      ruolo: 'agente',
      creatoDa: contesto.userId,
    });
    return json(esito.ok ? { ok: true, approvata: true } : { ok: false, error: esito.motivo },
                esito.ok ? 200 : 409);
  }

  if (azione === 'manda_ora') {
    const r = await inviaSubito(String(corpo.invito ?? ''), contesto.organizationId);
    return json(r.ok ? { ok: true } : { ok: false, error: r.motivo }, r.ok ? 200 : 409);
  }

  if (azione === 'svuota_coda') {
    // Il referente puo' far partire subito uno scaglione invece di aspettare
    // il giro automatico.
    return json({ ok: true, ...(await svuotaCoda()) });
  }

  if (azione === 'sospendi' || azione === 'riattiva') {
    const userId = String(corpo.utente ?? '');
    if (!userId) return json({ ok: false, error: 'utente_mancante' }, 400);
    if (userId === contesto.userId) return json({ ok: false, error: 'non_puoi_sospendere_te_stesso' }, 400);
    if (!(await stessaRete(contesto, userId))) {
      console.warn(JSON.stringify({
        event: 'sospensione_fuori_rete_rifiutata',
        attore: contesto.userId, bersaglio: userId, organizzazione: contesto.organizationId,
      }));
      return json({ ok: false, error: 'utente_non_della_tua_rete' }, 403);
    }

    const attivo = azione === 'riattiva';
    await query(
      `INSERT INTO app.membro_stato (organization_id, user_id, attivo, motivo, aggiornato, aggiornato_da)
       VALUES ($1,$2,$3,$4, now(), $5)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET attivo = EXCLUDED.attivo, motivo = EXCLUDED.motivo,
                     aggiornato = now(), aggiornato_da = EXCLUDED.aggiornato_da`,
      [contesto.organizationId, userId, attivo, String(corpo.motivo ?? '').slice(0, 300) || null, contesto.userId],
    );

    if (!attivo) {
      // La sospensione deve avere effetto adesso, non alla scadenza del cookie.
      await query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
    }
    return json({ ok: true, attivo });
  }

  return json({ ok: false, error: 'azione_sconosciuta' }, 400);
}
