// Le quattro API del portale Green-Go (/api/portale-doc, -simulazione, -preventivo,
// -preventivi) rifiutano ogni sessione il cui fornitore sta sul motore dei portali,
// cioe' ha una riga in app.carrozzeria. Senza questo rifiuto un agente o un referente
// di Led Office, da quelle API, quotava il listino nudo saltando prefiltro e
// maggiorazione e scaricava la proposta per il locatore indovinandone il percorso.
//
// Sessione, database e Blob sono finti. La guardia e' quella vera: si finge solo la
// sua lettura del database, che dice "led-office e' sul motore, green-go no".

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const blob = vi.hoisted(() => ({ get: vi.fn() }));
const sessione = vi.hoisted(() => ({ richiediSessione: vi.fn() }));
const nominali = vi.hoisted(() => ({ generaPreventivo: vi.fn() }));

vi.mock('./db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
vi.mock('@vercel/blob', () => ({ get: blob.get, put: vi.fn(), BlobNotFoundError: class extends Error {} }));
// Better Auth non parte: della guardia di sessione si finge solo richiediSessione
vi.mock('./auth', async () => ({ auth: {}, RUOLI_ORG: (await import('./ruoli-portale')).RUOLI_ORG }));
vi.mock('./portale-auth', async (originale) => ({
  ...(await originale<typeof import('./portale-auth')>()),
  richiediSessione: sessione.richiediSessione,
}));
vi.mock('./preventivi-nominali', () => ({ generaPreventivo: nominali.generaPreventivo }));

import type { Contesto } from './portale-auth';
import { GET as scaricaDoc } from '../pages/api/portale-doc';
import { POST as simula } from '../pages/api/portale-simulazione';
import { POST as creaPreventivo } from '../pages/api/portale-preventivo';
import { GET as leggiStorico } from '../pages/api/portale-preventivi';

type Ruolo = Contesto['ruolo'];

const contesto = (slug: string, ruolo: Ruolo, prefisso: string): Contesto => ({
  userId: `u-${slug}-${ruolo}`, email: `${ruolo}@example.it`, nome: ruolo, ruolo,
  organizationId: `org-${slug}`, fornitoreSlug: slug, fornitoreNome: slug, fornitoreCitta: null,
  tabellaCanoni: null, prefisso, brandLogo: null, brandColore: null, brandAccento: null,
});

const ledOffice = (ruolo: Ruolo) => contesto('led-office', ruolo, 'LO');
const greenGo = (ruolo: Ruolo) => contesto('green-go', ruolo, 'GG');

/** Il percorso della proposta per il locatore, come lo si indovinerebbe dall'id */
const LOCATORE = 'preventivi/led-office/LO-20261020-101500/mcf/proposta-locatore-LO-20261020-101500.pdf';
const PROSPETTO_GG = 'preventivi/green-go/GG-20261020-101500/prospetto-noleggio.pdf';

const URL_BASE = 'https://www.mediocreditofacile.it';
const post = (rotta: string, corpo: unknown) =>
  ({ request: new Request(`${URL_BASE}${rotta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }) });
const get = (rotta: string) => ({ request: new Request(`${URL_BASE}${rotta}`) });

/** Le quattro API, ognuna con una richiesta che per Green-Go andrebbe a buon fine */
const API: { nome: string; chiama: (slug: string) => Promise<Response> }[] = [
  {
    nome: '/api/portale-doc',
    chiama: (slug) => scaricaDoc(get(`/api/portale-doc?path=${encodeURIComponent(slug === 'led-office' ? LOCATORE : PROSPETTO_GG)}`)),
  },
  { nome: '/api/portale-simulazione', chiama: () => simula(post('/api/portale-simulazione', { importo: 10_000 })) },
  { nome: '/api/portale-preventivo', chiama: () => creaPreventivo(post('/api/portale-preventivo', { input: { cliente: 'Prova' } })) },
  { nome: '/api/portale-preventivi', chiama: () => leggiStorico(get('/api/portale-preventivi')) },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.env.mockImplementation((nome: string) => (nome === 'BLOB_READ_WRITE_TOKEN' ? 'tok-finto' : undefined));
  // La sola lettura della guardia: led-office ha una carrozzeria, green-go no
  db.queryUna.mockImplementation(async (sql: string, valori: unknown[]) =>
    String(sql).includes('app.carrozzeria') && valori[0] === 'led-office' ? { si: 1 } : null);
  db.query.mockResolvedValue([]);
  blob.get.mockResolvedValue({
    statusCode: 200, stream: new Blob(['%PDF-1.3']).stream(), blob: { contentType: 'application/pdf', etag: '"e1"' },
  });
  nominali.generaPreventivo.mockResolvedValue({ ok: true, id: 'GG-1' });
});

describe('le API del portale Green-Go e i fornitori sul motore', () => {
  for (const api of API) {
    it(`${api.nome}: referente e agente di Led Office ricevono 403 portale_del_motore, niente si legge`, async () => {
      for (const ruolo of ['referente', 'agente'] as const) {
        sessione.richiediSessione.mockResolvedValueOnce({ ok: true, contesto: ledOffice(ruolo) });
        const r = await api.chiama('led-office');
        expect(r.status).toBe(403);
        expect(await r.json()).toEqual({ ok: false, error: 'portale_del_motore' });
      }
      // La guardia ha chiesto della carrozzeria e basta: niente documento, niente storico, niente preventivo
      expect(db.queryUna).toHaveBeenCalledTimes(2);
      for (const [sql, valori] of db.queryUna.mock.calls) {
        expect(sql).toMatch(/FROM app\.carrozzeria/);
        expect(valori).toEqual(['led-office']);
      }
      expect(blob.get).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
      expect(nominali.generaPreventivo).not.toHaveBeenCalled();
    });

    it(`${api.nome}: una sessione Green-Go passa come prima`, async () => {
      sessione.richiediSessione.mockResolvedValueOnce({ ok: true, contesto: greenGo('agente') });
      const r = await api.chiama('green-go');
      expect(r.status).toBe(200);
      expect(db.queryUna).toHaveBeenCalledWith(expect.stringContaining('app.carrozzeria'), ['green-go']);
    });
  }

  it('Green-Go: il documento, lo storico e il preventivo arrivano davvero a destinazione', async () => {
    sessione.richiediSessione.mockResolvedValue({ ok: true, contesto: greenGo('referente') });
    await API[0].chiama('green-go');
    expect(blob.get).toHaveBeenCalledWith(PROSPETTO_GG, expect.objectContaining({ access: 'private' }));
    await API[2].chiama('green-go');
    expect(nominali.generaPreventivo).toHaveBeenCalledTimes(1);
    await API[3].chiama('green-go');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM app.preventivo'), ['org-green-go']);
  });

  it('il simulatore di Green-Go risponde coi canoni, come prima', async () => {
    sessione.richiediSessione.mockResolvedValueOnce({ ok: true, contesto: greenGo('agente') });
    const r = await API[1].chiama('green-go');
    const corpo = await r.json();
    expect(corpo).toMatchObject({ ok: true, verso: 'da-prezzo', importo: 10_000 });
    expect(Object.keys(corpo.canoni).length).toBeGreaterThan(0);
  });

  it('admin MCF senza fornitore indicato: nessuna carrozzeria da cercare, passa come prima', async () => {
    sessione.richiediSessione.mockResolvedValueOnce({
      ok: true, contesto: { ...greenGo('admin'), organizationId: null, fornitoreSlug: null, prefisso: null },
    });
    const r = await API[3].chiama('green-go');
    expect(r.status).toBe(200);
    expect(db.queryUna).not.toHaveBeenCalled();
  });

  it('il database non risponde: si rifiuta, la porta non resta aperta', async () => {
    db.queryUna.mockRejectedValueOnce(new Error('neon giu'));
    sessione.richiediSessione.mockResolvedValueOnce({ ok: true, contesto: ledOffice('agente') });
    const errore = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await API[0].chiama('led-office');
    expect(r.status).toBe(503);
    expect(blob.get).not.toHaveBeenCalled();
    errore.mockRestore();
  });

  it('la sessione rifiutata resta rifiutata, senza chiedere della carrozzeria', async () => {
    sessione.richiediSessione.mockResolvedValueOnce({
      ok: false, risposta: new Response(JSON.stringify({ ok: false, error: 'sessione_assente' }), { status: 401 }),
    });
    const r = await API[0].chiama('led-office');
    expect(r.status).toBe(401);
    expect(db.queryUna).not.toHaveBeenCalled();
  });
});
