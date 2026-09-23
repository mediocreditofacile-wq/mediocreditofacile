import { describe, it, expect } from 'vitest';
import { leggiReport, sintesiReport } from './report-persona';

// Dati sintetici con la forma del report reale: nessun dato di persone vere nel repo
const avvolgi = (ROOT: any) => ({ state: 'completed', reportData: { xml: { ROOT } } });

describe('leggiReport', () => {
  it('un solo elemento arriva come oggetto e va letto come elenco di uno', () => {
    const r = leggiReport(avvolgi({
      Cointeressenze: { Cointeressenze_Esponente: { Cointeressenze_Impresa: {
        Cointeressenze_RagSoc: 'Alfa Srl', Cointeressenze_DesCar: 'Amministratore Unico', Cointeressenze_DatIniCar: '09/10/2023', Cointeressenze_StaCar: 'A',
      } } },
      Partecipazioni: { Partecipazioni_Soggetto: { Partecipazioni_Nominativo: 'Beta Snc', Partecipazioni_PercPoss: '50,00', Partecipazioni_ImpQuota: '5000', Partecipazioni_DesVal: 'Eur' } },
    }))!;
    expect(r.cariche).toHaveLength(1);
    expect(r.cariche[0]).toMatchObject({ societa: 'Alfa Srl', ruolo: 'Amministratore Unico', dal: '09/10/2023' });
    expect(r.partecipazioni[0]).toMatchObject({ societa: 'Beta Snc', percentuale: '50,00', quota: '5000 Eur' });
  });

  it('i campi vuoti arrivano come [] e diventano stringa vuota', () => {
    const r = leggiReport(avvolgi({
      Partecipazioni: { Partecipazioni_Soggetto: [{ Partecipazioni_Nominativo: 'Gamma', Partecipazioni_PercPoss: [] }] },
      Protesti: [], Constatazioni: [],
    }))!;
    expect(r.partecipazioni[0].percentuale).toBe('');
    expect(r.protesti).toEqual([]);
  });

  it('immobili dal catasto e sintesi a una riga', () => {
    const r = leggiReport(avvolgi({
      Catasto: {
        Catasto_Testa: { Catasto_Testa_Dati: [{ Catasto_DesComIstat: 'X', Catasto_DesTipImm: 'Fabbricati', Catasto_NumImm: '2' }] },
        Catasto_Dettagli: { Catasto_Dettagli_Dati: [{ Catasto_Det_DesComIstat: 'X', Catasto_Det_DesDirImm: "Proprieta' per 1/1" }, { Catasto_Det_DesComIstat: 'X' }] },
      },
      Protesti: { Protesti_Data: '01/01/2025', Protesti_Importo: '1000' },
    }))!;
    expect(r.immobili).toHaveLength(2);
    expect(r.protesti[0].campi).toContainEqual(['Importo', '1000']);
    expect(sintesiReport(r)).toBe('0 cariche · 0 partecipazioni · 2 immobili · 1 eventi negativi');
  });

  it('report senza reportData: null', () => {
    expect(leggiReport({ state: 'completed' })).toBeNull();
  });
});
