// Regole dei documenti ufficiali: quale visura si paga, quando si riusa
// l'archivio, come si legge la risposta di DocuEngine. Ogni errore qui e' un
// documento pagato due volte o un documento sbagliato pagato una volta.

import { describe, expect, it } from 'vitest';
import {
  tipoVisura, anniDaRicerca, avanzamento, decidi, resultIdRiusabile, anniValidi, nomeFile,
  TTL_VISURA, ATTESA_MAX_DOC, VITA_RICERCA, TTL_ELENCO_ANNI, VISURA,
  type OrdineDocumento, type RicercaBilanci,
} from './documenti-ufficiali';

const ADESSO = Date.parse('2026-10-07T10:00:00Z');
const fa = (ms: number) => new Date(ADESSO - ms).toISOString();
const ORA = 60 * 60 * 1000;
const GIORNO = 24 * ORA;

describe('tipoVisura', () => {
  it('SRL, SRLS, SPA e cooperative vanno sulla visura delle societa\' di capitali', () => {
    for (const c of ['SR', 'RS', 'SU', 'SP', 'AU', 'SC', 'CO']) expect(tipoVisura(c)).toBe('capitale');
  });
  it('SNC, SAS e societa\' semplice vanno su quella delle societa\' di persone', () => {
    for (const c of ['SN', 'AS', 'SE']) expect(tipoVisura(c)).toBe('persone');
  });
  it('la ditta individuale ha la sua', () => {
    expect(tipoVisura('DI')).toBe('individuale');
    expect(tipoVisura('di ')).toBe('individuale');
  });
  it('senza codice si ricade sulle societa\' di capitali', () => {
    expect(tipoVisura(null)).toBe('capitale');
  });
  it('i prezzi seguono il listino letto il 07/10/2026', () => {
    expect([VISURA.capitale.prezzo, VISURA.persone.prezzo, VISURA.individuale.prezzo]).toEqual([4.9, 3.4, 2.9]);
  });
});

describe('anniDaRicerca', () => {
  // Forma reale della risposta DocuEngine (ricerca su LOGSTOR ITALIA, 07/10/2026)
  const results = [
    { id: 'aaa', data: { balanceSheetId: '16881713', id: '', balanceSheetDate: '1999-12-31', balanceSheetTypeCode: '712', balanceSheetTypeDescription: "BILANCIO ABBREVIATO D'ESERCIZIO" } },
    { id: 'bbb', data: { balanceSheetId: '967760758', id: '', balanceSheetDate: '2025-12-31', balanceSheetTypeCode: '711', balanceSheetTypeDescription: "BILANCIO ORDINARIO D'ESERCIZIO" } },
    { id: 'ccc', data: { balanceSheetId: '906135244', id: '', balanceSheetDate: '2024-12-31', balanceSheetTypeCode: '711', balanceSheetTypeDescription: "BILANCIO ORDINARIO D'ESERCIZIO" } },
    { id: '', data: { balanceSheetId: '1', balanceSheetDate: '2020-12-31' } },
  ];
  it('ordina dal piu\' recente e scarta i risultati senza id', () => {
    const anni = anniDaRicerca(results);
    expect(anni.map((a) => a.anno)).toEqual([2025, 2024, 1999]);
    expect(anni[0]).toMatchObject({ resultId: 'bbb', balanceSheetId: '967760758', tipo: "BILANCIO ORDINARIO D'ESERCIZIO" });
  });
  it('una ricerca vuota da\' un elenco vuoto', () => {
    expect(anniDaRicerca(null)).toEqual([]);
  });
});

describe('avanzamento', () => {
  it('solo DONE e\' pronto', () => {
    expect(avanzamento('DONE')).toBe('pronto');
    expect(avanzamento('SEARCH')).toBe('attesa');
    expect(avanzamento('NEW')).toBe('attesa');
    expect(avanzamento('')).toBe('attesa');
  });
  it('errori e annullamenti chiudono la richiesta', () => {
    for (const s of ['ERROR', 'FAILED', 'CANCELLED', 'REJECTED']) expect(avanzamento(s)).toBe('errore');
  });
});

describe('decidi', () => {
  const pronto = (eta: number): OrdineDocumento => ({
    richiestaId: 'r1', avviato: fa(eta), stato: 'pronto',
    file: [{ percorso: 'openapi/documenti/1/visura.pdf', nome: 'v.pdf', mime: 'application/pdf', dimensione: 1 }],
  });
  it('niente in archivio: si ordina', () => {
    expect(decidi(undefined, TTL_VISURA, ADESSO)).toEqual({ azione: 'ordina', motivo: 'assente' });
  });
  it('visura di 10 giorni: si riapre senza pagare', () => {
    expect(decidi(pronto(10 * GIORNO), TTL_VISURA, ADESSO).azione).toBe('archivio');
  });
  it('visura di 31 giorni: si ripaga', () => {
    expect(decidi(pronto(31 * GIORNO), TTL_VISURA, ADESSO)).toEqual({ azione: 'ordina', motivo: 'scaduto' });
  });
  it('bilancio di un anno fa: senza scadenza, si riapre sempre', () => {
    expect(decidi(pronto(400 * GIORNO), null, ADESSO).azione).toBe('archivio');
  });
  it('pronto ma senza file: non si serve un archivio vuoto', () => {
    expect(decidi({ ...pronto(GIORNO), file: [] }, null, ADESSO).azione).not.toBe('archivio');
  });
  it('in attesa da pochi minuti: si aspetta, non si ripaga', () => {
    expect(decidi({ richiestaId: 'r1', avviato: fa(5 * 60 * 1000), stato: 'attesa' }, TTL_VISURA, ADESSO).azione).toBe('attendi');
  });
  it('in attesa da oltre un\'ora: la richiesta e\' morta, si riordina', () => {
    expect(decidi({ richiestaId: 'r1', avviato: fa(ATTESA_MAX_DOC + 1), stato: 'attesa' }, TTL_VISURA, ADESSO))
      .toEqual({ azione: 'ordina', motivo: 'bloccato' });
  });
  it('ordine fallito: si riordina', () => {
    expect(decidi({ richiestaId: 'r1', avviato: fa(ORA), stato: 'errore' }, null, ADESSO))
      .toEqual({ azione: 'ordina', motivo: 'fallito' });
  });
});

describe('resultIdRiusabile', () => {
  const ricerca = (eta: number, usata = false): RicercaBilanci => ({
    richiestaId: 'req', quando: fa(eta), usata,
    anni: [{ resultId: 'res-2025', balanceSheetId: '967760758', data: '2025-12-31', anno: 2025, tipo: 'x' }],
  });
  it('ricerca fresca e non usata: si spende quella', () => {
    expect(resultIdRiusabile(ricerca(ORA), '967760758', ADESSO)).toBe('res-2025');
  });
  it('ricerca gia\' usata per un altro anno: ne serve una nuova', () => {
    expect(resultIdRiusabile(ricerca(ORA, true), '967760758', ADESSO)).toBeNull();
  });
  it('ricerca troppo vecchia: ne serve una nuova', () => {
    expect(resultIdRiusabile(ricerca(VITA_RICERCA + 1), '967760758', ADESSO)).toBeNull();
  });
  it('esercizio che non e\' in quella ricerca: null', () => {
    expect(resultIdRiusabile(ricerca(ORA), '1', ADESSO)).toBeNull();
  });
});

describe('anniValidi', () => {
  it('l\'elenco si mostra per 30 giorni, poi va riletto', () => {
    const r: RicercaBilanci = { richiestaId: 'x', quando: fa(TTL_ELENCO_ANNI - 1), usata: true, anni: [{ resultId: 'a', balanceSheetId: '1', data: '2025-12-31', anno: 2025, tipo: '' }] };
    expect(anniValidi(r, ADESSO)).toHaveLength(1);
    expect(anniValidi({ ...r, quando: fa(TTL_ELENCO_ANNI + 1) }, ADESSO)).toBeNull();
  });
});

describe('nomeFile', () => {
  it('nome leggibile senza caratteri che rompono il file system', () => {
    expect(nomeFile('LOGSTOR ITALIA S.R.L.', 'Bilancio 2025', 'pdf')).toBe('Bilancio 2025 - LOGSTOR ITALIA S.R.L..pdf');
    expect(nomeFile('A/B "C"', 'Visura', '.pdf')).toBe('Visura - AB C.pdf');
  });
});
