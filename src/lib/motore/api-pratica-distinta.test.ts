// /api/motore/pratica sul settore distinta (Led Office), /api/motore/upload e lo storico,
// con sessione, database, Blob, registro delle verifiche e mail finti. Spec
// mcf_spec-ledoffice-motore_v1, paragrafi 5 e 9.
//
// Il punto: sul settore distinta tutta la richiesta passa da creaPraticaDistinta, che
// rilegge importo, righe e canale dalla proposta salvata, ricalcola il prefiltro coi
// segnali e gli eventi aggiornati (un rosso arrivato dopo il preventivo diventa una
// segnalazione) e non crede al browser ne' sulla forma ne' sul "nessun canale". Gli
// altri settori restano sul percorso di sempre. Al commerciale non esce mai niente di
// riservato; le liste non leggono dati, canale e riservato della pratica.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const blob = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
const caricamento = vi.hoisted(() => ({ handleUpload: vi.fn() }));
const posta = vi.hoisted(() => ({ inviaMail: vi.fn() }));
const motore = vi.hoisted(() => ({ sessioneMotore: vi.fn() }));
const segn = vi.hoisted(() => ({ segnaliPrefiltro: vi.fn(), salvaSegnali: vi.fn() }));
const oa = vi.hoisted(() => ({
  leggiVerifica: vi.fn(), avviaNegativita: vi.fn(), entroIlTetto: vi.fn(), scriviVerifica: vi.fn(), esitoNegativita: vi.fn(),
}));

vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
vi.mock('@vercel/blob', () => ({ get: blob.get, put: blob.put }));
vi.mock('@vercel/blob/client', () => ({ handleUpload: caricamento.handleUpload }));
vi.mock('../auth', () => ({ BASE_URL: 'https://www.example.it' }));
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));
vi.mock('./sessione', async (originale) => ({
  ...(await originale<typeof import('./sessione')>()),
  sessioneMotore: motore.sessioneMotore,
}));
vi.mock('./segnali-prefiltro', async (originale) => ({
  ...(await originale<typeof import('./segnali-prefiltro')>()),
  segnaliPrefiltro: segn.segnaliPrefiltro,
  salvaSegnali: segn.salvaSegnali,
}));
vi.mock('../openapi', async (originale) => ({
  ...(await originale<typeof import('../openapi')>()),
  leggiVerifica: oa.leggiVerifica,
  avviaNegativita: oa.avviaNegativita,
  entroIlTetto: oa.entroIlTetto,
  scriviVerifica: oa.scriviVerifica,
  esitoNegativita: oa.esitoNegativita,
}));
vi.mock('../mail-portale', async (originale) => ({
  ...(await originale<typeof import('../mail-portale')>()),
  inviaMail: posta.inviaMail,
}));

import { DESTINATARIO_MCF } from '../mail-portale';
import { POST as inviaPratica } from '../../pages/api/motore/pratica';
import { GET as leggiStorico } from '../../pages/api/motore/storico';
import { POST as chiediUpload } from '../../pages/api/motore/upload';
import { CANALI_LO, CATEGORIE_LO, CHECKLIST_LO, vociLedOffice } from './catalogo-ledoffice';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { creaPraticaDistinta } from './pratica-distinta';
import { TIPI_ZIP, VOCE_ZIP } from './pratica-distinta-regole';
import { TESTI_PREFILTRO } from './prefiltro';

const OGGI = new Date(2026, 9, 20, 12);
const PIVA = '01234567890';
const PROPOSTA_FIRMATA = 'Proposta di vendita firmata e timbrata dal cliente';
const IDENTITA = "Documento d'identità e tessera sanitaria del legale rappresentante, fronte e retro in un unico PDF";
const BOZZA = '3f2c1a7e-1111-4222-8333-944455556666';
const CARTELLA = `pratiche/led-office/bozze/${BOZZA}/`;
const ID_PROPOSTA = 'LO-20261020-100000';
const RISERVATO_PATH = `preventivi/led-office/${ID_PROPOSTA}/mcf/proposta-locatore-${ID_PROPOSTA}.pdf`;
const IBAN = 'IT60X0542811101000000123456';
const PDF_LOCATORE = '%PDF-1.3 proposta per il locatore';

// --- sessione e carrozzeria ---------------------------------------------------------

const carrozzeria = (settore = 'distinta') => ({
  slug: settore === 'distinta' ? 'led-office' : 'duplex',
  nome: settore === 'distinta' ? 'Led Office' : 'Duplex',
  citta: null,
  prefisso: settore === 'distinta' ? 'LO' : 'DX',
  organizationId: 'org-lo',
  tabellaCanoni: 'pagarent',
  brand: { logo: null, colore: null, accento: null },
  settore,
  etichettaBene: 'Bene',
  partnerLeasing: 'alba',
  sogliaLeasing: 0,
  tettoMeseEuro: 100,
  demo: false,
  documentiExtra: [],
  attivo: true,
  tabellaAlternativa: null,
  regoleSemaforo: settore === 'distinta' ? 'prefiltro' : 'locatore',
  leasing: false,
  prezzoVerifica: 5,
  canali: settore === 'distinta' ? CANALI_LO : null,
  societaFornitrice: null,
  checklist: settore === 'distinta' ? CHECKLIST_LO : null,
  categorie: settore === 'distinta' ? CATEGORIE_LO : null,
});

type Ruolo = 'admin' | 'referente' | 'agente';
const sessione = (ruolo: Ruolo = 'agente', settore = 'distinta') => ({
  ok: true,
  contesto: { userId: `u-${ruolo}`, email: `${ruolo}@example.it`, nome: ruolo, ruolo, organizationId: 'org-lo' },
  carrozzeria: carrozzeria(settore),
  vedeTutto: ruolo !== 'agente',
});

// --- il cliente, la proposta, la bozza -------------------------------------------------

const SCHEDA: SchedaRidotta = {
  piva: PIVA,
  ragioneSociale: 'Cliente di Prova S.r.l.',
  formaGiuridica: "SOCIETA' A RESPONSABILITA' LIMITATA",
  sede: 'VIA ROMA 1 - 00100 ROMA (RM)',
  ateco: '47.11.00 Commercio al dettaglio',
  attivaDal: '10/05/2012',
  statoAttivita: 'Attiva',
  fatturato: 2_000_000,
  annoBilancio: 2025,
  trendFatturato: null,
  utile: 40_000,
  patrimonioNetto: 300_000,
  ebitda: null,
  dipendenti: 150,
  rating: null,
  lineaCreditoConsigliata: null,
  unitaLocali: [],
};

const DATI: DatiCreditoMotore = {
  fatturato: 2_000_000,
  annoBilancio: 2025,
  patrimonioNetto: 300_000,
  utile: 40_000,
  inizioAttivita: '2012-05-10',
  rating: null,
  formaCodice: 'SR',
  attiva: true,
  cessata: false,
  capitaleSociale: 20_000,
  dipendenti: 150,
  bilanciConRicavi: [2025, 2024],
  atecoCodice: '47.11.00',
};

const CREATO_RICERCA = '2026-10-20T08:00:00.000Z';
const eventi = (stato: string) =>
  ({ stato, id: 'ev-1', avviata: CREATO_RICERCA, chiusa: null, codice: PIVA, daRegistro: false, mail: 'mandata' });

const ricerca = (o: Record<string, unknown> = {}) => ({
  id: 'r-1',
  piva: PIVA,
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: DATI, scheda: SCHEDA },
  eventi: eventi('assenti'),
  segnali: { segnalato: null, praticaRecente: null },
  creato: CREATO_RICERCA,
  ...o,
});

const RIGHE = [
  {
    codice: 'LO-PER-TAB-S10-FE', descrizione: 'TABLET SAMSUNG GALAXY TAB S10 FE WIFI 128GB', categoria: 'Periferiche e tablet',
    quantita: 70, prezzo: 540, listino: 560, fuoriListino: false, scaduta: false, totale: 37_800,
  },
  {
    codice: 'LO-POST-AM242', descrizione: 'PC ALL IN ONE MSI PRO AM242 TP 1M 23,8" I5 SSD 512GB W11', categoria: 'Postazioni di lavoro',
    quantita: 50, prezzo: 1_900, listino: 1_900, fuoriListino: false, scaduta: false, totale: 95_000,
  },
];
const BENI = 132_800;

const VENDITA = {
  amministratore: { nome: 'Anna Rossi', nascita: '01/02/1970', codiceFiscale: 'RSSNNA70B41H501X', residenza: 'Via Verdi 2, Roma' },
  telefono: '333 1234567',
  email: 'anna@example.it',
  riferimento: { nome: 'Luca Bianchi', telefono: '333 7654321' },
  iban: IBAN,
  sdi: 'ABC1234',
  pec: '',
};

const proposta = (o: Record<string, any> = {}) => ({
  id: ID_PROPOSTA,
  // Non la seleziona la pratica: serve al database finto per filtrare come farebbe Postgres
  ricerca_id: 'r-1',
  dati: {
    righe: RIGHE,
    consegna: { tipo: 'sede', indirizzo: SCHEDA.sede },
    motivazioni: {},
    ledwallConfermato: false,
    vendita: VENDITA,
    ...(o.dati ?? {}),
  },
  numeri: {
    rate: [{ durata: 24, canone: 7000 }, { durata: 36, canone: 5000 }, { durata: 48, canone: 4000 }, { durata: 60, canone: 3300 }],
    scelta: { durata: 60, canone: 3300 },
  },
  canale: 'pagarent',
  riservato: {
    canale: 'pagarent', beni: BENI, maggiorazione: 6_640, imponibile: 139_440,
    documenti: [{ nome: `proposta-locatore-${ID_PROPOSTA}.pdf`, pathname: RISERVATO_PATH }],
  },
  ...Object.fromEntries(Object.entries(o).filter(([chiave]) => chiave !== 'dati')),
});

const doc = (voce: string, nome: string, cartella = CARTELLA) =>
  ({ nome, pathname: `${cartella}${nome.replace('.', '-x1.')}`, size: 1_000, voce });
const DOCUMENTI = [doc(PROPOSTA_FIRMATA, 'proposta-firmata.pdf'), doc(IDENTITA, 'ci.jpg')];

const corpo = (o: Record<string, unknown> = {}) => ({
  f: 'led-office', ricercaId: 'r-1', propostaId: ID_PROPOSTA, bozza: BOZZA, documenti: DOCUMENTI, ...o,
});

/** Le righe di app.catalogo_voce come le restituisce Postgres */
const righeCatalogo = () => vociLedOffice().map((v, i) => ({
  id: String(i + 1), codice: v.codice, nome: v.nome, descrizione: null, prezzo: String(v.prezzo),
  attributi: v.attributi, ordine: i, attivo: true,
}));

function database(o: { ricerca?: unknown; proposta?: unknown } = {}) {
  db.queryUna.mockImplementation(async (sql: string, valori: unknown[]) => {
    if (sql.includes('FROM app.ricerca_merito')) return o.ricerca === undefined ? ricerca() : o.ricerca;
    if (sql.includes('FROM app.proposta')) {
      const p = (o.proposta === undefined ? proposta() : o.proposta) as { ricerca_id?: string } | null;
      // La proposta deve essere della ricerca indicata ($4)
      return p && p.ricerca_id === valori[3] ? p : null;
    }
    return null;
  });
  db.query.mockImplementation(async (sql: string, valori: unknown[]) => {
    if (sql.includes('INSERT INTO app.pratica')) return [{ id: valori[0] }];
    if (sql.includes('FROM app.catalogo_voce')) return righeCatalogo();
    return [];
  });
}

const SENZA_SEGNALI = { segnali: { segnalato: null, praticaRecente: null }, fallite: { segnalato: false, pratiche: false } };

const post = (c: Record<string, unknown>) =>
  inviaPratica({ request: new Request('https://www.example.it/api/motore/pratica', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
  }) });

/** La riga scritta in app.pratica, colonna per colonna */
function inserita() {
  const chiamata = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO app.pratica'));
  if (!chiamata) return null;
  const [sql, v] = chiamata as [string, unknown[]];
  return {
    sql,
    id: v[0] as string, fornitore: v[1], propostaId: v[4], piva: v[5], cliente: v[6], importo: v[7],
    dati: JSON.parse(String(v[8])), documenti: JSON.parse(String(v[9])), negativita: JSON.parse(String(v[10])),
    canale: sql.includes('canale') ? v[12] : undefined,
    riservato: sql.includes('riservato') && v[13] ? JSON.parse(String(v[13])) : null,
  };
}

type Mail = { to: string; subject: string; html: string; allegati?: { filename: string; content: string }[] };
const mail = () => posta.inviaMail.mock.calls.map(([m]) => m as Mail).find((m) => /^(Pratica|Segnalazione) /.test(m.subject))!;
const mailVerifica = () => posta.inviaMail.mock.calls.map(([m]) => m as Mail).find((m) => /Verifica|verifica/.test(m.subject));

beforeEach(() => {
  vi.clearAllMocks();
  database();
  db.env.mockImplementation((nome: string) => (nome === 'BLOB_READ_WRITE_TOKEN' ? 'tok-finto' : undefined));
  blob.get.mockImplementation(async () => ({ stream: new Blob([PDF_LOCATORE]).stream(), blob: { contentType: 'application/pdf' } }));
  segn.segnaliPrefiltro.mockResolvedValue(SENZA_SEGNALI);
  segn.salvaSegnali.mockResolvedValue(undefined);
  // La verifica eventi e' gia' nel registro: all'invio non si ripaga
  oa.leggiVerifica.mockImplementation(async () => ({
    cf: PIVA, negativita: { id: 'ev-1', avviata: new Date().toISOString(), pronto: true, dati: { presenzaProtesti: false } },
  }));
  oa.avviaNegativita.mockRejectedValue(new Error('la verifica non si ripaga'));
  oa.entroIlTetto.mockResolvedValue({ ok: true });
  oa.scriviVerifica.mockResolvedValue(undefined);
  oa.esitoNegativita.mockResolvedValue({ pronto: false });
  posta.inviaMail.mockResolvedValue({ ok: true, id: 'm-1' });
  motore.sessioneMotore.mockResolvedValue(sessione());
});

describe('/api/motore/pratica sul settore distinta', () => {
  it('tutta la richiesta passa dalla distinta: importo, prodotto e forma del browser non contano', async () => {
    const r = await post(corpo({ importo: 1, prodotto: 'leasing', formaGiuridica: 'Ditta individuale', durata: 36 }));
    expect(r.status).toBe(200);
    const risposta = await r.json();
    expect(risposta).toEqual({ ok: true, id: expect.stringMatching(/^LO-P-\d{8}-\d{6}$/), segnalazione: false });

    const p = inserita()!;
    expect(p.importo).toBe(BENI);
    expect(p.propostaId).toBe(ID_PROPOSTA);
    expect(p.canale).toBe('pagarent');
    expect(p.riservato).toEqual(proposta().riservato);
    expect(p.dati).toMatchObject({
      prodotto: 'noleggio', durata: 36, formaGiuridica: 'Società di capitali', classeForma: 'capitali',
      segnalazione: false, motivoSegnalazione: null, semaforo: 'verde', righe: RIGHE, vendita: VENDITA,
      // precompilati dalla proposta di vendita
      iban: IBAN, referente: { nome: 'Anna Rossi', telefono: '333 1234567', email: 'anna@example.it' },
    });
    expect(p.documenti.map((d: { voce: string }) => d.voce)).toEqual([PROPOSTA_FIRMATA, IDENTITA]);
    // La verifica eventi viene dal registro: nessuna chiamata a pagamento
    expect(oa.avviaNegativita).not.toHaveBeenCalled();
    expect(p.negativita).toMatchObject({ id: 'ev-1', pronto: true, daRegistro: true });
  });

  it('al commerciale non esce niente di riservato', async () => {
    const testo = (await (await post(corpo())).text()).toLowerCase();
    for (const vietata of ['pagarent', 'grenke', 'econocom', 'maggiorazione', 'riservato', 'servizi di trasporto', '/mcf/', 'imponibile']) {
      expect(testo).not.toContain(vietata);
    }
  });

  it('la mail a MCF porta canale, importi per il locatore, i documenti e la proposta per il locatore in allegato', async () => {
    await post(corpo());
    const m = mail();
    expect(m.to).toBe(DESTINATARIO_MCF);
    expect(m.subject).toMatch(/^Pratica Led Office — Cliente di Prova S\.r\.l\. — 132\.800 euro$/);
    expect(m.html).toContain('Pagarent');
    expect(m.html).toContain('6.640 euro');
    expect(m.html).toContain('139.440,00 euro');
    expect(blob.get).toHaveBeenCalledWith(RISERVATO_PATH, { access: 'private', token: 'tok-finto' });
    // Dal 22/10/2026 i documenti del cliente vanno in allegato, prima della proposta per il locatore
    for (const d of DOCUMENTI) expect(blob.get).toHaveBeenCalledWith(d.pathname, { access: 'private', token: 'tok-finto' });
    expect(m.allegati!.map((a) => a.filename)).toEqual(['proposta-firmata.pdf', 'ci.jpg', `proposta-locatore-${ID_PROPOSTA}.pdf`]);
    expect(m.allegati!.at(-1)!.content).toBe(Buffer.from(PDF_LOCATORE).toString('base64'));
    expect(m.html).toContain('Tutti in allegato a questa mail');
  });

  it('lo ZIP unico basta: le voci obbligatorie non fermano la pratica e la mail lo dice', async () => {
    const r = await post(corpo({ documenti: [doc(VOCE_ZIP, 'documenti.zip')] }));
    expect(r.status).toBe(200);
    const p = inserita()!;
    expect(p.documenti.map((d: { voce: string }) => d.voce)).toEqual([VOCE_ZIP]);
    const m = mail();
    expect(m.allegati!.map((a) => a.filename)).toEqual(['documenti.zip', `proposta-locatore-${ID_PROPOSTA}.pdf`]);
    expect(m.html).toContain('unico ZIP');
  });

  it('uno ZIP sotto una voce normale, o un PDF sotto la voce ZIP, non si tengono', async () => {
    const r = await post(corpo({ documenti: [...DOCUMENTI, doc(IDENTITA, 'altro.zip'), doc(VOCE_ZIP, 'visura.pdf')] }));
    expect(r.status).toBe(200);
    expect(inserita()!.documenti.map((d: { nome: string }) => d.nome)).toEqual(['proposta-firmata.pdf', 'ci.jpg']);
  });

  it('senza proposta su un cliente verde: proposta_mancante, nessuna pratica', async () => {
    const r = await post(corpo({ propostaId: undefined, importo: 5_000 }));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, error: 'proposta_mancante', messaggio: expect.any(String) });
    expect(inserita()).toBeNull();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  it('proposta indicata ma non visibile o di un altro cliente: proposta_non_valida', async () => {
    database({ proposta: null });
    const r = await post(corpo());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('proposta_non_valida');
    // La proposta si cerca per id, fornitore e partita IVA della ricerca, dentro la visibilita' dell'agente
    const [sql, valori] = db.queryUna.mock.calls.find(([s]) => String(s).includes('FROM app.proposta'))!;
    expect(sql).toMatch(/fornitore_slug = \$2 AND piva = \$3 AND ricerca_id = \$4/);
    expect(valori).toEqual([ID_PROPOSTA, 'led-office', PIVA, 'r-1', 'org-lo', 'u-agente']);
  });

  it('proposta di un\'altra verifica dello stesso cliente: proposta_non_valida', async () => {
    database({ ricerca: ricerca({ id: 'r-2' }) });
    const r = await post(corpo({ ricercaId: 'r-2' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('proposta_non_valida');
    expect(inserita()).toBeNull();
  });

  it('rosso arrivato dopo il preventivo (eventi chiusi presenti): l\'invio diventa una segnalazione', async () => {
    database({ ricerca: ricerca({ eventi: eventi('presenti') }) });
    // Nella segnalazione la proposta firmata non si chiede
    const r = await post(corpo({ documenti: [doc(IDENTITA, 'ci.jpg')] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
    const p = inserita()!;
    expect(p.dati).toMatchObject({ segnalazione: true, motivoSegnalazione: 'rosso', semaforo: 'rosso', eventi: 'presenti' });
    expect(p.propostaId).toBe(ID_PROPOSTA);
    expect(p.importo).toBe(BENI);
    // Una segnalazione non e' andata su nessun canale: la proposta resta nel riservato, per MCF
    expect(p.canale).toBeNull();
    expect(p.riservato).toEqual({ ...proposta().riservato, canaleProposta: 'pagarent' });
    const m = mail();
    expect(m.subject).toMatch(/^Segnalazione Led Office/);
    expect(m.html).toContain('SEGNALAZIONE, prefiltro rosso');
    expect(m.html).toContain('la proposta era su Pagarent');
    // La proposta per il locatore resta allegata, dopo il documento del cliente
    expect(m.allegati!.map((a) => a.filename)).toEqual(['ci.jpg', `proposta-locatore-${ID_PROPOSTA}.pdf`]);
  });

  it('eventi chiusi nel registro dopo la ricerca: rosso anche se la ricerca dice ancora in verifica', async () => {
    database({ ricerca: ricerca({ eventi: eventi('in-verifica') }) });
    oa.leggiVerifica.mockImplementation(async () => ({
      cf: PIVA, negativita: { id: 'ev-1', avviata: new Date().toISOString(), pronto: true, dati: { presenzaProtesti: true } },
    }));
    const r = await post(corpo());
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
    expect(inserita()!.dati.motivoSegnalazione).toBe('rosso');
  });

  describe('esito arrivato dopo il giro in background e mai letto', () => {
    // Avviata cinque minuti fa: oltre la soglia di rilettura, dentro le 24 ore del registro
    const avviata = () => new Date(Date.now() - 5 * 60_000).toISOString();
    const tardivi = () => {
      const quando = avviata();
      database({ ricerca: ricerca({ eventi: { ...eventi('non-pervenuti'), avviata: quando } }) });
      oa.leggiVerifica.mockImplementation(async () => ({ cf: PIVA, negativita: { id: 'ev-1', avviata: quando, pronto: false } }));
    };

    it('presenti: si legge una volta all\'invio, l\'invio diventa una segnalazione e parte l\'aggiornamento a MCF', async () => {
      tardivi();
      oa.esitoNegativita.mockResolvedValue({ pronto: true, dati: { presenzaProtesti: true } });
      const r = await post(corpo());
      expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
      expect(oa.esitoNegativita).toHaveBeenCalledTimes(1);
      expect(oa.esitoNegativita).toHaveBeenCalledWith('ev-1', 'carrozzeria/led-office');
      expect(oa.avviaNegativita).not.toHaveBeenCalled();
      const p = inserita()!;
      expect(p.dati).toMatchObject({ motivoSegnalazione: 'rosso', eventi: 'presenti' });
      // L'esito si salva sulla ricerca, e MCF riceve l'aggiornamento della verifica coi segnali
      const salvata = db.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE app.ricerca_merito SET eventi'));
      expect(JSON.parse(String(salvata![1][1]))).toMatchObject({ stato: 'presenti' });
      expect(mailVerifica()!.subject).toMatch(/^Aggiornamento verifica Led Office/);
    });

    it('assenti: pratica normale, nessuna verifica nuova a pagamento', async () => {
      tardivi();
      oa.esitoNegativita.mockResolvedValue({ pronto: true, dati: { presenzaProtesti: false } });
      const r = await post(corpo());
      expect(await r.json()).toMatchObject({ ok: true, segnalazione: false });
      expect(inserita()!.dati.eventi).toBe('assenti');
      expect(oa.esitoNegativita).toHaveBeenCalledTimes(1);
      expect(oa.avviaNegativita).not.toHaveBeenCalled();
      expect(mailVerifica()).toBeUndefined();
    });

    it('la lettura che fallisce non ferma la pratica: si va avanti con quello che c\'e\'', async () => {
      tardivi();
      oa.esitoNegativita.mockRejectedValue(new Error('openapi giu\''));
      const r = await post(corpo());
      expect(await r.json()).toMatchObject({ ok: true, segnalazione: false });
      expect(inserita()!.dati.eventi).toBe('non-pervenuti');
    });

    it('esito appena avviato: non si rilegge, ci pensa il giro in background', async () => {
      database({ ricerca: ricerca({ eventi: { ...eventi('in-verifica'), avviata: new Date().toISOString() } }) });
      await post(corpo());
      expect(oa.esitoNegativita).not.toHaveBeenCalled();
    });
  });

  it('MCF segna il cliente dopo la verifica: segnalazione, coi segnali riletti dalla verifica e salvati', async () => {
    const segnalato = { segnalato: { motivo: 'sofferenze', effetto: 'rosso' as const }, praticaRecente: null };
    segn.segnaliPrefiltro.mockResolvedValue({ segnali: segnalato, fallite: { segnalato: false, pratiche: false } });
    const r = await post(corpo());
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
    // La pratica recente conta fino al momento della verifica (Ruling 11)
    expect(segn.segnaliPrefiltro).toHaveBeenCalledWith(PIVA, new Date(CREATO_RICERCA));
    expect(segn.salvaSegnali).toHaveBeenCalledWith('r-1', segnalato);
    expect(mail().html).toContain('sofferenze, effetto rosso');
  });

  it('una fonte dei segnali che non risponde lascia il valore salvato sulla ricerca', async () => {
    const salvati = { segnalato: { motivo: 'insoluto', effetto: 'rosso' as const }, praticaRecente: null };
    database({ ricerca: ricerca({ segnali: salvati }) });
    segn.segnaliPrefiltro.mockResolvedValue({ ...SENZA_SEGNALI, fallite: { segnalato: true, pratiche: false } });
    const r = await post(corpo());
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
  });

  it('cliente bloccato: rifiutato col testo fisso, niente pratica e niente mail', async () => {
    segn.segnaliPrefiltro.mockResolvedValue({
      segnali: { segnalato: { motivo: 'insoluto', effetto: 'blocco' }, praticaRecente: null },
      fallite: { segnalato: false, pratiche: false },
    });
    const r = await post(corpo());
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, error: 'cliente_bloccato', messaggio: TESTI_PREFILTRO.bloccato });
    expect(inserita()).toBeNull();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  const segnalazione = (righe: unknown[]) => corpo({
    propostaId: undefined, segnalazione: true, righe, consegna: { indirizzo: SCHEDA.sede },
    referente: { nome: 'Anna Rossi', telefono: '333 1234567', email: 'anna@example.it' }, iban: IBAN,
    documenti: [doc(IDENTITA, 'ci.jpg')],
  });

  it('segnalazione chiesta su un cliente verde con un canale che regge: non si crede al browser', async () => {
    const r = await post(segnalazione([{ codice: 'LO-PER-TAB-S10-FE', quantita: 10 }]));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('proposta_mancante');
    expect(inserita()).toBeNull();
  });

  it('segnalazione chiesta con una riga che non regge: l\'errore della distinta, non "proposta mancante"', async () => {
    const r = await post(segnalazione([{ codice: 'LO-NON-ESISTE', quantita: 1 }]));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, error: 'voce_non_trovata', riga: 0 });
    expect(inserita()).toBeNull();
  });

  it('il colore salvato e\' quello del prefiltro con la distinta: consegna fuori sede e\' giallo', async () => {
    database({ proposta: proposta({ dati: { consegna: { tipo: 'altro', indirizzo: 'VIA DEL MAGAZZINO 9 - 00100 ROMA' } } }) });
    const r = await post(corpo());
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: false });
    expect(inserita()!.dati.semaforo).toBe('giallo');
    expect(mail().html).toContain('Consegna: altro indirizzo');
  });

  it('segnalazione senza canale per l\'importo: passa, con la distinta del corpo ricontrollata sul catalogo', async () => {
    // 30 server da 14.000: 420.000 di beni, oltre il tetto Pagarent e sotto i 5 milioni di fatturato per Econocom
    const r = await post(segnalazione([{ codice: 'LO-SRV-DELL-TOWER', quantita: 30, descrizione: 'scritta dal browser' }]));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
    const p = inserita()!;
    expect(p.propostaId).toBeNull();
    expect(p.importo).toBe(420_000);
    expect(p.canale).toBeNull();
    expect(p.riservato).toBeNull();
    expect(p.dati).toMatchObject({ segnalazione: true, motivoSegnalazione: 'nessun_canale', semaforo: 'verde' });
    expect(p.dati.righe[0].descrizione).toMatch(/^SERVER DELL TOWER/);
    const m = mail();
    expect(m.html).toContain('SEGNALAZIONE, nessun canale regge l&#39;importo');
    expect(m.html).toContain('Nessuna proposta per il locatore');
    // Solo il documento del cliente: la proposta per il locatore non c'e'
    expect(m.allegati!.map((a) => a.filename)).toEqual(['ci.jpg']);
    expect(blob.get).not.toHaveBeenCalledWith(expect.stringContaining('/mcf/'), expect.anything());
  });

  it('rosso senza proposta: segnalazione con la distinta del corpo; senza righe l\'errore della distinta', async () => {
    database({ ricerca: ricerca({ eventi: eventi('presenti') }) });
    const vuota = await post(corpo({ propostaId: undefined, documenti: [doc(IDENTITA, 'ci.jpg')] }));
    expect(vuota.status).toBe(400);
    expect(await vuota.json()).toMatchObject({ ok: false, error: 'distinta_vuota' });
    expect(inserita()).toBeNull();

    const r = await post(segnalazione([{ codice: 'LO-PER-TAB-S10-FE', quantita: 10, prezzo: 500 }]));
    expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
    const p = inserita()!;
    expect(p.importo).toBe(5_000);
    expect(p.dati.motivoSegnalazione).toBe('rosso');
    // Il canale che reggerebbe resta nella mail, non nella pratica
    expect(p.canale).toBeNull();
    expect(mail().html).toContain('indicativo: Pagarent');
  });

  it('documenti obbligatori mancanti: fermano l\'invio e il messaggio li elenca', async () => {
    const r = await post(corpo({ documenti: [] }));
    expect(r.status).toBe(400);
    const risposta = await r.json();
    expect(risposta.error).toBe('documenti_mancanti');
    expect(risposta.messaggio).toContain(PROPOSTA_FIRMATA);
    expect(risposta.messaggio).toContain(IDENTITA);
    expect(inserita()).toBeNull();
  });

  it('si tengono solo i documenti della bozza caricati sotto una voce di questo cliente', async () => {
    const r = await post(corpo({
      documenti: [
        ...DOCUMENTI,
        doc('Visura camerale', 'visura.pdf'),
        // dichiarazioni: voce delle ditte, non di una SRL
        doc('Ultime due dichiarazioni dei redditi', 'unico.pdf'),
        doc('Una voce inventata', 'altro.pdf'),
        { nome: 'senza-voce.pdf', pathname: `${CARTELLA}senza-voce.pdf`, size: 1 },
        doc('Foto della sede', 'sede.jpg', 'pratiche/led-office/bozze/00000000-0000-4000-8000-000000000000/'),
      ],
    }));
    expect(r.status).toBe(200);
    const p = inserita()!;
    expect(p.documenti.map((d: { nome: string }) => d.nome)).toEqual(['proposta-firmata.pdf', 'ci.jpg', 'visura.pdf']);
    expect(p.dati.mancanti).not.toContain('Visura camerale');
    expect(p.dati.mancanti).toContain('Ultimi due bilanci depositati con ricevuta di deposito');
    // Beni oltre 50.000: si chiede anche la situazione contabile dell'anno
    expect(p.dati.checklist).toContain("Situazione contabile dell'anno (bilancio provvisorio)");
  });

  it('la forma che decide la checklist viene dal Registro: ditta individuale, dichiarazioni dei redditi', async () => {
    database({ ricerca: ricerca({ dati_credito: { dati: { ...DATI, formaCodice: 'DI' }, scheda: SCHEDA } }) });
    const r = await post(corpo({ formaGiuridica: 'Società di capitali', documenti: [...DOCUMENTI, doc('Ultime due dichiarazioni dei redditi', 'unico.pdf')] }));
    expect(r.status).toBe(200);
    const p = inserita()!;
    expect(p.dati.formaGiuridica).toBe('Ditta individuale');
    expect(p.documenti.map((d: { voce: string }) => d.voce)).toContain('Ultime due dichiarazioni dei redditi');
    expect(p.dati.checklist).not.toContain('Ultimi due bilanci depositati con ricevuta di deposito');
  });

  it('consegna senza indirizzo: rifiutata con un messaggio chiaro', async () => {
    database({ proposta: proposta({ dati: { consegna: { tipo: 'altro', indirizzo: '' } } }) });
    const r = await post(corpo());
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, error: 'consegna_mancante', messaggio: expect.stringContaining('consegna') });
    expect(inserita()).toBeNull();
  });

  it('cellulare, email e IBAN: dal corpo se scritti, dalla proposta se no, e obbligatori', async () => {
    const altro = 'IT36X0306909606100000063526';
    await post(corpo({ iban: altro, referente: { telefono: '+39 340 1112223' } }));
    expect(inserita()!.dati).toMatchObject({
      iban: altro, referente: { nome: 'Anna Rossi', telefono: '+39 340 1112223', email: 'anna@example.it' },
    });

    db.query.mockClear();
    // Una proposta di vendita salvata senza IBAN (dati di prima, o scritti male): il corpo non lo porta
    database({ proposta: proposta({ dati: { vendita: { ...VENDITA, iban: '' } } }) });
    const senza = await post(corpo({ referente: { telefono: '333 1234567', email: 'anna@example.it' } }));
    expect(senza.status).toBe(400);
    expect(await senza.json()).toMatchObject({ error: 'iban_mancante', messaggio: expect.any(String) });
    expect(inserita()).toBeNull();
  });

  describe('una pratica normale parte solo dalla proposta di vendita, non dal solo canone', () => {
    it('proposta senza dati di vendita: proposta_senza_vendita, nessuna pratica e nessuna mail', async () => {
      database({ proposta: proposta({ dati: { vendita: null } }) });
      const r = await post(corpo());
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({
        ok: false, error: 'proposta_senza_vendita', messaggio: expect.stringContaining('Genera prima la proposta di vendita'),
      });
      expect(inserita()).toBeNull();
      expect(mail()).toBeUndefined();
    });

    it('proposta senza la proposta per il locatore salvata: proposta_senza_vendita', async () => {
      database({ proposta: proposta({ riservato: { ...proposta().riservato, documenti: [] } }) });
      const r = await post(corpo());
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe('proposta_senza_vendita');
      expect(inserita()).toBeNull();
    });

    it('sulla segnalazione (rosso) la proposta col solo canone resta buona', async () => {
      const segnalato = { segnalato: { motivo: 'sofferenze', effetto: 'rosso' as const }, praticaRecente: null };
      segn.segnaliPrefiltro.mockResolvedValue({ segnali: segnalato, fallite: { segnalato: false, pratiche: false } });
      database({ proposta: proposta({ dati: { vendita: null }, riservato: { ...proposta().riservato, documenti: [] } }) });
      const r = await post(corpo({ iban: IBAN, referente: { telefono: '333 1234567', email: 'anna@example.it' } }));
      expect(await r.json()).toMatchObject({ ok: true, segnalazione: true });
      expect(inserita()!.propostaId).toBe(ID_PROPOSTA);
    });
  });

  it('bozza non valida: rifiutata', async () => {
    const r = await post(corpo({ bozza: '../altro' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('bozza_non_valida');
  });

  it('lo store che non risponde: la mail parte lo stesso, senza allegati, e lo dice', async () => {
    blob.get.mockRejectedValue(new Error('store giu\''));
    const r = await post(corpo());
    expect(r.status).toBe(200);
    const m = mail();
    expect(m.allegati).toEqual([]);
    expect(m.html).toContain('non si è potuta leggere');
    expect(m.html).toContain('Restano nel portale');
  });

  it('una mail persa non annulla la pratica gia\' salvata', async () => {
    posta.inviaMail.mockResolvedValue({ ok: false, err: 'resend_500' });
    const r = await post(corpo());
    expect(r.status).toBe(200);
    expect(inserita()).not.toBeNull();
  });

  it('un percorso del riservato fuori dalla cartella riservata del fornitore non si legge', async () => {
    database({ proposta: proposta({ riservato: { ...proposta().riservato, documenti: [{ nome: 'x.pdf', pathname: 'preventivi/duplex/X/mcf/x.pdf' }] } }) });
    await post(corpo());
    expect(blob.get).not.toHaveBeenCalledWith('preventivi/duplex/X/mcf/x.pdf', expect.anything());
    expect(mail().html).toContain('non si è potuta leggere');
  });

  it('ricerca non visibile: 404', async () => {
    database({ ricerca: null });
    const r = await post(corpo());
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe('ricerca_non_trovata');
  });

  it('creaPraticaDistinta con una data: stesso esito della route', async () => {
    const esito = await creaPraticaDistinta(sessione() as any, corpo(), OGGI);
    expect(esito).toEqual({ ok: true, id: expect.stringMatching(/^LO-P-/), segnalazione: false });
  });
});

describe('/api/motore/pratica sugli altri settori', () => {
  it('Duplex resta sul percorso di sempre: importo dal browser, niente canale ne\' riservato', async () => {
    motore.sessioneMotore.mockResolvedValue(sessione('agente', 'macchine'));
    const r = await post({
      f: 'duplex', ricercaId: 'r-1', bozza: BOZZA, prodotto: 'noleggio', durata: 36, importo: 5_000,
      formaGiuridica: 'Società di capitali',
      referente: { nome: 'Anna', telefono: '333 1234567', email: 'anna@example.it' }, iban: IBAN,
      documenti: [{ nome: 'ci.pdf', pathname: `pratiche/duplex/bozze/${BOZZA}/ci.pdf`, size: 1 }],
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: expect.stringMatching(/^DX-P-/) });
    const p = inserita()!;
    expect(p.sql).not.toContain('canale');
    expect(p.sql).not.toContain('riservato');
    expect(p.importo).toBe(5_000);
    expect(p.dati).not.toHaveProperty('segnalazione');
    expect(p.documenti).toEqual([{ nome: 'ci.pdf', pathname: `pratiche/duplex/bozze/${BOZZA}/ci.pdf`, size: 1 }]);
    expect(segn.segnaliPrefiltro).not.toHaveBeenCalled();
  });
});

describe('/api/motore/upload', () => {
  const chiedi = async (settore: string, nome = 'a.pdf') => {
    motore.sessioneMotore.mockResolvedValue(sessione('agente', settore));
    const slug = settore === 'distinta' ? 'led-office' : 'duplex';
    caricamento.handleUpload.mockImplementation(async ({ onBeforeGenerateToken }: any) =>
      ({ opzioni: await onBeforeGenerateToken(`pratiche/${slug}/bozze/${BOZZA}/${nome}`, JSON.stringify({ f: slug, bozza: BOZZA })) }));
    const r = await chiediUpload({ request: new Request('https://www.example.it/api/motore/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'blob.generate-client-token' }),
    }) });
    return { status: r.status, corpo: await r.json() };
  };

  it('settore distinta: lo store accetta PDF, JPEG e lo ZIP unico', async () => {
    const { status, corpo: c } = await chiedi('distinta');
    expect(status).toBe(200);
    expect(c.opzioni.allowedContentTypes).toEqual(['application/pdf', 'image/jpeg', ...TIPI_ZIP]);
  });

  it('gli altri fornitori: i formati di sempre', async () => {
    const { corpo: c } = await chiedi('macchine');
    expect(c.opzioni.allowedContentTypes).toContain('image/heic');
    expect(c.opzioni.allowedContentTypes).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});

describe('/api/motore/storico non legge dati, canale e riservato della pratica', () => {
  it('per agente, referente e admin: colonne esplicite, niente IBAN ne\' dati di vendita', async () => {
    for (const ruolo of ['agente', 'referente', 'admin'] as const) {
      db.query.mockClear();
      db.query.mockResolvedValue([]);
      motore.sessioneMotore.mockResolvedValue(sessione(ruolo));
      const r = await leggiStorico({ request: new Request('https://www.example.it/api/motore/storico?f=led-office') });
      expect(r.status).toBe(200);
      const sqlPratiche = db.query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('FROM app.pratica'))!;
      const sqlProposte = db.query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('FROM app.proposta'))!;
      for (const sql of [sqlPratiche, sqlProposte]) {
        expect(sql).not.toMatch(/x\.canale|x\.riservato|\*/);
        // di `dati` solo prodotto e durata, mai la colonna intera
        expect(sql).not.toMatch(/x\.dati(?!->>'(prodotto|durata)')/);
      }
    }
  });
});
