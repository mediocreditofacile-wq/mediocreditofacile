import { describe, expect, it } from 'vitest';
import {
  aziendaFerma, anniCompiuti, classeFormaRicerca, documentiSimulatore, leggiImporto, valutaSimulatore, type DatiEsito,
} from './esito-simulatore';

const OGGI = new Date(2026, 9, 24); // 24/10/2026: il bilancio atteso e' il 2025

const srl = (extra: Partial<DatiEsito> = {}): DatiEsito => ({
  importo: 15_000,
  classe: 'capitali',
  inizioAttivita: '2015-03-01',
  annoBilancio: 2025,
  fatturato: 100_000,
  utile: 4_000,
  oggi: OGGI,
  ...extra,
});

describe('classe della forma giuridica', () => {
  it('legge il codice del Registro', () => {
    expect(classeFormaRicerca('SR', null)).toBe('capitali');
    expect(classeFormaRicerca('SN', null)).toBe('persone');
    expect(classeFormaRicerca('DI', null)).toBe('individuale');
  });
  it('senza codice ripiega sulla descrizione', () => {
    expect(classeFormaRicerca(null, 'SOCIETA\' IN NOME COLLETTIVO')).toBe('persone');
    expect(classeFormaRicerca(null, 'societa in accomandita semplice')).toBe('persone');
    expect(classeFormaRicerca(null, 'IMPRESA INDIVIDUALE')).toBe('individuale');
    expect(classeFormaRicerca(null, 'SOCIETA\' A RESPONSABILITA\' LIMITATA')).toBe('capitali');
  });
  it('forma sconosciuta vale come societa di capitali', () => {
    expect(classeFormaRicerca(null, null)).toBe('capitali');
  });
});

describe('anni compiuti', () => {
  it('conta gli anni interi, nei due formati', () => {
    expect(anniCompiuti('2024-10-24', OGGI)).toBe(2);
    expect(anniCompiuti('2024-10-25', OGGI)).toBe(1);
    expect(anniCompiuti('24-10-2024', OGGI)).toBe(2);
    expect(anniCompiuti(null, OGGI)).toBeNull();
    expect(anniCompiuti('boh', OGGI)).toBeNull();
  });
});

describe('azienda ferma', () => {
  it('riconosce cessata, liquidazione, inattiva', () => {
    expect(aziendaFerma('CESSATA')).toBe(true);
    expect(aziendaFerma('IN LIQUIDAZIONE')).toBe(true);
    expect(aziendaFerma('INATTIVA')).toBe(true);
    expect(aziendaFerma('ATTIVA')).toBe(false);
    expect(aziendaFerma(null)).toBe(false);
  });
});

describe('esito', () => {
  it('srl con bilancio atteso, utile e 15% del fatturato: verde', () => {
    const e = valutaSimulatore(srl());
    expect(e.colore).toBe('verde');
    expect(e.criteri.every((c) => c.ok === true)).toBe(true);
  });
  it('srl con il bilancio dell\'anno prima: giallo, con indicazione sul bilancio', () => {
    const e = valutaSimulatore(srl({ annoBilancio: 2024 }));
    expect(e.colore).toBe('giallo');
    expect(e.indicazioni.join(' ')).toContain('2024');
    expect(e.indicazioni.join(' ')).toContain('2025');
  });
  it('srl senza bilancio: giallo', () => {
    expect(valutaSimulatore(srl({ annoBilancio: null, fatturato: null, utile: null })).colore).toBe('giallo');
  });
  it('srl in perdita o in pareggio: giallo', () => {
    expect(valutaSimulatore(srl({ utile: -500 })).colore).toBe('giallo');
    expect(valutaSimulatore(srl({ utile: 0 })).colore).toBe('giallo');
  });
  it('srl con richiesta al 25% del fatturato: giallo, con indicazione sul rapporto', () => {
    const e = valutaSimulatore(srl({ importo: 25_000 }));
    expect(e.colore).toBe('giallo');
    expect(e.indicazioni.join(' ')).toContain('quinto');
  });
  it('20% esatto passa', () => {
    expect(valutaSimulatore(srl({ importo: 20_000 })).colore).toBe('verde');
  });
  it('ditta individuale con 5 anni e nessun bilancio: verde', () => {
    const e = valutaSimulatore(srl({ classe: 'individuale', inizioAttivita: '2021-01-10', annoBilancio: null, fatturato: null, utile: null }));
    expect(e.colore).toBe('verde');
  });
  it('snc con 3 anni: verde anche con fatturato basso, ma il rapporto resta fra i criteri', () => {
    const e = valutaSimulatore(srl({ classe: 'persone', inizioAttivita: '2023-05-01', fatturato: 50_000 }));
    expect(e.colore).toBe('verde');
    expect(e.criteri.find((c) => c.chiave === 'rapporto')?.ok).toBe(false);
  });
  it('meno di 2 anni: rosso per tutte le forme', () => {
    expect(valutaSimulatore(srl({ inizioAttivita: '2025-01-01' })).colore).toBe('rosso');
    expect(valutaSimulatore(srl({ classe: 'individuale', inizioAttivita: '2025-01-01' })).colore).toBe('rosso');
  });
  it('2 anni esatti bastano', () => {
    expect(valutaSimulatore(srl({ inizioAttivita: '2024-10-24' })).colore).toBe('verde');
  });
  it('anzianita illeggibile: giallo, mai verde ne rosso', () => {
    expect(valutaSimulatore(srl({ inizioAttivita: null })).colore).toBe('giallo');
    expect(valutaSimulatore(srl({ classe: 'individuale', inizioAttivita: null })).colore).toBe('giallo');
  });
});

describe('importo scritto a mano', () => {
  it('legge le migliaia all\'italiana', () => {
    expect(leggiImporto('25000')).toBe(25000);
    expect(leggiImporto('25.000')).toBe(25000);
    expect(leggiImporto('25 000 €')).toBe(25000);
  });
  it('rifiuta la virgola delle migliaia, che e\' ambigua', () => {
    expect(leggiImporto('25,000')).toBeNull();
    expect(leggiImporto('1,500,000')).toBeNull();
  });
  it('rifiuta vuoto, zero e testo', () => {
    expect(leggiImporto('')).toBeNull();
    expect(leggiImporto('0')).toBeNull();
    expect(leggiImporto('tanti')).toBeNull();
  });
});

describe('documenti', () => {
  const base = ['Visura camerale', "Carta d'identità del legale rappresentante", 'Tessera sanitaria',
    'IBAN aziendale', 'Email', 'Cellulare', 'Preventivo dei beni da acquistare'];

  it('fino a 10.000 euro solo la lista base', () => {
    expect(documentiSimulatore('capitali', 10_000, OGGI)).toEqual(base);
  });
  it('sopra 10.000 la societa di capitali aggiunge l\'ultimo bilancio con la ricevuta', () => {
    expect(documentiSimulatore('capitali', 10_001, OGGI)).toEqual([
      ...base, 'Bilancio 2025 depositato, con la ricevuta di deposito',
    ]);
  });
  it('sopra 10.000 ditte e societa di persone aggiungono il Modello Unico', () => {
    expect(documentiSimulatore('individuale', 20_000, OGGI).at(-1)).toBe('Ultimo Modello Unico (dichiarazione dei redditi)');
    expect(documentiSimulatore('persone', 20_000, OGGI).at(-1)).toBe('Ultimo Modello Unico (dichiarazione dei redditi)');
  });
  it('l\'anno del bilancio segue la data', () => {
    expect(documentiSimulatore('capitali', 50_000, new Date(2027, 2, 1)).at(-1)).toContain('2025');
    expect(documentiSimulatore('capitali', 50_000, new Date(2027, 8, 1)).at(-1)).toContain('2026');
  });
});
