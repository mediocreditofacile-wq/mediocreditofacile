// Coda degli inviti.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Perche' una coda e non un invio diretto: il piano Resend gratuito accetta
// 100 email al giorno e 3.000 al mese, e Green-Go da sola ha circa duecento
// agenti da attivare. Mandandoli tutti insieme, dal centunesimo in poi non
// parte niente, e un invito che fallisce in silenzio e' un agente che non entra
// e che telefona ad Alberto. Qui gli inviti si accodano, escono a scaglioni,
// e chi fallisce per tetto raggiunto torna in fila invece di essere perso.
//
// L'invito viene creato su Better Auth SOLO al momento dell'invio, non quando
// si accoda: la scadenza deve partire da quando l'agente riceve la mail, non da
// quando il referente ha compilato l'elenco.

import { randomUUID } from 'node:crypto';
import { BASE_URL } from './auth';
import { query, queryUna } from './db';
import { mailInvito } from './mail-invito';

/** Quanti inviti al giorno. Sotto i 100 di Resend, per lasciare margine ai
 *  reset password e alle notifiche dei preventivi, che usano lo stesso tetto. */
export const INVITI_PER_GIRO = 80;
/** Dopo questi tentativi l'invito si ferma e lo si guarda a mano */
const TENTATIVI_MAX = 5;
/** Giorni di validita', allineati a invitationExpiresIn in auth.ts */
const GIORNI_VALIDITA = 7;

export type StatoInvito = 'da_inviare' | 'inviato' | 'accettato' | 'fallito';

export interface RigaInvito {
  id: string;
  email: string;
  nome: string;
  ruolo: string;
  stato: StatoInvito;
  invitation_id: string | null;
  tentativi: number;
  ultimo_errore: string | null;
  creato: string;
  inviato_il: string | null;
  accettato_il: string | null;
}

/** Mette un invito in fila. Se ce n'e' gia' uno aperto per quella email, non
 *  ne crea un secondo: due clic del referente non devono fare due email. */
export async function accodaInvito(opts: {
  organizationId: string;
  email: string;
  nome: string;
  ruolo: 'agente' | 'referente';
  creatoDa: string;
}): Promise<{ ok: boolean; motivo?: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, motivo: 'email_non_valida' };

  const gia = await queryUna<{ id: string }>(
    `SELECT u.id FROM "user" u
       JOIN "member" m ON m."userId" = u.id
      WHERE lower(u.email) = $1 AND m."organizationId" = $2`,
    [email, opts.organizationId],
  );
  if (gia) return { ok: false, motivo: 'gia_membro' };

  try {
    await query(
      `INSERT INTO app.invito (organization_id, email, nome, ruolo, creato_da)
       VALUES ($1,$2,$3,$4,$5)`,
      [opts.organizationId, email, opts.nome.trim().slice(0, 120), opts.ruolo, opts.creatoDa],
    );
    return { ok: true };
  } catch (e) {
    // L'indice unico parziale copre gli inviti ancora aperti
    if (String(e).includes('invito_org_email_aperto_idx')) return { ok: false, motivo: 'invito_gia_aperto' };
    throw e;
  }
}

interface DaInviare {
  id: string;
  organization_id: string;
  email: string;
  nome: string;
  ruolo: string;
  creato_da: string;
  tentativi: number;
  org_nome: string;
  org_slug: string;
  invitante: string;
}

/**
 * Manda il prossimo scaglione. Idempotente rispetto al tetto: se Resend
 * risponde che non ne accetta altre, l'invito resta 'da_inviare' e riparte
 * al giro successivo.
 */
export async function svuotaCoda(
  limite = INVITI_PER_GIRO,
  /** Un solo invito, quando il referente chiede di mandare proprio quello */
  solo?: { id: string; organizationId: string },
): Promise<{ inviati: number; rimandati: number; falliti: number }> {
  const valori: unknown[] = [limite];
  let filtro = '';
  if (solo) {
    valori.push(solo.id, solo.organizationId);
    filtro = ` AND i.id = $${valori.length - 1}::bigint AND i.organization_id = $${valori.length}`;
  }
  const righe = await query<DaInviare>(
    `SELECT i.id, i.organization_id, i.email, i.nome, i.ruolo, i.creato_da, i.tentativi,
            o.name AS org_nome, o.slug AS org_slug,
            COALESCE(u.name, u.email) AS invitante
       FROM app.invito i
       JOIN "organization" o ON o.id = i.organization_id
       JOIN "user" u ON u.id = i.creato_da
      WHERE i.stato = 'da_inviare'${filtro}
      ORDER BY i.creato ASC
      LIMIT $1`,
    valori,
  );

  let inviati = 0;
  let rimandati = 0;
  let falliti = 0;

  for (const r of righe) {
    // L'invito su Better Auth nasce adesso, cosi' i sette giorni partono da
    // quando la mail parte davvero.
    const invitationId = randomUUID();
    const scadenza = new Date(Date.now() + GIORNI_VALIDITA * 24 * 60 * 60 * 1000);

    try {
      await query(
        `INSERT INTO "invitation" (id, "organizationId", email, role, status, "expiresAt", "inviterId")
         VALUES ($1,$2,$3,$4,'pending',$5,$6)`,
        [invitationId, r.organization_id, r.email, r.ruolo, scadenza, r.creato_da],
      );
    } catch (e) {
      falliti += 1;
      await query(
        `UPDATE app.invito SET stato='fallito', tentativi=tentativi+1, ultimo_errore=$2 WHERE id=$1`,
        [r.id, `invito_non_creato: ${String(e).slice(0, 200)}`],
      );
      continue;
    }

    const esito = await mailInvito({
      a: r.email,
      invitationId,
      organizzazione: r.org_nome,
      slug: r.org_slug,
      invitante: r.invitante,
      baseUrl: BASE_URL,
      ruolo: r.ruolo,
    });

    if (esito.ok) {
      inviati += 1;
      await query(
        `UPDATE app.invito SET stato='inviato', invitation_id=$2, inviato_il=now(),
                tentativi=tentativi+1, ultimo_errore=NULL WHERE id=$1`,
        [r.id, invitationId],
      );
      continue;
    }

    // La mail non e' partita: l'invito appena creato non serve a nessuno.
    await query(`DELETE FROM "invitation" WHERE id = $1`, [invitationId]);
    const tentativi = r.tentativi + 1;
    const riprovabile = esito.ritentabile && tentativi < TENTATIVI_MAX;
    if (riprovabile) rimandati += 1;
    else falliti += 1;

    await query(
      `UPDATE app.invito SET stato=$2, tentativi=$3, ultimo_errore=$4 WHERE id=$1`,
      [r.id, riprovabile ? 'da_inviare' : 'fallito', tentativi, (esito.err ?? '').slice(0, 300)],
    );

    // Tetto giornaliero raggiunto: inutile insistere, si riprende domani.
    if (esito.ritentabile && /429|rate|limit|quota/i.test(esito.err ?? '')) break;
  }

  console.log(JSON.stringify({ event: 'inviti_coda', esaminati: righe.length, inviati, rimandati, falliti }));
  return { inviati, rimandati, falliti };
}

/**
 * Manda subito un singolo invito, saltando la fila.
 *
 * Prima questa funzione si limitava a rimettere l'invito in coda, e il bottone
 * che la chiamava si chiamava "Rimanda": su un invito gia' in coda non faceva
 * niente, lo stato restava "in attesa del prossimo scaglione" e chi aveva
 * cliccato credeva di aver spedito. Ora spedisce davvero.
 */
export async function inviaSubito(
  idInvito: string,
  organizationId: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const righe = await query<{ invitation_id: string | null }>(
    `UPDATE app.invito
        SET stato='da_inviare', tentativi=0, ultimo_errore=NULL, inviato_il=NULL
      WHERE id=$1::bigint AND organization_id=$2 AND stato <> 'accettato'
      RETURNING invitation_id`,
    [idInvito, organizationId],
  );
  if (!righe.length) return { ok: false, motivo: 'invito_non_trovato' };

  // Il link vecchio va annullato prima di crearne uno nuovo: altrimenti dopo
  // due rinvii girano tre link validi per la stessa persona, e chi li ha
  // ricevuti non sa quale usare.
  const precedente = righe[0].invitation_id;
  if (precedente) {
    await query(`UPDATE "invitation" SET status='canceled' WHERE id=$1 AND status='pending'`, [precedente]);
  }
  await query(`UPDATE app.invito SET invitation_id=NULL WHERE id=$1::bigint`, [idInvito]);

  const esito = await svuotaCoda(1, { id: idInvito, organizationId });
  if (esito.inviati === 1) return { ok: true };

  // Non e' partita: il motivo e' gia' scritto sulla riga, il portale lo mostra
  const stato = await queryUna<{ ultimo_errore: string | null; stato: string }>(
    `SELECT ultimo_errore, stato FROM app.invito WHERE id = $1::bigint`,
    [idInvito],
  );
  return {
    ok: false,
    motivo: stato?.stato === 'da_inviare' ? 'invio_rimandato' : 'invio_fallito',
  };
}

/** Segna accettato l'invito corrispondente, dopo che l'utente e' entrato */
export async function segnaAccettato(invitationId: string): Promise<void> {
  await query(
    `UPDATE app.invito SET stato='accettato', accettato_il=now() WHERE invitation_id=$1`,
    [invitationId],
  );
}

/** Inviti dell'organizzazione, per il pannello del referente */
export async function invitiDi(organizationId: string): Promise<RigaInvito[]> {
  return query<RigaInvito>(
    `SELECT id::text, email, nome, ruolo, stato, invitation_id, tentativi, ultimo_errore,
            creato, inviato_il, accettato_il
       FROM app.invito
      WHERE organization_id = $1
      ORDER BY creato DESC
      LIMIT 500`,
    [organizationId],
  );
}
