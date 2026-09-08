// Isolamento fra fornitori.
//
// Il test che conta e' il secondo blocco: si autentica davvero come agente di
// un fornitore e prova a leggere i dati e i documenti di un altro indovinando
// gli identificativi, come farebbe qualcuno in malafede. Deve ricevere un
// rifiuto, non un risultato. Gira su un branch Neon dedicato (DATABASE_URL_TEST):
// senza quella variabile si salta, cosi' la build non dipende dal database.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Contesto } from './portale-auth';

// --- Blocco 1: la regola pura, senza database ---

describe('percorsoDelFornitore', () => {
  const base: Contesto = {
    userId: 'u1', email: 'a@b.it', nome: 'Agente', ruolo: 'agente',
    organizationId: 'org-gg', fornitoreSlug: 'green-go', fornitoreNome: 'GREEN-GO SRLS', fornitoreCitta: 'Avellino',
    tabellaCanoni: 'esg', prefisso: 'GG',
  };

  it('accetta i percorsi del proprio fornitore', async () => {
    const { percorsoDelFornitore } = await import('./portale-auth');
    expect(percorsoDelFornitore(base, 'preventivi/green-go/GG-1/prospetto.pdf')).toBe(true);
    expect(percorsoDelFornitore(base, 'pratiche/green-go/GG-1/visura.pdf')).toBe(true);
  });

  it('rifiuta i percorsi di un altro fornitore', async () => {
    const { percorsoDelFornitore } = await import('./portale-auth');
    expect(percorsoDelFornitore(base, 'preventivi/innovalux/IL-1/prospetto.pdf')).toBe(false);
    expect(percorsoDelFornitore(base, 'pratiche/full-service/FS-1/bilancio.pdf')).toBe(false);
  });

  it('non si lascia ingannare dal prefisso di uno slug piu lungo', async () => {
    const { percorsoDelFornitore } = await import('./portale-auth');
    // green-go-altro comincia per green-go: senza la barra finale passerebbe
    expect(percorsoDelFornitore(base, 'preventivi/green-go-altro/X/f.pdf')).toBe(false);
  });

  it('rifiuta la risalita di cartella', async () => {
    const { percorsoDelFornitore } = await import('./portale-auth');
    expect(percorsoDelFornitore(base, 'preventivi/green-go/../innovalux/IL-1/f.pdf')).toBe(false);
  });

  it('un agente senza fornitore non apre niente', async () => {
    const { percorsoDelFornitore } = await import('./portale-auth');
    const orfano = { ...base, fornitoreSlug: null, organizationId: null };
    expect(percorsoDelFornitore(orfano, 'preventivi/green-go/GG-1/f.pdf')).toBe(false);
  });
});

describe('vedeTuttoIlFornitore', () => {
  const base: Contesto = {
    userId: 'u1', email: 'a@b.it', nome: 'x', ruolo: 'agente',
    organizationId: 'org', fornitoreSlug: 'green-go', fornitoreNome: 'G', fornitoreCitta: null, tabellaCanoni: 'esg', prefisso: 'GG',
  };

  it('l agente vede solo i propri preventivi', async () => {
    const { vedeTuttoIlFornitore } = await import('./portale-auth');
    expect(vedeTuttoIlFornitore(base)).toBe(false);
  });

  it('il referente vede tutta la rete', async () => {
    const { vedeTuttoIlFornitore } = await import('./portale-auth');
    expect(vedeTuttoIlFornitore({ ...base, ruolo: 'referente' })).toBe(true);
  });

  it('l admin MCF vede tutto', async () => {
    const { vedeTuttoIlFornitore } = await import('./portale-auth');
    expect(vedeTuttoIlFornitore({ ...base, ruolo: 'admin' })).toBe(true);
  });
});

// --- Blocco 2: il tentativo vero, con sessione e database ---

const HA_DB = Boolean(process.env.DATABASE_URL_TEST && process.env.BETTER_AUTH_SECRET);

describe.runIf(HA_DB)('accesso incrociato fra due fornitori', () => {
  const SUFFISSO = `t${Date.now()}`;
  const FORN_A = { slug: `alfa-${SUFFISSO}`, org: `orgA-${SUFFISSO}`, nome: 'ALFA SRL' };
  const FORN_B = { slug: `beta-${SUFFISSO}`, org: `orgB-${SUFFISSO}`, nome: 'BETA SRL' };
  const AGENTE_A = { email: `agente.a.${SUFFISSO}@example.invalid`, password: 'pw-di-prova-lunga' };

  let query: typeof import('./db')['query'];
  let richiediSessione: typeof import('./portale-auth')['richiediSessione'];
  let cookieAgenteA = '';
  let userIdA = '';

  beforeAll(async () => {
    // Il pool si costruisce all'import: la variabile va spostata PRIMA.
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    const db = await import('./db');
    query = db.query;
    ({ richiediSessione } = await import('./portale-auth'));
    const { auth } = await import('./auth');

    for (const f of [FORN_A, FORN_B]) {
      await query(
        `INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`,
        [f.org, f.nome, f.slug],
      );
      await query(
        `INSERT INTO app.fornitore (slug, organization_id, nome, prefisso) VALUES ($1,$2,$3,$4)`,
        [f.slug, f.org, f.nome, f.slug.slice(0, 2).toUpperCase()],
      );
    }

    const res = await auth.api.signUpEmail({
      body: { email: AGENTE_A.email, password: AGENTE_A.password, name: 'Agente Alfa' },
      asResponse: true,
    });
    cookieAgenteA = (res.headers.get('set-cookie') ?? '').split(';')[0];
    expect(cookieAgenteA).toBeTruthy();

    const u = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [AGENTE_A.email]);
    userIdA = u[0].id;
    await query(
      `INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt")
       VALUES ($1,$2,$3,'agente', now())`,
      [`mem-${SUFFISSO}`, FORN_A.org, userIdA],
    );
  });

  afterAll(async () => {
    if (!query) return;
    await query(`DELETE FROM app.preventivo WHERE fornitore_slug = ANY($1)`, [[FORN_A.slug, FORN_B.slug]]);
    await query(`DELETE FROM "member" WHERE "userId" = $1`, [userIdA]);
    await query(`DELETE FROM app.fornitore WHERE slug = ANY($1)`, [[FORN_A.slug, FORN_B.slug]]);
    await query(`DELETE FROM "session" WHERE "userId" = $1`, [userIdA]);
    await query(`DELETE FROM "account" WHERE "userId" = $1`, [userIdA]);
    await query(`DELETE FROM "user" WHERE id = $1`, [userIdA]);
    await query(`DELETE FROM "organization" WHERE id = ANY($1)`, [[FORN_A.org, FORN_B.org]]);
  });

  function richiesta(url: string): Request {
    return new Request(url, {
      method: 'GET',
      headers: { cookie: cookieAgenteA, origin: 'http://localhost:4321' },
    });
  }

  it('senza sessione non si entra', async () => {
    const esito = await richiediSessione(new Request('http://localhost:4321/api/x'));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.risposta.status).toBe(401);
  });

  it('con la sua sessione l agente risolve il proprio fornitore', async () => {
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'));
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.contesto.fornitoreSlug).toBe(FORN_A.slug);
      expect(esito.contesto.ruolo).toBe('agente');
    }
  });

  it('indovinare lo slug dell altro fornitore viene rifiutato', async () => {
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'), {
      slugRichiesto: FORN_B.slug,
    });
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.risposta.status).toBe(403);
      expect(await esito.risposta.clone().json()).toMatchObject({ error: 'fornitore_non_tuo' });
    }
  });

  it('il fornitore non si prende MAI dal parametro: resta il proprio', async () => {
    // Anche chiedendo il proprio slug il contesto non cambia, ma soprattutto
    // non esiste un percorso in cui il parametro sostituisca la sessione.
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'), {
      slugRichiesto: FORN_A.slug,
    });
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.contesto.fornitoreSlug).toBe(FORN_A.slug);
  });

  it('i documenti dell altro fornitore restano chiusi', async () => {
    const { percorsoDelFornitore } = await import('./portale-auth');
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(percorsoDelFornitore(esito.contesto, `preventivi/${FORN_B.slug}/X-1/prospetto.pdf`)).toBe(false);
    expect(percorsoDelFornitore(esito.contesto, `preventivi/${FORN_A.slug}/X-1/prospetto.pdf`)).toBe(true);
  });

  it('un agente non ha il permesso di leggere tutta l organizzazione', async () => {
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'), {
      permesso: { preventivo: ['leggi-org'] },
    });
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.risposta.status).toBe(403);
  });

  it('un agente puo creare preventivi', async () => {
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'), {
      permesso: { preventivo: ['crea'] },
    });
    expect(esito.ok).toBe(true);
  });

  it('un agente non puo invitare utenti', async () => {
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'), {
      permesso: { utente: ['invita'] },
    });
    expect(esito.ok).toBe(false);
  });

  it('una richiesta da un altro sito viene fermata prima della sessione', async () => {
    const esito = await richiediSessione(
      new Request('http://localhost:4321/api/x', {
        method: 'POST',
        headers: { cookie: cookieAgenteA, origin: 'https://sito-ostile.example' },
      }),
    );
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.risposta.status).toBe(403);
  });

  it('un utente disattivato non entra piu', async () => {
    await query(`UPDATE "user" SET banned = true WHERE id = $1`, [userIdA]);
    const esito = await richiediSessione(richiesta('http://localhost:4321/api/x'));
    await query(`UPDATE "user" SET banned = false WHERE id = $1`, [userIdA]);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.risposta.status).toBe(403);
  });
});
