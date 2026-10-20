// Lettura della scheda Openapi per il motore dei portali.
//
// Due cose da proteggere: il patrimonio netto si legge da IT-full e non da
// IT-advanced (che chiama "netWorth" l'utile), e all'agente non arrivano ne'
// gli eventi negativi ne' i dati personali di soci e amministratori (codice
// fiscale, data e luogo di nascita).

import { describe, expect, it } from 'vitest';
import PAYLOAD_FULL from '../../../scripts/openapi/payload-IT-full.json';
import PAYLOAD_ADVANCED from '../../../scripts/openapi/payload-IT-advanced.json';
import { bilanciConRicaviDa, datiLocatore, leggiScheda, unitaLocaliDa } from './merito';

const SCHEDA = {
  trovata: true,
  piva: '01234567890',
  negativitaId: 'neg-1',
  full: {
    companyDetails: { companyName: 'ESEMPIO SRL', vatCode: '01234567890' },
    ecofin: { turnover: 850000, turnoverYear: 2024, turnoverTrend: 4.2, netWorth: 310000, shareCapital: 10000 },
    operatingResults: { ebitda: 95000 },
    employees: { employee: 12 },
    annualResult: [{ code: 'IIC179', value: 41000 }],
    address: { streetName: 'Via Roma 1', town: 'Vicenza', province: { code: 'VI', description: 'Vicenza' } },
    companyStatus: { activityStatus: { code: 'A', description: 'Attiva' } },
    managers: [{
      name: 'MARIO', surname: 'ROSSI', taxCode: 'RSSMRA70A01L840X', birthDate: '1970-01-01', birthTown: 'VICENZA',
      age: 56, isLegalRepresentative: true, roles: [{ role: { code: 'AU', description: 'Amministratore unico' } }],
    }],
    netWorth: [{ code: 'IIC001', value: 1000 }],
  },
  advanced: {
    companyName: 'ESEMPIO SRL',
    // IT-advanced chiama netWorth l'utile: non deve finire nel patrimonio
    balanceSheets: { last: { netWorth: 41000 } },
    startDate: '2009-05-31T22:00:00.000Z',
    detailedLegalForm: { description: 'SOCIETA\' A RESPONSABILITA\' LIMITATA' },
    atecoClassification: { ateco: { code: '43.21.01', description: 'Installazione di impianti elettrici' } },
    address: { registeredOffice: { streetName: 'Via Roma 1', town: 'Vicenza', province: 'VI' } },
  },
  score: { rating: 'B1', risk_score_description: 'Rischio medio basso', operational_credit_limit: 120000 },
  soci: [{ name: 'MARIO', surname: 'ROSSI', taxCode: 'RSSMRA70A01L840X', percentShare: 60 },
         { companyName: 'HOLDING ESEMPIO SPA', taxCode: '09876543210', percentShare: 40 }],
};

describe('leggiScheda', () => {
  const { dati, scheda, info } = leggiScheda(SCHEDA as any);

  it('i numeri del semaforo arrivano dai campi giusti', () => {
    expect(dati.fatturato).toBe(850000);
    expect(dati.patrimonioNetto).toBe(310000);
    expect(dati.utile).toBe(41000);
    // mezzanotte italiana in UTC: e' il primo giugno, non il 31 maggio
    expect(dati.inizioAttivita).toBe('2009-06-01');
    expect(dati.rating).toBe('B1');
  });

  it('la scheda ridotta e\' leggibile', () => {
    expect(scheda.ragioneSociale).toBe('ESEMPIO SRL');
    expect(scheda.sede).toBe('Via Roma 1, Vicenza (VI)');
    expect(scheda.attivaDal).toBe('01/06/2009');
    expect(scheda.rating).toEqual({ classe: 'B1', posizione: 4, descrizione: 'Rischio medio basso' });
    expect(scheda.ateco).toMatch(/^43\.21\.01/);
  });

  it('soci e amministratori senza codice fiscale ne\' dati di nascita', () => {
    expect(info.soci).toEqual([
      { nome: 'Mario Rossi', quota: 60, persona: true },
      { nome: 'HOLDING ESEMPIO SPA', quota: 40, persona: false },
    ]);
    expect(info.amministratori[0]).toMatchObject({ nome: 'Mario Rossi', legaleRappresentante: true, eta: 56 });
    const tutto = JSON.stringify({ scheda, info });
    expect(tutto).not.toContain('RSSMRA70A01L840X');
    expect(tutto).not.toContain('1970-01-01');
    expect(tutto).not.toMatch(/VICENZA/);
  });

  it('niente eventi negativi', () => {
    expect(JSON.stringify({ scheda, info })).not.toMatch(/neg-1|negativ/i);
  });

  it('il bilancio riclassificato esce con le descrizioni della legenda', () => {
    const pn = info.bilancio.find((b) => b.voci.some((v) => v.etichetta === 'A. Crediti verso soci'));
    expect(pn).toBeDefined();
    expect(info.bilancio[0].voci[0].etichetta).toMatch(/^21\. Utile/);
  });
});

describe('dati per il semaforo del locatore', () => {
  const conAnagrafica = (adv: Record<string, unknown>) =>
    leggiScheda({ ...SCHEDA, advanced: { ...SCHEDA.advanced, ...adv } } as any).dati;

  it('forma, stato e cessazione', () => {
    const d = conAnagrafica({
      detailedLegalForm: { code: 'SR', description: "SOCIETA' A RESPONSABILITA' LIMITATA" },
      activityStatus: 'ATTIVA', endDate: null, taxCodeCeased: false,
    });
    expect(d.formaCodice).toBe('SR');
    expect(d.attiva).toBe(true);
    expect(d.cessata).toBe(false);
  });

  it('una data di cessazione o un codice fiscale cessato chiudono l azienda', () => {
    expect(conAnagrafica({ endDate: '2025-06-30' }).cessata).toBe(true);
    expect(conAnagrafica({ taxCodeCeased: true }).cessata).toBe(true);
  });

  it('uno stato diverso da ATTIVA vale non attiva', () => {
    expect(conAnagrafica({ activityStatus: 'IN LIQUIDAZIONE' }).attiva).toBe(false);
  });

  it('senza stato in IT-advanced si legge IT-full', () => {
    expect(conAnagrafica({ activityStatus: undefined }).attiva).toBe(true);
  });

  it('il volume d affari zero resta zero', () => {
    const d = leggiScheda({ ...SCHEDA, full: { ...SCHEDA.full, ecofin: { ...SCHEDA.full.ecofin, turnover: 0 } } } as any).dati;
    expect(datiLocatore(d).volumeAffari).toBe(0);
  });

  it('una ricerca salvata prima del 15/10 non ha la forma: dato mancante', () => {
    const d = datiLocatore({ fatturato: 100, patrimonioNetto: 50, annoBilancio: 2025, inizioAttivita: '2010-01-01' });
    expect(d.formaCodice).toBeNull();
    expect(d.attiva).toBeNull();
    expect(d.cessata).toBe(false);
  });
});

describe('bilancio tutto a zero', () => {
  const base = { formaCodice: 'SR', attiva: true, cessata: false, inizioAttivita: '2010-01-01', annoBilancio: 2025 };
  it('volume, patrimonio e utile a zero valgono come bilancio non depositato', () => {
    const d = datiLocatore({ ...base, fatturato: 0, patrimonioNetto: 0, utile: 0 });
    expect(d.annoBilancio).toBeNull();
    expect(d.volumeAffari).toBeNull();
    expect(d.patrimonioNetto).toBeNull();
  });
  it('volume zero con patrimonio e perdita resta un dato vero (societa ferma)', () => {
    const d = datiLocatore({ ...base, fatturato: 0, patrimonioNetto: 9092, utile: -907, annoBilancio: 2024 });
    expect(d.volumeAffari).toBe(0);
    expect(d.annoBilancio).toBe(2024);
  });
});

// I payload veri di una scheda (Latteria di Soligo) salvati in scripts/openapi/.
// Come in caricaScheda(): IT-full e' l'oggetto in `data`, IT-advanced il primo
// elemento della lista in `data`.
describe('dati per il prefiltro', () => {
  const full: any = PAYLOAD_FULL.data;
  const advanced: any = (PAYLOAD_ADVANCED.data as any[])[0];
  const schedaDiProva: any = { trovata: true, piva: '00178340261', full, advanced, score: null, soci: [] };

  it('capitale sociale da IT-full ecofin, non da IT-advanced', () => {
    // IT-advanced dice 0 per lo stesso capitale
    expect(advanced.balanceSheets.last.shareCapital).toBe(0);
    expect(leggiScheda(schedaDiProva).dati.capitaleSociale).toBe(2_083_126);
  });

  it('unita\' locali: solo quelle attive, UL e SSL, con indirizzo leggibile', () => {
    const u = unitaLocaliDa(full);
    // 24 UL attive + 1 SSL attiva; le 11 UL cessate (stato CF) restano fuori
    expect(u).toHaveLength(25);
    expect(u.every((x) => /\(\w\w\)$/.test(x))).toBe(true);
    expect(u).toContain('VIA GIROLAMO BORTOTTI, 25, 32100 BELLUNO (BL)');
    // la sede secondaria attiva c'e', l'unita' cessata no
    expect(u).toContain('VIA I SETTEMBRE, 32, 31010 FARRA DI SOLIGO (TV)');
    expect(u).not.toContain('VIA MATTEOTTI, 3, 36056 TEZZE SUL BRENTA (VI)');
    expect(leggiScheda(schedaDiProva).scheda.unitaLocali).toEqual(u);
  });

  it('unita\' locali: senza allOffices la lista e\' vuota', () => {
    expect(unitaLocaliDa({})).toEqual([]);
    expect(unitaLocaliDa(undefined)).toEqual([]);
  });

  it('unita\' locali: una sede senza indirizzo non diventa una riga vuota', () => {
    const u = unitaLocaliDa({ allOffices: [
      { companyDetails: { officeType: { code: 'UL' } }, companyStatus: { activityStatus: { code: 'A' } }, address: {} },
      { companyDetails: { officeType: { code: 'UL' } }, companyStatus: { activityStatus: { code: 'A' } },
        address: { streetName: 'VIA ROMA, 1', zipCode: '36100', town: 'VICENZA' } },
    ] });
    // senza provincia il formato regge: nessuna parentesi vuota
    expect(u).toEqual(['VIA ROMA, 1, 36100 VICENZA']);
  });

  it('bilanci con ricavi: anni con fatturato maggiore di zero, dal piu\' recente', () => {
    const b = bilanciConRicaviDa(advanced)!;
    expect(b[0]).toBe(2025);
    // il 2026 e' l'esercizio in corso: turnover null, non e' un bilancio
    expect(b).not.toContain(2026);
    expect(b).toEqual([...b].sort((x, y) => y - x));
    expect(leggiScheda(schedaDiProva).dati.bilanciConRicavi).toEqual(b);
  });

  it('bilanci con ricavi: l\'ordine non dipende da come arriva la lista', () => {
    const b = bilanciConRicaviDa({ balanceSheets: { all: [
      { year: 2023, turnover: 5 }, { year: 2025, turnover: 7 }, { year: 2024, turnover: 0 }, { year: 2022, turnover: null },
    ] } });
    expect(b).toEqual([2025, 2023]);
  });

  it('senza storico bilanci il dato e\' null, non una lista vuota', () => {
    expect(bilanciConRicaviDa({})).toBeNull();
    expect(bilanciConRicaviDa(undefined)).toBeNull();
    expect(bilanciConRicaviDa({ balanceSheets: {} })).toBeNull();
  });

  it('uno storico presente ma senza nessun anno con ricavi e\' una lista vuota', () => {
    // societa' appena nata: lo storico c'e', ricavi no. Diverso da "storico non disponibile".
    expect(bilanciConRicaviDa({ balanceSheets: { all: [{ year: 2026, turnover: null }] } })).toEqual([]);
  });

  it('ateco come codice puntato e dipendenti da IT-full', () => {
    const d = leggiScheda(schedaDiProva).dati;
    expect(d.atecoCodice).toBe('10.51.2');
    expect(d.dipendenti).toBe(172);
  });

  it('un codice ateco gia\' puntato resta com\'e\'', () => {
    // la scheda di prova in cima al file ha '43.21.01'
    expect(leggiScheda(SCHEDA as any).dati.atecoCodice).toBe('43.21.01');
  });

  it('dati assenti sono null, mai zero', () => {
    const d = leggiScheda({ trovata: true, piva: '01234567890', full: {}, advanced: {}, score: null, soci: [] } as any).dati;
    expect(d.capitaleSociale).toBeNull();
    expect(d.dipendenti).toBeNull();
    expect(d.bilanciConRicavi).toBeNull();
    expect(d.atecoCodice).toBeNull();
  });

  it('un capitale sociale a zero dichiarato in IT-full resta zero', () => {
    // lo zero vero si distingue dall'assenza: e' il caso delle societa' con capitale simbolico
    const d = leggiScheda({ ...SCHEDA, full: { ...SCHEDA.full, ecofin: { ...SCHEDA.full.ecofin, shareCapital: 0 } } } as any).dati;
    expect(d.capitaleSociale).toBe(0);
  });
});
