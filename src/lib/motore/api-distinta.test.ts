// Le due API toccate dalla proposta di distinta, provate con sessione, database e Blob
// finti: /api/motore/preventivo sul settore distinta non passa mai da calcolaProposta,
// e /api/motore/doc consegna la cartella riservata solo all'admin MCF, cercandola nel
// `riservato` e non nei `documenti`. Spec mcf_spec-ledoffice-motore_v1, paragrafo 8.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const blob = vi.hoisted(() => ({ get: vi.fn() }));
const motore = vi.hoisted(() => ({
  sessioneMotore: vi.fn(),
  calcolaDistinta: vi.fn(),
  calcolaProposta: vi.fn(),
  generaPreventivoDistinta: vi.fn(),
  generaPreventivoMotore: vi.fn(),
}));
vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
vi.mock('@vercel/blob', () => ({ get: blob.get, put: vi.fn() }));
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: motore.sessioneMotore,
}));
vi.mock('./calcolo-distinta', () => ({ calcolaDistinta: motore.calcolaDistinta }));
vi.mock('./calcolo-proposta', () => ({ calcolaProposta: motore.calcolaProposta }));
vi.mock('./preventivo-distinta', () => ({ generaPreventivoDistinta: motore.generaPreventivoDistinta }));
vi.mock('./preventivo', () => ({ generaPreventivoMotore: motore.generaPreventivoMotore }));

import { GET as scaricaDoc } from '../../pages/api/motore/doc';
import { POST as creaPreventivo } from '../../pages/api/motore/preventivo';

type Ruolo = 'admin' | 'referente' | 'agente';
const sessione = (ruolo: Ruolo, settore = 'distinta') => ({
  ok: true,
  contesto: { userId: `u-${ruolo}`, email: `${ruolo}@example.it`, nome: ruolo, ruolo, organizationId: 'org-lo' },
  carrozzeria: { slug: 'led-office', settore, prefisso: 'LO' },
  vedeTutto: ruolo !== 'agente',
});

const RISERVATO_PATH = 'preventivi/led-office/LO-20261020-101500/mcf/proposta-locatore-LO-20261020-101500.pdf';
const CLIENTE_PATH = 'preventivi/led-office/LO-20261020-101500/preventivo-canone-LO-20261020-101500.pdf';

const richiestaDoc = (path: string) =>
  ({ request: new Request(`https://www.example.it/api/motore/doc?f=led-office&path=${encodeURIComponent(path)}`) });

beforeEach(() => {
  vi.clearAllMocks();
  db.env.mockImplementation((nome: string) => (nome === 'BLOB_READ_WRITE_TOKEN' ? 'tok-finto' : undefined));
  blob.get.mockResolvedValue({ stream: new Blob(['%PDF-1.3']).stream(), blob: { contentType: 'application/pdf' } });
});

describe('/api/motore/doc e la cartella riservata', () => {
  it('agente e referente: la proposta per il locatore mai, nemmeno col percorso indovinato', async () => {
    for (const ruolo of ['agente', 'referente'] as const) {
      motore.sessioneMotore.mockResolvedValueOnce(sessione(ruolo));
      // Anche se il database dicesse di si', non lo si interroga nemmeno
      db.queryUna.mockResolvedValue({ '?column?': 1 });
      const r = await scaricaDoc(richiestaDoc(RISERVATO_PATH));
      expect(r.status).toBe(403);
    }
    expect(db.queryUna).not.toHaveBeenCalled();
    expect(blob.get).not.toHaveBeenCalled();
  });

  it('admin: la cerca nel riservato di proposte e pratiche, non nei documenti', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    db.queryUna.mockResolvedValueOnce({ '?column?': 1 });
    const r = await scaricaDoc(richiestaDoc(RISERVATO_PATH));
    expect(r.status).toBe(200);
    const [sql, valori] = db.queryUna.mock.calls[0];
    expect(sql).toContain("x.riservato->'documenti' @> $1::jsonb");
    expect(sql).not.toContain('x.documenti @>');
    expect(sql).toMatch(/app\.proposta[\s\S]*app\.pratica/);
    expect(valori).toEqual([JSON.stringify([{ pathname: RISERVATO_PATH }]), 'org-lo']);
    expect(blob.get).toHaveBeenCalledWith(RISERVATO_PATH, { access: 'private', token: 'tok-finto' });
  });

  it('admin: un percorso riservato che nessuna proposta dichiara non esce', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    db.queryUna.mockResolvedValueOnce(null);
    expect((await scaricaDoc(richiestaDoc(RISERVATO_PATH))).status).toBe(403);
    expect(blob.get).not.toHaveBeenCalled();
  });

  it('i PDF del commerciale passano dai documenti, filtrati per l\'agente', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('agente'));
    db.queryUna.mockResolvedValueOnce({ '?column?': 1 });
    const r = await scaricaDoc(richiestaDoc(CLIENTE_PATH));
    expect(r.status).toBe(200);
    const [sql, valori] = db.queryUna.mock.calls[0];
    expect(sql).toContain('x.documenti @> $1::jsonb');
    expect(sql).not.toContain('riservato');
    expect(valori).toEqual([JSON.stringify([{ pathname: CLIENTE_PATH }]), 'org-lo', 'u-agente']);
  });

  it('fuori dalla cartella del fornitore: nessuno, nemmeno l\'admin', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    expect((await scaricaDoc(richiestaDoc('preventivi/duplex/x/mcf/a.pdf'))).status).toBe(403);
    expect(db.queryUna).not.toHaveBeenCalled();
  });
});

describe('/api/motore/preventivo sul settore distinta', () => {
  const post = (corpo: Record<string, unknown>) =>
    creaPreventivo({ request: new Request('https://www.example.it/api/motore/preventivo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    }) });

  it('un corpo col `codice` del listino non arriva mai a calcolaProposta', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('agente'));
    motore.calcolaDistinta.mockResolvedValueOnce({
      ok: false, risposta: new Response(JSON.stringify({ ok: false, error: 'righe_mancanti' }), { status: 400 }),
    });
    const r = await post({ f: 'led-office', ricercaId: 'r-1', codice: 'TAB-S10', prezzo: 1 });
    expect(r.status).toBe(400);
    expect(motore.calcolaProposta).not.toHaveBeenCalled();
    expect(motore.generaPreventivoMotore).not.toHaveBeenCalled();
    expect(motore.generaPreventivoDistinta).not.toHaveBeenCalled();
  });

  it('distinta valida: risponde l\'esito del preventivo di distinta', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('agente'));
    const calcolo = { finto: true };
    motore.calcolaDistinta.mockResolvedValueOnce({ ok: true, calcolo });
    const esito = { ok: true, id: 'LO-1', pdfPronti: true, documenti: [{ nome: 'a.pdf', pathname: 'preventivi/led-office/LO-1/a.pdf' }] };
    motore.generaPreventivoDistinta.mockResolvedValueOnce(esito);
    const r = await post({ f: 'led-office', ricercaId: 'r-1', righe: [] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(esito);
    expect(motore.generaPreventivoDistinta.mock.calls[0][1]).toBe(calcolo);
    expect(motore.calcolaProposta).not.toHaveBeenCalled();
  });

  it('proposta bloccata: 400 proposta_bloccata', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('agente'));
    motore.calcolaDistinta.mockResolvedValueOnce({ ok: true, calcolo: {} });
    motore.generaPreventivoDistinta.mockResolvedValueOnce({ ok: false, error: 'proposta_bloccata' });
    const r = await post({ f: 'led-office', ricercaId: 'r-1', righe: [] });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: 'proposta_bloccata' });
  });

  it('gli altri settori restano su calcolaProposta', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('agente', 'macchine'));
    motore.calcolaProposta.mockResolvedValueOnce({ ok: true, calcolo: {} });
    motore.generaPreventivoMotore.mockResolvedValueOnce({ ok: true, id: 'DX-1' });
    const r = await post({ f: 'duplex', ricercaId: 'r-1', codice: 'X' });
    expect(r.status).toBe(200);
    expect(motore.calcolaDistinta).not.toHaveBeenCalled();
  });
});
