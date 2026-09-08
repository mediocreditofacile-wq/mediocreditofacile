// Better Auth: identita' degli utenti dei portali con accesso nominale.
//
// ATTENZIONE — FILE SERVER-ONLY. Ci passano il segreto e la stringa di
// connessione: non importarlo mai da un'isola client. Il browser parla solo
// con /api/auth/*, mai con questo modulo.
//
// PERCHE' OSPITATO DA NOI E NON GESTITO DA NEON (verificato sulla doc Neon,
// settembre 2026): il Managed Better Auth non elenca Astro tra i framework
// supportati e dichiara "coming soon" le architetture in cui frontend e backend
// stanno su deployment separati, perche' il cookie di sessione non si condivide
// tra domini; il metodo SDK di reset password non e' ancora supportato e passa
// dai loro componenti React, che qui non abbiamo (usiamo Preact); il plugin
// Organization e' in beta parziale e il suo ruolo Member e' di sola lettura,
// mentre il nostro agente deve scrivere. Ospitandolo noi restano la stessa
// libreria e lo stesso Postgres Neon: cambia chi esegue il codice, non dove
// vivono i dati.
//
// Le tabelle di Better Auth stanno nello schema public (user, session, account,
// verification, organization, member, invitation), le nostre in schema app.

import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';
import { env, getPool, queryUna } from './db';
import { inviaMail, layoutMail, escapeHtml } from './mail-portale';
import { mailInvito } from './mail-invito';

/**
 * Permessi del portale. Non usiamo i ruoli predefiniti owner/admin/member
 * perche' il loro member e' pensato in sola lettura, mentre il nostro agente
 * deve poter creare preventivi e rileggere i propri.
 */
const statement = {
  ...defaultStatements,
  preventivo: ['crea', 'leggi-propri', 'leggi-org'],
  utente: ['invita', 'disattiva', 'lista'],
  documento: ['leggi-propri', 'leggi-org'],
} as const;

export const ac = createAccessControl(statement);

/** Il referente del fornitore: vede tutta la rete e ne gestisce gli account */
export const referente = ac.newRole({
  ...ownerAc.statements,
  preventivo: ['crea', 'leggi-propri', 'leggi-org'],
  utente: ['invita', 'disattiva', 'lista'],
  documento: ['leggi-propri', 'leggi-org'],
});

/** L'agente: genera preventivi e rilegge solo i propri */
export const agente = ac.newRole({
  preventivo: ['crea', 'leggi-propri'],
  documento: ['leggi-propri'],
});

export const RUOLI_ORG = { referente, agente };
export type RuoloOrg = keyof typeof RUOLI_ORG;

/** Dominio pubblico: in locale il default e' la porta di astro dev */
export const BASE_URL = env('BETTER_AUTH_URL') ?? 'http://localhost:4321';

/**
 * Il portale su cui rimandare un utente. Lo slug dell'organizzazione coincide
 * con lo slug del portale (green-go -> /tools/green-go), cosi' il link vale
 * anche per i fornitori che aggiungeremo dopo.
 */
async function urlPortale(userId: string): Promise<string> {
  const riga = await queryUna<{ slug: string }>(
    `SELECT o.slug FROM "organization" o
       JOIN "member" m ON m."organizationId" = o.id
      WHERE m."userId" = $1
      ORDER BY m."createdAt" ASC
      LIMIT 1`,
    [userId],
  );
  return `${BASE_URL}/tools/${riga?.slug ?? 'green-go'}`;
}

export const auth = betterAuth({
  database: getPool(),
  secret: env('BETTER_AUTH_SECRET'),
  baseURL: BASE_URL,
  basePath: '/api/auth',
  trustedOrigins: [
    'https://www.mediocreditofacile.it',
    'https://mediocreditofacile.it',
    'http://localhost:4321',
  ],

  emailAndPassword: {
    enabled: true,
    // L'email e' gia' verificata dall'invito: chi arriva qui ha cliccato un
    // link ricevuto sulla propria casella.
    requireEmailVerification: false,
    minPasswordLength: 10,
    autoSignIn: true,
    async sendResetPassword({ user, url }) {
      const portale = await urlPortale(user.id);
      const esito = await inviaMail({
        to: user.email,
        subject: 'Reimposta la password del portale',
        html: layoutMail('Reimposta la password', `
          <p style="font-size:15px;line-height:1.6">
            Ciao ${escapeHtml(user.name || '')}, hai chiesto di reimpostare la password
            del portale Mediocredito Facile.
          </p>
          <p style="margin:24px 0">
            <a href="${url}" style="background:#FE6F3A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">
              Scegli una nuova password
            </a>
          </p>
          <p style="font-size:14px;line-height:1.6;color:#787782">
            Il link vale un'ora. Se non l'hai chiesto tu, ignora questa email:
            la password attuale resta valida. Il portale e' <a href="${portale}" style="color:#664CCD">${escapeHtml(portale)}</a>.
          </p>
        `),
      });
      if (!esito.ok) {
        console.error(JSON.stringify({ event: 'reset_password_mail_error', err: esito.err }));
      }
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // trenta giorni
    updateAge: 60 * 60 * 24, // rinnovo al massimo una volta al giorno
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  plugins: [
    organization({
      ac,
      roles: RUOLI_ORG,
      creatorRole: 'referente',
      // Green-Go da sola porta 201 persone: il default di 100 non basta.
      membershipLimit: 500,
      // Un agente plurimandatario non apre la posta in giornata: 48 ore sono
      // poche, e un invito scaduto e' una telefonata ad Alberto.
      invitationExpiresIn: 60 * 60 * 24 * 7,
      // Le organizzazioni le crea MCF, non gli utenti.
      allowUserToCreateOrganization: false,
      // Strada secondaria: gli inviti normali passano dalla coda
      // (src/lib/inviti.ts), che li manda a scaglioni per non sfondare il tetto
      // giornaliero di Resend. Questo scatta solo se un invito viene creato
      // direttamente dalle API di Better Auth.
      async sendInvitationEmail(data) {
        const esito = await mailInvito({
          a: data.email,
          invitationId: data.id,
          organizzazione: data.organization.name,
          slug: data.organization.slug,
          invitante: data.inviter.user.name || data.inviter.user.email,
          baseUrl: BASE_URL,
          ruolo: data.role,
        });
        if (!esito.ok) {
          throw new Error(esito.ritentabile ? 'mail_ritentabile' : `mail_fallita: ${esito.err}`);
        }
      },
    }),

    // Ruolo di applicazione: 'admin' e' MCF, e ha ban/unban, che revoca le
    // sessioni attive lasciando al suo posto la riga utente. Le pratiche
    // continuano a puntare a un utente che esiste: niente cancellazioni.
    admin(),
  ],
});

export type Auth = typeof auth;
