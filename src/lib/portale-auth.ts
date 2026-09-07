// LA guardia dei portali con accesso nominale. Sta in un posto solo apposta.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// REGOLA NON NEGOZIABILE: l'organizzazione da cui leggere si deriva SEMPRE
// dalla sessione, mai da un parametro della richiesta. Se il client manda uno
// slug, un id o un percorso di file, quel valore viene confrontato con quello
// del contesto e la richiesta viene RIFIUTATA se non corrisponde, mai corretta
// in silenzio: correggere in silenzio nasconde i tentativi invece di fermarli.
//
// L'unica eccezione e' l'admin MCF, che ha visibilita' su tutti i fornitori e
// per cui lo slug richiesto viene comunque validato contro app.fornitore.

import { auth, RUOLI_ORG, type RuoloOrg } from './auth';
import { queryUna } from './db';

/** Origini da cui accettiamo richieste autenticate */
const ORIGINI = [
  'https://www.mediocreditofacile.it',
  'https://mediocreditofacile.it',
  'http://localhost:4321',
];

export type Ruolo = 'admin' | RuoloOrg;

export interface Contesto {
  userId: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
  /** Null solo per l'admin MCF che non ha indicato un fornitore */
  organizationId: string | null;
  fornitoreSlug: string | null;
  fornitoreNome: string | null;
  tabellaCanoni: string | null;
  /** Prefisso degli id preventivo, es. GG */
  prefisso: string | null;
}

export type EsitoSessione =
  | { ok: true; contesto: Contesto }
  | { ok: false; risposta: Response };

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

/**
 * Controllo di origine. Astro ha security.checkOrigin disattivato a livello
 * globale (serviva per i form pubblici dietro Vercel), quindi con
 * l'autenticazione a cookie il controllo va rifatto qui, altrimenti un sito
 * terzo puo' far partire dal browser dell'agente richieste che modificano dati.
 */
function origineValida(request: Request): boolean {
  const metodoSicuro = request.method === 'GET' || request.method === 'HEAD';
  const origin = request.headers.get('origin');
  if (!origin) return metodoSicuro; // i GET diretti del browser non hanno Origin
  return ORIGINI.includes(origin);
}

interface RigaFornitore {
  slug: string;
  nome: string;
  organization_id: string;
  tabella_canoni: string;
  prefisso: string;
  attivo: boolean;
}

async function fornitoreDaOrg(organizationId: string): Promise<RigaFornitore | null> {
  return queryUna<RigaFornitore>(
    `SELECT slug, nome, organization_id, tabella_canoni, prefisso, attivo
       FROM app.fornitore WHERE organization_id = $1`,
    [organizationId],
  );
}

async function fornitoreDaSlug(slug: string): Promise<RigaFornitore | null> {
  return queryUna<RigaFornitore>(
    `SELECT slug, nome, organization_id, tabella_canoni, prefisso, attivo
       FROM app.fornitore WHERE slug = $1`,
    [slug],
  );
}

export interface OpzioniSessione {
  /** Permesso richiesto, es. { preventivo: ['crea'] } */
  permesso?: Parameters<(typeof RUOLI_ORG)['agente']['authorize']>[0];
  /**
   * Slug chiesto dal client (query string o corpo). Viene confrontato con
   * quello della sessione: se non corrisponde la richiesta e' rifiutata.
   * L'admin puo' indicare qualsiasi fornitore esistente.
   */
  slugRichiesto?: string | null;
}

/**
 * Risolve la sessione e il fornitore di appartenenza, oppure restituisce
 * gia' pronta la risposta di rifiuto.
 */
export async function richiediSessione(
  request: Request,
  opzioni: OpzioniSessione = {},
): Promise<EsitoSessione> {
  if (!origineValida(request)) {
    return { ok: false, risposta: json({ ok: false, error: 'origine_non_valida' }, 403) };
  }

  const sessione = await auth.api.getSession({ headers: request.headers });
  if (!sessione?.user) {
    // 401 e non 403: il portale distingue "rifai il login" da "non puoi".
    return { ok: false, risposta: json({ ok: false, error: 'sessione_assente' }, 401) };
  }

  const utente = sessione.user as typeof sessione.user & { role?: string; banned?: boolean };
  if (utente.banned) {
    return { ok: false, risposta: json({ ok: false, error: 'utente_disattivato' }, 403) };
  }

  const isAdmin = utente.role === 'admin';

  // Quale organizzazione. Per l'admin puo' arrivare dal parametro, per tutti
  // gli altri esce dalla riga member e dal parametro non si prende nulla.
  let fornitore: RigaFornitore | null = null;
  let ruolo: Ruolo;

  if (isAdmin) {
    ruolo = 'admin';
    if (opzioni.slugRichiesto) {
      fornitore = await fornitoreDaSlug(opzioni.slugRichiesto);
      if (!fornitore) {
        return { ok: false, risposta: json({ ok: false, error: 'fornitore_sconosciuto' }, 404) };
      }
    } else {
      // Nessun fornitore indicato: si prende quello di cui l'admin e' membro,
      // se c'e'. Serve a dargli un contesto sensato quando apre un portale
      // dalla sua pagina, senza togliergli la visibilita' sugli altri, che
      // resta a un parametro di distanza.
      const suo = await queryUna<{ organizationId: string }>(
        `SELECT "organizationId" FROM "member" WHERE "userId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
        [utente.id],
      );
      if (suo) fornitore = await fornitoreDaOrg(suo.organizationId);
    }
  } else {
    // Si prende il primo rapporto ATTIVO: un agente sospeso da un fornitore
    // resta un agente valido per gli altri, perche' e' plurimandatario.
    const membro = await queryUna<{ organizationId: string; role: string }>(
      `SELECT m."organizationId", m."role" FROM "member" m
         LEFT JOIN app.membro_stato ms
           ON ms.organization_id = m."organizationId" AND ms.user_id = m."userId"
        WHERE m."userId" = $1 AND COALESCE(ms.attivo, true) = true
        ORDER BY m."createdAt" ASC
        LIMIT 1`,
      [utente.id],
    );
    if (!membro) {
      // O non e' membro di nulla, o e' stato sospeso ovunque: al portale
      // interessa il risultato, non la differenza.
      return { ok: false, risposta: json({ ok: false, error: 'nessuna_organizzazione' }, 403) };
    }
    if (!(membro.role in RUOLI_ORG)) {
      return { ok: false, risposta: json({ ok: false, error: 'ruolo_sconosciuto' }, 403) };
    }
    ruolo = membro.role as RuoloOrg;

    fornitore = await fornitoreDaOrg(membro.organizationId);
    if (!fornitore) {
      return { ok: false, risposta: json({ ok: false, error: 'fornitore_non_configurato' }, 403) };
    }
    if (!fornitore.attivo) {
      return { ok: false, risposta: json({ ok: false, error: 'fornitore_sospeso' }, 403) };
    }

    // Qui si ferma il tentativo di leggere i dati di un altro fornitore:
    // lo slug chiesto deve essere il proprio, e la differenza e' un rifiuto.
    if (opzioni.slugRichiesto && opzioni.slugRichiesto !== fornitore.slug) {
      console.warn(JSON.stringify({
        event: 'accesso_incrociato_rifiutato',
        userId: utente.id,
        proprio: fornitore.slug,
        richiesto: opzioni.slugRichiesto,
      }));
      return { ok: false, risposta: json({ ok: false, error: 'fornitore_non_tuo' }, 403) };
    }
  }

  if (opzioni.permesso && !isAdmin) {
    const esito = RUOLI_ORG[ruolo as RuoloOrg].authorize(opzioni.permesso);
    if (!esito.success) {
      return { ok: false, risposta: json({ ok: false, error: 'permesso_negato' }, 403) };
    }
  }

  return {
    ok: true,
    contesto: {
      userId: utente.id,
      email: utente.email,
      nome: utente.name ?? '',
      ruolo,
      organizationId: fornitore?.organization_id ?? null,
      fornitoreSlug: fornitore?.slug ?? null,
      fornitoreNome: fornitore?.nome ?? null,
      tabellaCanoni: fornitore?.tabella_canoni ?? null,
      prefisso: fornitore?.prefisso ?? null,
    },
  };
}

/** Vede tutta l'attivita' del fornitore, non solo la propria */
export function vedeTuttoIlFornitore(contesto: Contesto): boolean {
  if (contesto.ruolo === 'admin') return true;
  return RUOLI_ORG[contesto.ruolo].authorize({ preventivo: ['leggi-org'] }).success;
}

/**
 * Verifica che un percorso sullo store Blob appartenga al fornitore della
 * sessione. Nessuna normalizzazione: un percorso che non corrisponde e' un
 * rifiuto, non un percorso da aggiustare.
 */
export function percorsoDelFornitore(contesto: Contesto, percorso: string): boolean {
  if (!percorso || percorso.includes('..')) return false;
  if (contesto.ruolo === 'admin' && !contesto.fornitoreSlug) return true;
  if (!contesto.fornitoreSlug) return false;
  return (
    percorso.startsWith(`preventivi/${contesto.fornitoreSlug}/`) ||
    percorso.startsWith(`pratiche/${contesto.fornitoreSlug}/`)
  );
}
