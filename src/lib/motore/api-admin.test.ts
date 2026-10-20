// /api/motore/admin, il Pannello MCF, con sessione, database e Openapi finti.
// Spec mcf_spec-ledoffice-motore_v1, paragrafo 10: canali, societa' fornitrice,
// categorie, checklist, clienti segnalati, pratiche esterne, storico prezzi e la
// vista di MCF su proposte e pratiche. Solo l'admin; Duplex salva come prima.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANALI_LO, CATEGORIE_LO, CHECKLIST_LO, SOCIETA_EMME2 } from './catalogo-ledoffice';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const motore = vi.hoisted(() => ({ sessioneMotore: vi.fn(), catalogo: vi.fn(), spesaDelMese: vi.fn() }));
vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));
vi.mock('../openapi', () => ({ spesaDelMese: motore.spesaDelMese }));
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: motore.sessioneMotore,
}));
vi.mock('./carrozzeria', async (originale) => ({
  ...(await originale<typeof import('./carrozzeria')>()),
  catalogo: motore.catalogo,
}));

import { GET, POST } from '../../pages/api/motore/admin';

type Ruolo = 'admin' | 'referente' | 'agente';
const LOGO = 'brand/emme2-servizi.jpg';

const carrozzeria = (settore: string) => ({
  slug: settore === 'distinta' ? 'led-office' : 'duplex',
  nome: settore === 'distinta' ? 'Led Office' : 'Duplex',
  citta: null, prefisso: 'LO', organizationId: 'org-1', tabellaCanoni: 'pagarent',
  brand: { logo: null, colore: '#1A1A1A', accento: '#D03948' },
  settore, etichettaBene: 'Fornitura', partnerLeasing: 'alba', sogliaLeasing: 0, tettoMeseEuro: 100,
  demo: false, documentiExtra: [], attivo: true, tabellaAlternativa: null,
  regoleSemaforo: settore === 'distinta' ? 'prefiltro' : 'locatore', leasing: false, prezzoVerifica: 5,
  canali: settore === 'distinta' ? CANALI_LO : null,
  societaFornitrice: settore === 'distinta' ? { ...SOCIETA_EMME2, logo: LOGO } : null,
  checklist: settore === 'distinta' ? CHECKLIST_LO : null,
  categorie: settore === 'distinta' ? CATEGORIE_LO : null,
});

const sessione = (ruolo: Ruolo, settore = 'distinta') => ({
  ok: true,
  contesto: { userId: `u-${ruolo}`, email: `${ruolo}@example.it`, nome: ruolo, ruolo, organizationId: 'org-1' },
  carrozzeria: carrozzeria(settore),
  vedeTutto: ruolo !== 'agente',
});

const post = (corpo: Record<string, unknown>) => ({
  request: new Request('https://www.example.it/api/motore/admin', { method: 'POST', body: JSON.stringify({ f: 'led-office', ...corpo }) }),
});
const get = () => ({ request: new Request('https://www.example.it/api/motore/admin?f=led-office') });
const corpo = async (r: Response) => r.json();
const sqlChiamate = () => db.query.mock.calls.map((c) => String(c[0]));
const copia = (v: unknown): any => JSON.parse(JSON.stringify(v));

// Partita IVA inventata, con la cifra di controllo giusta
const PIVA = '12345678903';

beforeEach(() => {
  vi.clearAllMocks();
  db.query.mockResolvedValue([]);
  db.queryUna.mockResolvedValue(null);
  motore.catalogo.mockResolvedValue([]);
  motore.spesaDelMese.mockResolvedValue({ mese: '2026-10', perSorgente: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('solo l\'admin MCF', () => {
  it('referente e agente: 403 su lettura e su ogni azione nuova, senza toccare il database', async () => {
    for (const ruolo of ['referente', 'agente'] as const) {
      motore.sessioneMotore.mockResolvedValueOnce(sessione(ruolo));
      expect((await GET(get())).status).toBe(403);
      for (const azione of ['canali', 'societa', 'categorie', 'checklist', 'segnala', 'togli-segnalazione', 'pratica-esterna']) {
        motore.sessioneMotore.mockResolvedValueOnce(sessione(ruolo));
        expect((await POST(post({ azione, piva: PIVA }))).status, `${ruolo} ${azione}`).toBe(403);
      }
    }
    expect(db.query).not.toHaveBeenCalled();
    expect(db.queryUna).not.toHaveBeenCalled();
  });
});

describe('configurazione: settore e regole', () => {
  const config = (k: Record<string, unknown>) => ({
    azione: 'config',
    config: {
      etichettaBene: 'Fornitura', tabellaCanoni: 'pagarent', partnerLeasing: 'alba', sogliaLeasing: 0, tettoMeseEuro: 100,
      colore: '#1A1A1A', accento: '#D03948', demo: false, documentiExtra: [], tabellaAlternativa: '', leasing: false,
      prezzoVerifica: '5', ...k,
    },
  });
  const parametriCarrozzeria = () => db.query.mock.calls.find((c) => String(c[0]).includes('UPDATE app.carrozzeria SET settore'))![1];

  it('distinta e prefiltro si salvano', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const r = await POST(post(config({ settore: 'distinta', regoleSemaforo: 'prefiltro' })));
    expect(r.status).toBe(200);
    const p = parametriCarrozzeria();
    expect(p[1]).toBe('distinta');
    expect(p[9]).toBe('prefiltro');
  });
  it('un settore che non si riconosce non abbassa quello salvato: la colonna resta com\'e\'', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    await POST(post(config({ settore: 'xyz', regoleSemaforo: 'xyz' })));
    const [sql, p] = db.query.mock.calls.find((c) => String(c[0]).includes('UPDATE app.carrozzeria SET settore'))!;
    expect(String(sql)).toContain('settore = COALESCE($2, settore)');
    expect(p[1]).toBeNull();
    expect(p[9]).toBe('prefiltro');
  });
  it('listino affiancato: vuoto lo toglie, uno sconosciuto lascia quello salvato', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
    await POST(post(config({ settore: 'macchine', regoleSemaforo: 'locatore', tabellaAlternativa: '' })));
    expect(parametriCarrozzeria()[8]).toBeNull();
    vi.clearAllMocks();
    db.query.mockResolvedValue([]);
    const conGrace = { ...sessione('admin', 'macchine') };
    conGrace.carrozzeria = { ...conGrace.carrozzeria, tabellaAlternativa: 'grace-duplex' } as any;
    motore.sessioneMotore.mockResolvedValueOnce(conGrace);
    await POST(post(config({ settore: 'macchine', regoleSemaforo: 'locatore', tabellaAlternativa: 'grace-2027' })));
    expect(parametriCarrozzeria()[8]).toBe('grace-duplex');
  });
  it('prezzo per richiesta oltre 1.000 euro, negativo o illeggibile: 400 col messaggio, niente salvato', async () => {
    for (const prezzoVerifica of ['2000', '-1', 'cinque']) {
      motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
      const r = await POST(post(config({ settore: 'macchine', regoleSemaforo: 'locatore', prezzoVerifica })));
      expect(r.status, prezzoVerifica).toBe(400);
      expect((await corpo(r)).messaggio).toMatch(/Prezzo per richiesta/);
    }
    expect(db.query).not.toHaveBeenCalled();
  });
  it('prezzo per richiesta vuoto: non si fattura (null), come prima', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
    expect((await POST(post(config({ settore: 'macchine', regoleSemaforo: 'locatore', prezzoVerifica: '' })))).status).toBe(200);
    expect(parametriCarrozzeria()[11]).toBeNull();
  });
  it('Duplex salva come prima: macchine, criteri del locatore, Grace affiancata', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
    await POST(post(config({ settore: 'macchine', regoleSemaforo: 'locatore', tabellaAlternativa: 'grace-duplex', tabellaCanoni: 'sputnik-duplex' })));
    const p = parametriCarrozzeria();
    expect(p).toEqual(['duplex', 'macchine', 'Fornitura', 'alba', 0, 100, false, '[]', 'grace-duplex', 'locatore', false, 5]);
    expect(sqlChiamate().filter((s) => /canali|cliente_segnalato|catalogo_storico/.test(s))).toEqual([]);
  });
});

describe('canali', () => {
  it('validi: si salvano come li legge il motore', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const inviati = copia(CANALI_LO);
    inviati[2].attivo = false;
    const r = await POST(post({ azione: 'canali', canali: inviati }));
    expect(r.status).toBe(200);
    const [sql, p] = db.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE app\.carrozzeria SET canali = \$2/);
    expect(JSON.parse(p[1])[2]).toEqual({ ...CANALI_LO[2], attivo: false });
  });
  it('un canale che il lettore scarterebbe: 400 col nome del canale e del campo, niente salvato', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const inviati = copia(CANALI_LO);
    inviati[1].settoriEsclusi = ['6a'];
    const r = await POST(post({ azione: 'canali', canali: inviati }));
    expect(r.status).toBe(400);
    const c = await corpo(r);
    expect(c.error).toBe('config_non_valida');
    expect(c.messaggio).toMatch(/Grenke, settori esclusi/);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('un listino che non esiste: 400', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const inviati = copia(CANALI_LO);
    inviati[2].tabella = 'nessuna';
    expect((await POST(post({ azione: 'canali', canali: inviati }))).status).toBe(400);
  });
  it('fuori dal settore distinta le azioni nuove non scrivono', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
    const r = await POST(post({ azione: 'canali', canali: copia(CANALI_LO) }));
    expect(r.status).toBe(400);
    expect((await corpo(r)).error).toBe('solo_distinta');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('societa\', categorie e checklist', () => {
  it('societa\': il logo resta quello salvato, qualunque cosa arrivi', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const r = await POST(post({ azione: 'societa', societa: { ...SOCIETA_EMME2, telefono: '0823 000000', logo: 'pratiche/altro.pdf' } }));
    expect(r.status).toBe(200);
    const salvata = JSON.parse(db.query.mock.calls[0][1][1]);
    expect(salvata).toEqual({ ...SOCIETA_EMME2, telefono: '0823 000000', logo: LOGO });
  });
  it('checklist con una voce scritta male: 400 col nome della voce, niente salvato', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const c = copia(CHECKLIST_LO);
    c.voci[2].obbligatoria = 'no';
    const r = await POST(post({ azione: 'checklist', checklist: c }));
    expect(r.status).toBe(400);
    expect((await corpo(r)).messaggio).toMatch(/Visura camerale/);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('checklist valida: salvata', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    expect((await POST(post({ azione: 'checklist', checklist: copia(CHECKLIST_LO) }))).status).toBe(200);
    expect(JSON.parse(db.query.mock.calls[0][1][1])).toEqual(CHECKLIST_LO);
  });
  it('categorie: togliere una categoria usata da voci accese e\' rifiutato', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    motore.catalogo.mockResolvedValueOnce([{ codice: 'LO-SRV-1', attivo: true, attributi: { categoria: 'Server e stampa' } }]);
    const r = await POST(post({ azione: 'categorie', categorie: copia(CATEGORIE_LO).filter((c: any) => c.nome !== 'Server e stampa') }));
    expect(r.status).toBe(400);
    expect((await corpo(r)).messaggio).toMatch(/Server e stampa/);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('clienti segnalati', () => {
  it('segnala: inserisce o aggiorna per partita IVA, con chi l\'ha fatto', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const r = await POST(post({ azione: 'segnala', piva: PIVA, ragioneSociale: 'Prova SRL', motivo: 'insoluto', effetto: 'blocco', nota: 'prova' }));
    expect(r.status).toBe(200);
    const [sql, p] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO app\.cliente_segnalato[\s\S]*ON CONFLICT \(piva\) DO UPDATE/);
    expect(p).toEqual([PIVA, 'Prova SRL', 'insoluto', 'blocco', 'prova', 'admin@example.it']);
  });
  it('segnala con un effetto non ammesso: 400', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const r = await POST(post({ azione: 'segnala', piva: PIVA, motivo: 'insoluto', effetto: 'giallo' }));
    expect(r.status).toBe(400);
    expect((await corpo(r)).messaggio).toMatch(/Effetto/);
  });
  it('togli: cancella la riga e lo scrive nel log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    db.query.mockResolvedValueOnce([{ piva: PIVA }]);
    const r = await POST(post({ azione: 'togli-segnalazione', piva: PIVA }));
    expect(r.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM app\.cliente_segnalato WHERE piva = \$1/);
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toContainEqual({ evento: 'motore_segnalato_tolto', piva: PIVA, userId: 'u-admin' });
  });
  it('togli una partita IVA che non c\'e\': 404', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    db.query.mockResolvedValueOnce([]);
    expect((await POST(post({ azione: 'togli-segnalazione', piva: PIVA }))).status).toBe(404);
  });
});

describe('pratiche esterne', () => {
  it('si aggiungono sul fornitore della sessione', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const r = await POST(post({ azione: 'pratica-esterna', piva: PIVA, ragioneSociale: 'Prova SRL', canale: 'pagarent', data: '15/09/2026', esito: 'approvata', importo: '12.500' }));
    expect(r.status).toBe(200);
    const [sql, p] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO app\.pratica_esterna \(piva, ragione_sociale, fornitore_slug, canale, data, esito, importo, fonte\)/);
    expect(p).toEqual([PIVA, 'Prova SRL', 'led-office', 'pagarent', '2026-09-15', 'approvata', 12500, 'Pannello MCF']);
  });
  it('dal pannello non si cancellano', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const r = await POST(post({ azione: 'togli-pratica-esterna', id: 1 }));
    expect((await corpo(r)).error).toBe('azione_sconosciuta');
    expect(sqlChiamate().some((s) => /DELETE/.test(s))).toBe(false);
  });
});

describe('catalogo e storico prezzi', () => {
  it('import sul settore distinta: storico quando cambia, righe senza categoria nota scartate', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    // Ultima riga di storico: la prima voce non ne ha, la seconda ha gia' lo stesso prezzo
    db.queryUna.mockResolvedValueOnce(null).mockResolvedValueOnce({ prezzo: '450.00', valido_fino: '2026-12-31' });
    const righe = [
      { codice: 'LO-SRV-9', nome: 'Server', prezzo: '1900', categoria: 'Server e stampa', valido_fino: '31/12/2026' },
      { codice: 'LO-PER-9', nome: 'Tablet', prezzo: '450', categoria: 'Periferiche e tablet', valido_fino: '31/12/2026' },
      { codice: 'LO-X-9', nome: 'Cosa', prezzo: '10', categoria: 'Inventata' },
      { codice: 'LO-X-10', nome: 'Senza', prezzo: '10' },
    ];
    const r = await POST(post({ azione: 'importa', righe }));
    const c = await corpo(r);
    expect(c).toMatchObject({ ok: true, salvate: 2, scartate: [], senzaCategoria: [3, 4] });
    const storico = db.query.mock.calls.filter((x) => String(x[0]).includes('INSERT INTO app.catalogo_storico'));
    expect(storico.map((x) => x[1])).toEqual([['led-office', 'LO-SRV-9', 1900, '2026-12-31', 'admin@example.it']]);
  });
  it('import con kWp ambiguo: riga scartata col motivo, le altre salvate', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'fotovoltaico'));
    const righe = [
      { codice: 'PV-6', nome: 'Impianto 6 kWp', prezzo: '9.800', kwp: '6.375' },
      { codice: 'PV-7', nome: 'Impianto 7 kWp', prezzo: '10.900', kwp: '7,2' },
    ];
    const c = await corpo(await POST(post({ azione: 'importa', righe })));
    expect(c).toMatchObject({ ok: true, salvate: 1, scartate: [], ambigue: [{ riga: 1, motivo: 'kWp/kWh ambiguo: scrivi 6,375 o 6375' }] });
  });
  it('voce singola con kWp ambiguo: 400 col messaggio', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'fotovoltaico'));
    const r = await POST(post({ azione: 'voce', voce: { codice: 'PV-6', nome: 'Impianto', prezzo: '9800', kwp: '6.375' } }));
    expect(r.status).toBe(400);
    expect((await corpo(r)).messaggio).toBe('kWp/kWh ambiguo: scrivi 6,375 o 6375');
  });
  it('reimport senza la colonna validita\': la validita\' salvata resta, e lo storico solo se qualcosa cambia', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    // Ultimo storico: stesso prezzo e stessa validita' di quella che il database tiene
    db.queryUna.mockResolvedValueOnce({ prezzo: '1900.00', valido_fino: '2026-12-31' });
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('INSERT INTO app.catalogo_voce') ? [{ valido_fino: '2026-12-31' }] : []);
    const c = await corpo(await POST(post({ azione: 'importa', righe: [{ codice: 'LO-SRV-9', nome: 'Server', prezzo: '1900', categoria: 'Server e stampa' }] })));
    expect(c.salvate).toBe(1);
    const [sql, p] = db.query.mock.calls.find((x) => String(x[0]).includes('INSERT INTO app.catalogo_voce'))!;
    expect(String(sql)).toMatch(/CASE WHEN \$7::boolean THEN EXCLUDED\.attributi/);
    expect(String(sql)).toContain("app.catalogo_voce.attributi->'valido_fino'");
    expect(p[6]).toBe(false);
    expect(sqlChiamate().some((x) => x.includes('INSERT INTO app.catalogo_storico'))).toBe(false);
  });
  it('reimport con la colonna validita\' vuota: la validita\' si toglie e lo storico lo registra', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    db.queryUna.mockResolvedValueOnce({ prezzo: '1900.00', valido_fino: '2026-12-31' });
    db.query.mockImplementation(async (sql: string) =>
      sql.includes('INSERT INTO app.catalogo_voce') ? [{ valido_fino: null }] : []);
    await POST(post({ azione: 'importa', righe: [{ codice: 'LO-SRV-9', nome: 'Server', prezzo: '1900', categoria: 'Server e stampa', valido_fino: '' }] }));
    const [, p] = db.query.mock.calls.find((x) => String(x[0]).includes('INSERT INTO app.catalogo_voce'))!;
    expect(p[6]).toBe(true);
    const storico = db.query.mock.calls.filter((x) => String(x[0]).includes('INSERT INTO app.catalogo_storico'));
    expect(storico.map((x) => x[1])).toEqual([['led-office', 'LO-SRV-9', 1900, null, 'admin@example.it']]);
  });
  it('import su Duplex: nessuno storico, nessun controllo di categoria', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
    const r = await POST(post({ azione: 'importa', righe: [{ codice: 'D-1', nome: 'Duplex 340', prezzo: '1931', famiglia: 'Duplex 340' }] }));
    expect((await corpo(r)).salvate).toBe(1);
    expect(sqlChiamate().some((s) => s.includes('catalogo_storico'))).toBe(false);
    expect(db.queryUna).not.toHaveBeenCalled();
  });
});

describe('lettura del pannello', () => {
  const RISERVATO = {
    canale: 'pagarent', beni: 137750, maggiorazione: 6888, imponibile: 144638,
    documenti: [{ nome: 'Proposta per il locatore', pathname: 'preventivi/led-office/LO-1/mcf/proposta-locatore-LO-1.pdf' }],
  };
  beforeEach(() => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM app.cliente_segnalato')) return [{ piva: PIVA, ragione_sociale: 'Prova SRL', motivo: 'insoluto', effetto: 'blocco', nota: 'n', creato: '2026-10-20T10:00:00Z', da_utente: 'x' }];
      if (sql.includes('FROM app.pratica_esterna')) return [{ id: '1', piva: PIVA, ragione_sociale: 'Prova SRL', canale: 'pagarent', data: '2026-09-15', esito: 'approvata', importo: '12500.00', fonte: 'seed' }];
      if (sql.includes('FROM app.proposta')) return [{ id: 'LO-1', creato: '2026-10-20T10:00:00Z', cliente_nome: 'Cliente', piva: PIVA, prezzo: '137750.00', canale: 'pagarent', riservato: RISERVATO }];
      if (sql.includes('FROM app.pratica ')) return [];
      if (sql.includes('FROM app.catalogo_storico')) return [{ codice: 'LO-SRV-1', prezzo: '1900.00', valido_fino: '2026-12-31', registrato: '2026-10-20T10:00:00Z', da_utente: 'seed' }];
      return [];
    });
  });

  it('sul settore distinta: configurazione, avviso Pioneer, segnalati, pratiche esterne, storico e la vista MCF delle proposte', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin'));
    const c = await corpo(await GET(get()));
    expect(c.canali).toEqual(CANALI_LO);
    expect(c.societaFornitrice.logo).toBe(LOGO);
    expect(c.categorie).toEqual(CATEGORIE_LO);
    expect(c.checklist).toEqual(CHECKLIST_LO);
    expect(c.pioneerLetto).toBeNull();
    expect(c.avvisiCanale.grenke).toBe('Data di lettura della tabella Pioneer mancante: Grenke resta spento');
    expect(c.segnalati[0]).toMatchObject({ piva: PIVA, motivo: 'insoluto', effetto: 'blocco', nota: 'n' });
    expect(c.praticheEsterne[0]).toMatchObject({ piva: PIVA, canale: 'pagarent', data: '2026-09-15', importo: 12500 });
    expect(c.storico['LO-SRV-1'][0]).toMatchObject({ prezzo: 1900, validoFino: '2026-12-31' });
    expect(c.proposte[0]).toMatchObject({ id: 'LO-1', canale: 'pagarent', riservato: RISERVATO });
    expect(c.opzioni.regole.map((o: any) => o.valore)).toContain('prefiltro');
    const sqlProposte = sqlChiamate().find((s) => s.includes('FROM app.proposta'))!;
    expect(sqlProposte).toMatch(/WHERE fornitore_slug = \$1[\s\S]*ORDER BY creato DESC LIMIT 50/);
  });
  it('su Duplex niente di nuovo dal database', async () => {
    motore.sessioneMotore.mockResolvedValueOnce(sessione('admin', 'macchine'));
    const c = await corpo(await GET(get()));
    expect(c.ok).toBe(true);
    expect(c.segnalati).toEqual([]);
    expect(c.proposte).toEqual([]);
    expect(sqlChiamate().some((s) => /cliente_segnalato|pratica_esterna|catalogo_storico|app\.proposta/.test(s))).toBe(false);
  });
});
