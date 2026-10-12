// Lettura della scheda Openapi per il motore dei portali.
//
// Due cose da proteggere: il patrimonio netto si legge da IT-full e non da
// IT-advanced (che chiama "netWorth" l'utile), e all'agente non arrivano ne'
// gli eventi negativi ne' i dati personali di soci e amministratori (codice
// fiscale, data e luogo di nascita).

import { describe, expect, it } from 'vitest';
import { leggiScheda } from './merito';

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
