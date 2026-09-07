// La coda degli inviti.
//
// L'invio vero e' sostituito da un finto, per due ragioni: non si mandano email
// a persone reali per provare il codice, e soprattutto qui interessa il
// comportamento che nella realta' non si riesce a osservare, cioe' cosa succede
// quando Resend risponde che per oggi ha finito.
//
// Gira sul branch Neon di prova (DATABASE_URL_TEST): senza, si salta.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const HA_DB = Boolean(process.env.DATABASE_URL_TEST && process.env.BETTER_AUTH_SECRET);

// Esito che il finto invio restituira', cambiato test per test
let esitoMail: { ok: boolean; err?: string; ritentabile?: boolean } = { ok: true, id: 'finto' } as any;
const inviate: string[] = [];

vi.mock('./mail-invito', () => ({
  mailInvito: async (opts: { a: string }) => {
    inviate.push(opts.a);
    return esitoMail;
  },
}));

describe.runIf(HA_DB)('coda degli inviti', () => {
  const S = `q${Date.now()}`;
  const ORG = `org-${S}`;
  let query: typeof import('./db')['query'];
  let accodaInvito: typeof import('./inviti')['accodaInvito'];
  let svuotaCoda: typeof import('./inviti')['svuotaCoda'];
  let userId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    ({ query } = await import('./db'));
    ({ accodaInvito, svuotaCoda } = await import('./inviti'));
    const { auth } = await import('./auth');

    await query(`INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1,$2,$3, now())`,
      [ORG, 'Coda SRL', `coda-${S}`]);
    await query(`INSERT INTO app.fornitore (slug, organization_id, nome, prefisso) VALUES ($1,$2,$3,'CD')`,
      [`coda-${S}`, ORG, 'Coda SRL']);
    await auth.api.signUpEmail({
      body: { email: `capo.${S}@example.invalid`, password: 'password-di-prova', name: 'Capo Coda' },
      asResponse: true,
    });
    const u = await query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [`capo.${S}@example.invalid`]);
    userId = u[0].id;
  });

  afterAll(async () => {
    if (!query) return;
    await query(`DELETE FROM app.invito WHERE organization_id = $1`, [ORG]);
    await query(`DELETE FROM "invitation" WHERE "organizationId" = $1`, [ORG]);
    await query(`DELETE FROM app.fornitore WHERE organization_id = $1`, [ORG]);
    await query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
    await query(`DELETE FROM "account" WHERE "userId" = $1`, [userId]);
    await query(`DELETE FROM "user" WHERE id = $1`, [userId]);
    await query(`DELETE FROM "organization" WHERE id = $1`, [ORG]);
  });

  beforeEach(async () => {
    inviate.length = 0;
    esitoMail = { ok: true, id: 'finto' } as any;
    await query(`DELETE FROM app.invito WHERE organization_id = $1`, [ORG]);
    await query(`DELETE FROM "invitation" WHERE "organizationId" = $1`, [ORG]);
  });

  const accoda = (n: number) =>
    Promise.all(
      Array.from({ length: n }, (_, i) =>
        accodaInvito({ organizationId: ORG, email: `a${i}.${S}@example.invalid`, nome: `Agente ${i}`, ruolo: 'agente', creatoDa: userId }),
      ),
    );

  it('accoda e manda, creando l invito su Better Auth', async () => {
    await accoda(3);
    const esito = await svuotaCoda(10);
    expect(esito).toMatchObject({ inviati: 3, rimandati: 0, falliti: 0 });
    expect(inviate).toHaveLength(3);

    const inviti = await query(`SELECT stato, invitation_id, inviato_il FROM app.invito WHERE organization_id = $1`, [ORG]);
    expect(inviti.every((i: any) => i.stato === 'inviato' && i.invitation_id && i.inviato_il)).toBe(true);
    // L'invito su Better Auth nasce all'invio, non all'accodamento
    const su = await query(`SELECT status, "expiresAt" FROM "invitation" WHERE "organizationId" = $1`, [ORG]);
    expect(su).toHaveLength(3);
    expect(su.every((r: any) => r.status === 'pending')).toBe(true);
  });

  it('manda solo lo scaglione richiesto, il resto resta in fila', async () => {
    await accoda(5);
    expect(await svuotaCoda(2)).toMatchObject({ inviati: 2 });
    const rimasti = await query(`SELECT 1 FROM app.invito WHERE organization_id = $1 AND stato = 'da_inviare'`, [ORG]);
    expect(rimasti).toHaveLength(3);
    expect(await svuotaCoda(10)).toMatchObject({ inviati: 3 });
  });

  it('col tetto giornaliero raggiunto si ferma e non brucia gli altri', async () => {
    await accoda(4);
    esitoMail = { ok: false, err: 'resend_429: daily quota exceeded', ritentabile: true };
    const esito = await svuotaCoda(10);

    // Si ferma al primo rifiuto invece di bruciare tutta la coda
    expect(inviate).toHaveLength(1);
    expect(esito.inviati).toBe(0);
    expect(esito.rimandati).toBe(1);

    // Tutti e quattro sono ancora da inviare: nessuno perso
    const inCoda = await query(`SELECT 1 FROM app.invito WHERE organization_id = $1 AND stato = 'da_inviare'`, [ORG]);
    expect(inCoda).toHaveLength(4);
    // E l'invito creato per quello fallito e' stato rimosso: non deve restare
    // un invito valido senza che nessuno ne abbia ricevuto il link
    expect(await query(`SELECT 1 FROM "invitation" WHERE "organizationId" = $1`, [ORG])).toHaveLength(0);

    // Il giro dopo, con la posta di nuovo disponibile, partono tutti
    esitoMail = { ok: true } as any;
    expect(await svuotaCoda(10)).toMatchObject({ inviati: 4 });
  });

  it('un errore definitivo non torna in fila all infinito', async () => {
    await accoda(1);
    esitoMail = { ok: false, err: 'resend_422: invalid recipient', ritentabile: false };
    expect(await svuotaCoda(10)).toMatchObject({ inviati: 0, falliti: 1 });
    const r = await query<{ stato: string }>(`SELECT stato FROM app.invito WHERE organization_id = $1`, [ORG]);
    expect(r[0].stato).toBe('fallito');
    // Un fallito non riparte da solo: lo rimette in coda il referente
    expect(await svuotaCoda(10)).toMatchObject({ inviati: 0, rimandati: 0, falliti: 0 });
  });

  it('due volte la stessa email non fanno due inviti', async () => {
    const uno = await accodaInvito({ organizationId: ORG, email: `bis.${S}@example.invalid`, nome: 'Bis', ruolo: 'agente', creatoDa: userId });
    const due = await accodaInvito({ organizationId: ORG, email: `BIS.${S}@example.invalid`, nome: 'Bis', ruolo: 'agente', creatoDa: userId });
    expect(uno.ok).toBe(true);
    expect(due).toMatchObject({ ok: false, motivo: 'invito_gia_aperto' });
  });

  it('non si invita chi e gia nella rete', async () => {
    const { randomUUID } = await import('node:crypto');
    await query(`INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1,$2,$3,'agente', now())`,
      [randomUUID(), ORG, userId]);
    const r = await accodaInvito({ organizationId: ORG, email: `capo.${S}@example.invalid`, nome: 'Capo', ruolo: 'agente', creatoDa: userId });
    await query(`DELETE FROM "member" WHERE "organizationId" = $1 AND "userId" = $2`, [ORG, userId]);
    expect(r).toMatchObject({ ok: false, motivo: 'gia_membro' });
  });

  it('un indirizzo malformato non entra nemmeno in coda', async () => {
    const r = await accodaInvito({ organizationId: ORG, email: 'non-una-email', nome: 'X', ruolo: 'agente', creatoDa: userId });
    expect(r).toMatchObject({ ok: false, motivo: 'email_non_valida' });
  });
});
