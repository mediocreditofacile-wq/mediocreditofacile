// Il salvataggio della proposta di distinta (Led Office): la riga in app.proposta, i
// PDF del commerciale nella cartella della proposta, la proposta per il locatore in
// quella riservata e la mail a MCF. Spec mcf_spec-ledoffice-motore_v1, paragrafi 4 e 8.
//
// Database, Blob, loghi e mail sono finti: qui si prova cosa si scrive e dove, non
// le connessioni. I numeri vengono dal calcolo vero (componiCalcolo) sulla
// configurazione dei canali di Led Office; il cliente e' inventato. Il punto che non
// si tratta: canale, maggiorazione, imponibile e il percorso della proposta per il
// locatore non finiscono mai in `dati`, `numeri`, `documenti` ne' nella risposta.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), queryUna: vi.fn(), env: vi.fn() }));
const blob = vi.hoisted(() => ({ put: vi.fn() }));
const pv = vi.hoisted(() => ({ salvaPdf: vi.fn() }));
const posta = vi.hoisted(() => ({ inviaMail: vi.fn() }));
const loghi = vi.hoisted(() => ({ logoDaBlob: vi.fn() }));
vi.mock('../db', () => ({ query: db.query, queryUna: db.queryUna, env: db.env }));
// La guardia di sessione non serve: la sessione si passa gia' fatta, e cosi' Better Auth non parte
vi.mock('../portale-auth', () => ({ richiediSessione: vi.fn(), vedeTuttoIlFornitore: vi.fn() }));
vi.mock('@vercel/blob', () => ({ put: blob.put }));
vi.mock('../preventivi-pv', () => ({ salvaPdf: pv.salvaPdf }));
vi.mock('../brand-fornitore', () => ({ logoDaBlob: loghi.logoDaBlob }));
vi.mock('../mail-portale', async (originale) => ({
  ...(await originale<typeof import('../mail-portale')>()),
  inviaMail: posta.inviaMail,
}));

import { escapeHtml } from '../mail-portale';
import type { Contesto } from '../portale-auth';
import type { RicercaSalvata } from './calcolo-proposta';
import { componiCalcolo, type CalcoloDistinta } from './calcolo-distinta';
import type { Carrozzeria, VoceCatalogo } from './carrozzeria';
import type { CanaleConfig, Categoria, SocietaFornitrice } from './config-distinta';
import type { EventiRicerca } from './eventi-stato';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { DESCRIZIONE_SERVIZI } from './pdf-ledoffice';
import type { SegnaliPrefiltro } from './prefiltro';
import {
  corpoMailDistinta,
  datiProposta,
  descrizioneDistinta,
  generaPreventivoDistinta,
  numeriProposta,
  percorsoRiservato,
  riservatoProposta,
} from './preventivo-distinta';

const OGGI = new Date(2026, 9, 20, 10, 15);

const SCHEDA: SchedaRidotta = {
  piva: '01234567890',
  ragioneSociale: 'Alfa Soccorsi Soc. Coop.',
  formaGiuridica: 'SOCIETA\' COOPERATIVA',
  sede: 'VIA ROMA 1 - 00100 ROMA (RM)',
  ateco: '86.90.42 Servizi di ambulanza',
  attivaDal: '10/03/2010',
  statoAttivita: 'Attiva',
  fatturato: 3_000_000,
  annoBilancio: 2025,
  trendFatturato: null,
  utile: 120_000,
  patrimonioNetto: 900_000,
  ebitda: null,
  dipendenti: 200,
  rating: null,
  lineaCreditoConsigliata: null,
  unitaLocali: [],
};

const DATI: DatiCreditoMotore = {
  fatturato: 3_000_000,
  annoBilancio: 2025,
  patrimonioNetto: 900_000,
  utile: 120_000,
  inizioAttivita: '2010-03-10',
  rating: null,
  formaCodice: 'SC',
  attiva: true,
  cessata: false,
  capitaleSociale: 50_000,
  dipendenti: 200,
  bilanciConRicavi: [2025, 2024],
  atecoCodice: '86.90.42',
};

const EVENTI_ASSENTI: EventiRicerca = {
  stato: 'assenti', id: 'ev-1', avviata: null, chiusa: null, codice: '01234567890', daRegistro: true, mail: 'non-serve',
};

const ricerca = (dati: Partial<DatiCreditoMotore> = {}, segnali: SegnaliPrefiltro | null = null): RicercaSalvata => ({
  id: 'r-1',
  piva: SCHEDA.piva,
  ragione_sociale: SCHEDA.ragioneSociale,
  dati_credito: { dati: { ...DATI, ...dati }, scheda: SCHEDA },
  eventi: EVENTI_ASSENTI,
  segnali,
});

const CATEGORIE: Categoria[] = [
  { nome: 'Postazioni di lavoro', settoriTipici: [], postazione: true, ledwall: false },
  { nome: 'Periferiche e tablet', settoriTipici: [], postazione: false, ledwall: false },
];

const voce = (codice: string, nome: string, categoria: string, prezzo: number): VoceCatalogo => ({
  id: 1, codice, nome, descrizione: null, prezzo, attributi: { categoria, valido_fino: null }, ordine: 0, attivo: true,
});

const VOCI: VoceCatalogo[] = [
  voce('TAB-S10', 'Tablet Samsung Galaxy Tab S10 FE WiFi 128GB', 'Periferiche e tablet', 560),
  voce('AIO-MSI', 'PC all in one MSI Pro AM242 TP 1M SSD 512GB 8GB W11', 'Postazioni di lavoro', 1_800),
];

// La configurazione di Led Office (spec, paragrafo 4): Econocom, Grenke spento, Pagarent col 5%
const LO: CanaleConfig[] = [
  { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000 },
  {
    canale: 'grenke', attivo: false, tabella: 'pioneer', maggiorazionePerc: 0,
    soloCapitali: true, formeEscluse: ['RS'], anniMin: 2, settoriEsclusi: [], sogliaProvvisorio: 50_000,
  },
  { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 },
];

const VENDITA = {
  amministratore: { nome: 'Mario Rossi', nascita: '15/03/1979', codiceFiscale: 'RSSMRA79C15H501Z', residenza: 'Via Verdi 3, Roma' },
  telefono: '+39 333 1234567',
  email: 'mario.rossi@example.it',
  riferimento: { nome: 'Anna Bianchi', telefono: '081 1234567' },
  iban: 'IT60X0542811101000000123456',
  sdi: 'ABC1234',
  pec: 'alfa@pec.example.it',
};

/** Il caso CIS nei numeri: 137.750 di beni su Pagarent, maggiorazione 6.888, imponibile 144.638 */
const CORPO = {
  righe: [
    { codice: 'TAB-S10', quantita: 70 },
    { codice: 'AIO-MSI', quantita: 50, prezzo: 1_971 },
  ],
  consegna: { tipo: 'sede', indirizzo: SCHEDA.sede },
  motivazioni: {},
  ledwallConfermato: false,
  vendita: VENDITA,
};

function calcoloDa(
  corpo: Record<string, unknown>,
  dati: Partial<DatiCreditoMotore> = {},
  segnali: SegnaliPrefiltro | null = null,
): CalcoloDistinta {
  const esito = componiCalcolo(ricerca(dati, segnali), { categorie: CATEGORIE, canali: LO }, VOCI, corpo, OGGI);
  if (!esito.ok) throw new Error(`distinta rifiutata: ${esito.error}`);
  return esito.calcolo;
}

const calcolo = calcoloDa(CORPO);
/** Cliente oltre 5 milioni, beni oltre 150.000: Econocom, senza maggiorazione */
const calcoloEconocom = calcoloDa(
  { ...CORPO, righe: [{ codice: 'TAB-S10', quantita: 70 }, { codice: 'AIO-MSI', quantita: 60, prezzo: 1_971 }] },
  { fatturato: 6_000_000 },
);

const EMME2: SocietaFornitrice = {
  ragioneSociale: 'EMME 2 SERVIZI S.R.L.',
  piva: '07000311212',
  rea: 'CE-000000',
  indirizzo: 'Via Nazionale Appia 17 - 81028 Santa Maria a Vico (CE)',
  telefono: '0823 80 91 64',
  email: 'info@emme2servizi.it',
  pec: '',
  logo: 'brand/emme2.jpg',
};

const LO_K: Carrozzeria = {
  slug: 'led-office', nome: 'Led Office', citta: 'Santa Maria a Vico', prefisso: 'LO', organizationId: 'org-lo',
  tabellaCanoni: 'pagarent', brand: { logo: 'brand/led-office.png', colore: '#1D1D1B', accento: '#D03948' },
  settore: 'distinta', etichettaBene: 'Bene', partnerLeasing: 'alba', sogliaLeasing: 0,
  tettoMeseEuro: 100, demo: false, documentiExtra: [], attivo: true,
  tabellaAlternativa: null, regoleSemaforo: 'prefiltro', leasing: false, prezzoVerifica: 5,
  canali: LO, societaFornitrice: EMME2, checklist: null, categorie: CATEGORIE,
};

const CONTESTO: Contesto = {
  userId: 'u-agente', email: 'agente@example.it', nome: 'Gino Agente', ruolo: 'agente',
  organizationId: 'org-lo', fornitoreSlug: 'led-office', fornitoreNome: 'Led Office', fornitoreCitta: null,
  tabellaCanoni: null, prefisso: 'LO', brandLogo: null, brandColore: null, brandAccento: null,
};

const SESSIONE = { ok: true as const, contesto: CONTESTO, carrozzeria: LO_K, vedeTutto: false };

/** Quello che referente e agente non devono mai leggere */
const RISERVATO = /pagarent|grenke|econocom|rete ?rent|maggiorazione|imponibile|riservato|SERVIZI DI TRASPORTO|\/mcf\//i;

describe('il percorso e il blocco riservato', () => {
  it('il percorso riservato sta sotto /mcf/', () =>
    expect(percorsoRiservato('led-office', 'LO-1', 'proposta-locatore-LO-1.pdf'))
      .toBe('preventivi/led-office/LO-1/mcf/proposta-locatore-LO-1.pdf'));

  it('riservatoProposta porta canale, maggiorazione e percorso del locatore', () => {
    const doc = { nome: 'proposta-locatore-LO-1.pdf', pathname: 'preventivi/led-office/LO-1/mcf/proposta-locatore-LO-1.pdf' };
    expect(riservatoProposta(calcolo, doc)).toEqual({
      canale: 'pagarent', beni: 137_750, maggiorazione: 6_888, imponibile: 144_638, documenti: [doc],
    });
    expect(riservatoProposta(calcoloEconocom, null)).toMatchObject({ canale: 'econocom', maggiorazione: 0, documenti: [] });
  });

  it('senza instradamento non c\'e\' niente da riservare', () =>
    expect(() => riservatoProposta({ ...calcolo, instradamento: null }, null)).toThrow());
});

describe('cosa si scrive per il commerciale', () => {
  it('descrizione: numero di righe, primo bene e altri', () => {
    expect(descrizioneDistinta(calcolo.distinta)).toBe('2 righe, Tablet Samsung Galaxy Tab S10 FE WiFi 128GB e altri');
    const una = calcoloDa({ ...CORPO, righe: [{ codice: 'TAB-S10', quantita: 3 }] });
    expect(descrizioneDistinta(una.distinta)).toBe('1 riga, Tablet Samsung Galaxy Tab S10 FE WiFi 128GB');
  });

  it('numeri: lo schermo del commerciale con la scelta a 60 mesi', () => {
    const n = numeriProposta(calcolo);
    const sessanta = n.rate!.find((r) => r.durata === 60)!;
    expect(n.scelta).toEqual({ durata: 60, canone: sessanta.canone });
    expect(n.totaleBeni).toBe(137_750);
    expect(n.bloccata).toBe(false);
  });

  it('dati: righe, consegna, motivazioni, spunta LEDwall e dati di vendita', () => {
    const d = datiProposta(calcolo);
    expect(d.righe).toEqual(calcolo.distinta.righe);
    expect(d.consegna).toEqual({ tipo: 'sede', indirizzo: SCHEDA.sede });
    expect(d.motivazioni).toEqual({});
    expect(d.ledwallConfermato).toBe(false);
    expect(d.vendita).toEqual(calcolo.datiVendita);
  });

  it('dati: solo le motivazioni che il prefiltro chiede e che sono scritte', () => {
    const c = calcoloDa(
      { ...CORPO, motivazioni: { perdita: 'Ha appena firmato un appalto triennale con la ASL.' } },
      { utile: -20_000 },
    );
    expect(c.prefiltro.motivazioniRichieste.map((m) => m.chiave)).toEqual(['perdita']);
    // Una chiave non richiesta infilata nel calcolo non passa
    const sporco = { ...c, motivazioni: { ...c.motivazioni, addetti: 'scritta ma non richiesta, non deve restare' } };
    expect(datiProposta(sporco).motivazioni).toEqual({ perdita: 'Ha appena firmato un appalto triennale con la ASL.' });
  });

  it('ne\' dati ne\' numeri portano canale, maggiorazione, imponibile o la riga servizi', () => {
    for (const c of [calcolo, calcoloEconocom]) {
      for (const testo of [JSON.stringify(datiProposta(c)), JSON.stringify(numeriProposta(c))]) {
        expect(testo).not.toMatch(RISERVATO);
        expect(testo).not.toContain('6888');
        expect(testo).not.toContain('144638');
      }
    }
  });
});

describe('la mail a MCF', () => {
  const segnali: SegnaliPrefiltro = {
    segnalato: null,
    praticaRecente: { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' },
  };
  const conFuoriListino = calcoloDa(
    {
      ...CORPO,
      righe: [
        ...CORPO.righe,
        { descrizione: 'Staffa a muro', categoria: 'Periferiche e tablet', quantita: 2, prezzo: 120 },
      ],
      motivazioni: { perdita: 'Ha appena firmato un appalto triennale con la ASL.' },
    },
    { utile: -20_000 },
    segnali,
  );

  const mail = (c: CalcoloDistinta, avviso: string | null = null, locatore: 'allegata' | 'non-generate' | 'errore' = 'allegata') =>
    corpoMailDistinta({ k: LO_K, agente: { nome: 'Gino Agente', email: 'agente@example.it' }, c, id: 'LO-20261020-101500', avviso, locatore });

  it('porta canale, beni, maggiorazione e imponibile', () => {
    const m = mail(calcolo);
    expect(m.html).toContain('Pagarent');
    expect(m.html).toContain('137.750,00 euro');
    expect(m.html).toContain('6.888 euro');
    expect(m.html).toContain('144.638,00 euro');
    expect(m.subject).toContain('Led Office');
    expect(m.subject).toContain('Alfa Soccorsi');
  });

  it('righe con listino e trattato, fuori listino segnate', () => {
    const m = mail(conFuoriListino);
    expect(m.html).toContain('1.800,00');
    expect(m.html).toContain('1.971,00');
    expect(m.html).toContain('Staffa a muro');
    expect(m.html).toMatch(/fuori listino/i);
  });

  it('motivazioni, criteri del prefiltro e pratica recente con data, canale e fornitore', () => {
    const m = mail(conFuoriListino);
    expect(conFuoriListino.prefiltro.bloccaProposta).toBe(false);
    expect(m.html).toContain('Ha appena firmato un appalto triennale con la ASL.');
    expect(conFuoriListino.prefiltro.criteri.length).toBeGreaterThan(0);
    for (const cr of conFuoriListino.prefiltro.criteri) expect(m.html).toContain(escapeHtml(cr.nome));
    expect(m.html).toContain('28/07/2026');
    expect(m.html).toContain('led-office');
    expect(m.html).toMatch(/Pratica recente/);
  });

  it('il cliente segnalato da MCF con motivo ed effetto', () => {
    const c = calcoloDa(CORPO, {}, { segnalato: { motivo: 'sofferenze', effetto: 'rosso' }, praticaRecente: null });
    expect(mail(c).html).toMatch(/sofferenze/);
  });

  it('l\'avviso sui PDF finisce nella mail', () =>
    expect(mail(calcolo, 'I PDF non si sono salvati tutti').html).toContain('I PDF non si sono salvati tutti'));

  describe('la riga sulla proposta per il locatore dice cosa e\' allegato davvero', () => {
    it('allegata con la maggiorazione: solo per MCF, porta la riga servizi', () => {
      const html = mail(calcolo, null, 'allegata').html;
      expect(html).toContain('La proposta per il locatore allegata è solo per MCF');
      expect(html).toContain('riga servizi');
    });

    it('allegata senza maggiorazione (Econocom): solo per MCF, nessuna riga servizi', () => {
      expect(calcoloEconocom.instradamento!.maggiorazione).toBe(0);
      const html = mail(calcoloEconocom, null, 'allegata').html;
      expect(html).toContain('La proposta per il locatore allegata è solo per MCF');
      expect(html).not.toContain('riga servizi');
    });

    it('senza dati di vendita: le due proposte non ci sono, in allegato solo il preventivo del canone', () => {
      const senzaVendita = calcoloDa({ ...CORPO, vendita: undefined });
      const html = mail(senzaVendita, null, 'non-generate').html;
      expect(html).not.toContain('allegata è solo per MCF');
      expect(html).not.toContain('riga servizi');
      expect(html).toContain('Proposta di vendita e proposta per il locatore non generate');
      expect(html).toContain('In allegato solo il preventivo del canone');
      expect(html).not.toContain('proposta allegata');
    });

    it('PDF non generati: nessun allegato, lo dice', () => {
      const html = mail(calcolo, 'I PDF non sono stati generati', 'errore').html;
      expect(html).not.toContain('allegata è solo per MCF');
      expect(html).toContain('Nessun PDF in allegato');
      expect(html).not.toContain('proposta allegata');
    });
  });
});

describe('generaPreventivoDistinta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.env.mockImplementation((nome: string) => (nome === 'BLOB_READ_WRITE_TOKEN' ? 'tok-finto' : undefined));
    db.query.mockImplementation(async (sql: string, valori: unknown[]) =>
      sql.trim().startsWith('INSERT') ? [{ id: valori[0] }] : []);
    blob.put.mockImplementation(async (pathname: string) => ({ pathname }));
    pv.salvaPdf.mockImplementation(async (slug: string, id: string, pdf: { filename: string; contenuto: string }[]) =>
      pdf.map((f) => ({ nome: f.filename, pathname: `preventivi/${slug}/${id}/${f.filename}`, size: 10 })));
    posta.inviaMail.mockResolvedValue({ ok: true, id: 'm-1' });
    loghi.logoDaBlob.mockResolvedValue(null);
  });

  const insert = () => db.query.mock.calls.find(([sql]) => String(sql).trim().startsWith('INSERT'))!;
  const update = () => db.query.mock.calls.find(([sql]) => String(sql).trim().startsWith('UPDATE'))!;

  it('cliente rosso o motivazioni mancanti: proposta bloccata, nessuna scrittura', async () => {
    const senzaMotivazione = calcoloDa(CORPO, { utile: -20_000 });
    expect(senzaMotivazione.prefiltro.bloccaProposta).toBe(true);
    expect(await generaPreventivoDistinta(SESSIONE, senzaMotivazione, {})).toEqual({ ok: false, error: 'proposta_bloccata' });
    expect(await generaPreventivoDistinta(SESSIONE, { ...calcolo, instradamento: null }, {}))
      .toEqual({ ok: false, error: 'proposta_bloccata' });
    // Il blocco del prefiltro conta da solo, anche con un canale in mano
    expect(await generaPreventivoDistinta(SESSIONE, { ...calcolo, prefiltro: { ...calcolo.prefiltro, bloccaProposta: true } }, {}))
      .toEqual({ ok: false, error: 'proposta_bloccata' });
    expect(db.query).not.toHaveBeenCalled();
    expect(blob.put).not.toHaveBeenCalled();
    expect(posta.inviaMail).not.toHaveBeenCalled();
  });

  it('la riga in app.proposta: colonne della distinta, canale e riservato a parte', async () => {
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(r.ok).toBe(true);
    const [sql, v] = insert();
    expect(sql).toMatch(/canale/);
    expect(sql).toMatch(/riservato/);
    const [id, slug, org, user, ricercaId, piva, nome, voceCodice, descrizione, prezzo, semaforo, anticipo, markup, dati, numeri, canale, riservato] = v as unknown[];
    expect(id).toBe(r.id);
    expect(id).toMatch(/^LO-\d{8}-\d{6}$/);
    expect([slug, org, user, ricercaId, piva, nome]).toEqual(['led-office', 'org-lo', 'u-agente', 'r-1', '01234567890', 'Alfa Soccorsi Soc. Coop.']);
    expect(voceCodice).toBeNull();
    expect(descrizione).toBe('2 righe, Tablet Samsung Galaxy Tab S10 FE WiFi 128GB e altri');
    expect([prezzo, semaforo, anticipo, markup]).toEqual([137_750, 'verde', 0, 0]);
    expect(JSON.parse(String(dati))).toEqual(JSON.parse(JSON.stringify(datiProposta(calcolo))));
    expect(JSON.parse(String(numeri))).toEqual(JSON.parse(JSON.stringify(numeriProposta(calcolo))));
    expect(canale).toBe('pagarent');
    expect(JSON.parse(String(riservato))).toEqual({ canale: 'pagarent', beni: 137_750, maggiorazione: 6_888, imponibile: 144_638, documenti: [] });
  });

  it('PDF del commerciale nella cartella della proposta, proposta per il locatore nella riservata', async () => {
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    const [slug, id, pdf] = pv.salvaPdf.mock.calls[0];
    expect([slug, id]).toEqual(['led-office', r.id]);
    expect(pdf.map((f: { filename: string }) => f.filename)).toEqual([`preventivo-canone-${r.id}.pdf`, `proposta-vendita-${r.id}.pdf`]);

    expect(blob.put).toHaveBeenCalledTimes(1);
    const [pathname, corpo, opzioni] = blob.put.mock.calls[0];
    // Il nome sullo store ha un pezzo casuale: dall'id della proposta non si ricava
    expect(pathname).toMatch(new RegExp(`^preventivi/led-office/${r.id}/mcf/proposta-locatore-${r.id}-[0-9a-f]{16}\\.pdf$`));
    expect(Buffer.from(corpo).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(opzioni).toMatchObject({ access: 'private', contentType: 'application/pdf', allowOverwrite: true, addRandomSuffix: false, token: 'tok-finto' });

    const [sqlU, vU] = update();
    expect(sqlU).toMatch(/documenti/);
    expect(sqlU).toMatch(/pdf_pronti/);
    expect(sqlU).toMatch(/riservato/);
    const [idU, documenti, pronti, riservato] = vU as unknown[];
    expect(idU).toBe(r.id);
    expect(JSON.parse(String(documenti))).toEqual([
      { nome: `preventivo-canone-${r.id}.pdf`, pathname: `preventivi/led-office/${r.id}/preventivo-canone-${r.id}.pdf` },
      { nome: `proposta-vendita-${r.id}.pdf`, pathname: `preventivi/led-office/${r.id}/proposta-vendita-${r.id}.pdf` },
    ]);
    expect(pronti).toBe(true);
    // Nel riservato il percorso vero, quello col pezzo casuale; il nome resta quello leggibile
    expect(JSON.parse(String(riservato)).documenti).toEqual([{ nome: `proposta-locatore-${r.id}.pdf`, pathname }]);
  });

  it('il percorso della proposta per il locatore non si ricava dall\'id: cambia a ogni proposta', async () => {
    const percorsi: string[] = [];
    for (let i = 0; i < 2; i++) {
      blob.put.mockClear();
      const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
      const [pathname] = blob.put.mock.calls[0];
      expect(pathname).not.toBe(percorsoRiservato('led-office', r.id!, `proposta-locatore-${r.id}.pdf`));
      percorsi.push(String(pathname).replace(r.id!, 'ID').replace(r.id!, 'ID'));
    }
    // Stesso id a parte, i due percorsi differiscono nel pezzo casuale
    expect(percorsi[0]).not.toBe(percorsi[1]);
  });

  it('la mail a MCF porta tutti e tre i PDF e passa da inviaMail', async () => {
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(posta.inviaMail).toHaveBeenCalledTimes(1);
    const opzioni = posta.inviaMail.mock.calls[0][0];
    expect(opzioni.to).toBe('mediocreditofacile@gmail.com');
    expect(opzioni.allegati.map((a: { filename: string }) => a.filename)).toEqual([
      `preventivo-canone-${r.id}.pdf`, `proposta-vendita-${r.id}.pdf`, `proposta-locatore-${r.id}.pdf`,
    ]);
    expect(opzioni.html).toContain('6.888 euro');
  });

  it('la risposta al commerciale: id, PDF suoi, nessun canale, nessun percorso riservato', async () => {
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(r).toEqual({
      ok: true,
      id: r.id,
      pdfPronti: true,
      documenti: [
        { nome: `preventivo-canone-${r.id}.pdf`, pathname: `preventivi/led-office/${r.id}/preventivo-canone-${r.id}.pdf` },
        { nome: `proposta-vendita-${r.id}.pdf`, pathname: `preventivi/led-office/${r.id}/proposta-vendita-${r.id}.pdf` },
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(RISERVATO);
  });

  it('i loghi: il marchio della carrozzeria e quello della societa\' che vende', async () => {
    await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(loghi.logoDaBlob.mock.calls.map(([p]) => p).sort()).toEqual(['brand/emme2.jpg', 'brand/led-office.png']);
  });

  it('senza dati di vendita: solo il preventivo del canone, niente proposta per il locatore', async () => {
    const senzaVendita = calcoloDa({ ...CORPO, vendita: undefined });
    const r = await generaPreventivoDistinta(SESSIONE, senzaVendita, {});
    expect(r.pdfPronti).toBe(true);
    expect(r.documenti!.map((d) => d.nome)).toEqual([`preventivo-canone-${r.id}.pdf`]);
    expect(blob.put).not.toHaveBeenCalled();
    expect(JSON.parse(String(update()[1][3])).documenti).toEqual([]);
    expect(posta.inviaMail.mock.calls[0][0].allegati).toHaveLength(1);
    expect(posta.inviaMail.mock.calls[0][0].html).not.toContain('allegata è solo per MCF');
    expect(posta.inviaMail.mock.calls[0][0].html).toContain('In allegato solo il preventivo del canone');
  });

  it('la proposta per il locatore non si salva: la riga resta, pdf_pronti falso, la mail parte e lo dice', async () => {
    blob.put.mockRejectedValueOnce(new Error('store giu'));
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(r.ok).toBe(true);
    expect(r.pdfPronti).toBe(false);
    const [, vU] = update();
    expect(vU[2]).toBe(false);
    expect(JSON.parse(String(vU[3])).documenti).toEqual([]);
    const opzioni = posta.inviaMail.mock.calls[0][0];
    expect(opzioni.allegati).toHaveLength(3);
    expect(opzioni.html).toMatch(/non si sono salvati/);
  });

  it('un PDF del commerciale non si salva: pdf_pronti falso', async () => {
    pv.salvaPdf.mockImplementationOnce(async (slug: string, id: string, pdf: { filename: string }[]) =>
      [{ nome: pdf[0].filename, pathname: `preventivi/${slug}/${id}/${pdf[0].filename}`, size: 10 }]);
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(r.pdfPronti).toBe(false);
    expect(r.documenti).toHaveLength(1);
    expect(posta.inviaMail.mock.calls[0][0].html).toMatch(/non si sono salvati/);
  });

  it('id gia\' preso: si aggiunge un suffisso, come sugli altri settori', async () => {
    let primo = true;
    db.query.mockImplementation(async (sql: string, valori: unknown[]) => {
      if (!sql.trim().startsWith('INSERT')) return [];
      if (primo) { primo = false; return []; }
      return [{ id: valori[0] }];
    });
    const r = await generaPreventivoDistinta(SESSIONE, calcolo, {});
    expect(r.id).toMatch(/^LO-\d{8}-\d{6}-2$/);
  });
});
