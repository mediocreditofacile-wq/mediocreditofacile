// Instradamento della distinta: quale canale quota il cliente, con quale
// maggiorazione, e le rate per durata sull'imponibile maggiorato.
//
// Sono regole commerciali che nessuno rilegge nel codice: se cambiano, deve
// cadere un test. I canoni attesi si ricavano dalle stesse tabelle del sito
// (getTabella) e, dove conta il numero, sono scritti anche a mano.
//
// La config LO e' quella del seed di Led Office (spec, paragrafo 4):
// Econocom, poi Grenke (spento), poi Pagarent col 5%.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTabella } from '../tabelle-canoni';
import type { CanaleConfig } from './config-distinta';
import {
  DURATA_EVIDENZA, instrada, vistaCommerciale,
  type BeneInstradamento, type ClienteInstradamento,
} from './instradamento';

// Grenke non si sceglie mai finche' PIONEER_LETTO e' null. Per provare il canale
// acceso con una data di lettura si sostituisce solo quella costante, leggendola
// ad ogni accesso (un getter) cosi' ogni test decide il suo valore.
const stato = vi.hoisted(() => ({ letto: null as string | null }));
vi.mock('../../data/grenke', async (importOriginal) => {
  const reale = await importOriginal<typeof import('../../data/grenke')>();
  return {
    ...reale,
    get PIONEER_LETTO() {
      return stato.letto;
    },
  };
});

beforeEach(() => {
  stato.letto = null;
});

// "Oggi" in ora locale: una data ISO sposterebbe i confini dei mesi col fuso
const OGGI = new Date(2026, 9, 20);

const ECONOCOM: CanaleConfig = {
  canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0,
  fatturatoMin: 5_000_000, importoMin: 150_000,
};
const GRENKE: CanaleConfig = {
  canale: 'grenke', attivo: false, tabella: 'pioneer', maggiorazionePerc: 0,
  soloCapitali: true, formeEscluse: ['RS'], anniMin: 2, settoriEsclusi: [], sogliaProvvisorio: 50_000,
};
const PAGARENT: CanaleConfig = { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 };

/** La configurazione di Led Office: Grenke spento */
const LO: CanaleConfig[] = [ECONOCOM, GRENKE, PAGARENT];
/** Uguale, con Grenke acceso */
const LO_GRENKE: CanaleConfig[] = [ECONOCOM, { ...GRENKE, attivo: true }, PAGARENT];

const piccolo: ClienteInstradamento = {
  formaCodice: 'SR', inizioAttivita: '2015-03-10', fatturato: 800_000, atecoCodice: '620100',
};
const grande: ClienteInstradamento = { ...piccolo, fatturato: 6_000_000 };
const srlTreAnni: ClienteInstradamento = { ...piccolo, inizioAttivita: '2023-09-01' };

const durate = (beni: number, cliente = piccolo, canali = LO) =>
  instrada(canali, cliente, beni, OGGI)!.rate.map((x) => x.durata);

describe('Pagarent, il canale di chiusura', () => {
  it('5% arrotondato all\'euro, rata sull\'imponibile maggiorato', () => {
    const r = instrada(LO, piccolo, 137_750, OGGI)!;
    expect(r).toMatchObject({ canale: 'pagarent', beni: 137_750, maggiorazione: 6_888, imponibile: 144_638, daConfermare: false });
    // 6.887,5 si arrotonda per eccesso: 6.888
    expect(r.rate.find((x) => x.durata === DURATA_EVIDENZA)!.canone)
      .toBe(Math.round(144_638 * getTabella('pagarent').coefficiente(144_638, 60)!) / 100);
    // E il numero scritto a mano: 144.638 x 2,26309% = 3.273,29
    expect(r.rate.find((x) => x.durata === 60)!.canone).toBe(3_273.29);
  });

  it('durate 24, 36, 48 e 60, evidenza su 60', () => {
    expect(DURATA_EVIDENZA).toBe(60);
    expect(durate(50_000)).toEqual([24, 36, 48, 60]);
  });

  it('cambio di fascia dopo il 5%: la rata usa il coefficiente dell\'imponibile maggiorato', () => {
    // A 60 mesi (e sulle altre tre durate) la fascia sopra scatta a 45.000 euro
    // (src/data/pagarent.ts). 42.900 sta sotto, ma + 5% (2.145) fa 45.045: sopra.
    const beni = 42_900;
    const r = instrada(LO, piccolo, beni, OGGI)!;
    expect(r).toMatchObject({ canale: 'pagarent', maggiorazione: 2_145, imponibile: 45_045 });
    const t = getTabella('pagarent');
    for (const { durata, canone } of r.rate) {
      // il coefficiente e' quello della fascia dell'imponibile...
      expect(canone).toBe(Math.round(45_045 * t.coefficiente(45_045, durata)!) / 100);
      // ...e non quello della fascia in cui stavano i soli beni
      expect(t.coefficiente(45_045, durata)).not.toBe(t.coefficiente(beni, durata));
      expect(canone).not.toBe(Math.round(45_045 * t.coefficiente(beni, durata)!) / 100);
    }
    // Numeri scritti a mano: 45.045 x 2,26309% = 1.019,41 a 60 mesi
    // (con il coefficiente 2,27025 della fascia dei soli beni sarebbe 1.022,63)
    expect(r.rate.find((x) => x.durata === 60)!.canone).toBe(1_019.41);
    expect(r.rate.find((x) => x.durata === 24)!.canone).toBe(2_336.49);
  });

  it('mezzo centesimo: il canone arrotonda per eccesso, come il contratto', () => {
    // 70.476 + 3.524 (il 5% e' 3.523,8) = 74.000. A 48 mesi 74.000 x 2,73675% fa
    // 2.025,195: il contratto dice 2.025,20, e un arrotondamento che perde il
    // mezzo centesimo per la virgola mobile darebbe 2.025,19
    const r = instrada(LO, piccolo, 70_476, OGGI)!;
    expect(r).toMatchObject({ canale: 'pagarent', maggiorazione: 3_524, imponibile: 74_000 });
    expect(r.rate.find((x) => x.durata === 48)!.canone).toBe(2_025.2);
  });

  it('mezzo centesimo, imponibile 46.000 a 48 mesi: 1.258,91', () => {
    // 46.000 non si raggiunge con il 5% da beni interi (43.809 fa 45.999, 43.810 fa 46.001):
    // si prova su un canale senza maggiorazione. 46.000 x 2,73675% = 1.258,905 -> 1.258,91
    const senzaMaggiorazione: CanaleConfig[] = [{ ...PAGARENT, maggiorazionePerc: 0 }];
    const r = instrada(senzaMaggiorazione, piccolo, 46_000, OGGI)!;
    expect(r).toMatchObject({ maggiorazione: 0, imponibile: 46_000 });
    expect(r.rate.find((x) => x.durata === 48)!.canone).toBe(1_258.91);
  });

  it('beni ai centesimi: l\'imponibile resta ai centesimi, senza rumore di virgola mobile', () => {
    // 1000,07 + 50 in virgola mobile fa 1050.0700000000002
    const r = instrada(LO, piccolo, 1_000.07, OGGI)!;
    expect(r).toMatchObject({ canale: 'pagarent', beni: 1_000.07, maggiorazione: 50, imponibile: 1_050.07 });
    const t = getTabella('pagarent');
    expect(r.rate.find((x) => x.durata === 60)!.canone).toBe(Math.round(Number((1_050.07 * t.coefficiente(1_050.07, 60)!).toFixed(6))) / 100);
  });

  it('bordo alto: l\'imponibile puo\' arrivare a 200.000, non oltre', () => {
    // 190.476 + 9.524 (il 5% e' 9.523,8) = 200.000 esatti: si quota
    expect(instrada(LO, piccolo, 190_476, OGGI)).toMatchObject({ canale: 'pagarent', imponibile: 200_000 });
    // 190.477 fa 200.001: fuori
    expect(instrada(LO, piccolo, 190_477, OGGI)).toBeNull();
  });

  it('oltre 200.000 senza Econocom: nessun canale', () => {
    // 191.000 sono meno di 200.000, ma l'imponibile col 5% (200.550) li supera
    expect(instrada(LO, piccolo, 191_000, OGGI)).toBeNull();
  });

  it('bordo basso: l\'imponibile deve arrivare a 1.000', () => {
    // 952 + 48 (il 5% e' 47,6) = 1.000: si quota
    expect(instrada(LO, piccolo, 952, OGGI)).toMatchObject({ canale: 'pagarent', imponibile: 1_000 });
    // 951 fa 999: sotto la prima fascia
    expect(instrada(LO, piccolo, 951, OGGI)).toBeNull();
  });
});

describe('Econocom, il canale dei clienti grandi', () => {
  it('cliente oltre 5 milioni e beni da 150.000: 36, 48 e 60 mesi, nessuna maggiorazione', () => {
    const r = instrada(LO, grande, 150_000, OGGI)!;
    expect(r).toMatchObject({
      canale: 'econocom', beni: 150_000, maggiorazione: 0, imponibile: 150_000,
      daConfermare: true, richiedeProvvisorio: false,
    });
    // Coefficienti del 22/10/2026: 150.000 x 3,152% / 2,473% / 2,076%
    expect(r.rate).toEqual([
      { durata: 36, canone: 4_728 },
      { durata: 48, canone: 3_709.5 },
      { durata: 60, canone: 3_114 },
    ]);
  });

  it('cliente grande sotto 150.000: Pagarent col 5%', () => {
    // 149.999 + 7.500 (il 5% e' 7.499,95) = 157.499
    expect(instrada(LO, grande, 149_999, OGGI)).toMatchObject({
      canale: 'pagarent', maggiorazione: 7_500, imponibile: 157_499, daConfermare: false,
    });
  });

  it('il bordo dei 150.000 cambia canale, e il 5% sparisce', () => {
    expect(instrada(LO, grande, 149_999, OGGI)!.canale).toBe('pagarent');
    expect(instrada(LO, grande, 150_000, OGGI)).toMatchObject({ canale: 'econocom', maggiorazione: 0 });
  });

  it('fatturato esattamente 5.000.000 non basta: serve "oltre"', () => {
    // Con beni da 150.000, dove Econocom altrimenti scatterebbe
    const r = instrada(LO, { ...grande, fatturato: 5_000_000 }, 150_000, OGGI)!;
    expect(r).toMatchObject({ canale: 'pagarent', maggiorazione: 7_500, imponibile: 157_500 });
    expect(instrada(LO, { ...grande, fatturato: 5_000_001 }, 150_000, OGGI)!.canale).toBe('econocom');
  });

  it('cliente piccolo con beni grandi: Econocom non si applica', () => {
    expect(instrada(LO, piccolo, 150_000, OGGI)!.canale).toBe('pagarent');
  });

  it('fatturato sconosciuto non soddisfa la soglia', () => {
    expect(instrada(LO, { ...grande, fatturato: null }, 150_000, OGGI)!.canale).toBe('pagarent');
  });

  it('un fatturato zero e\' un dato: non basta, ma non e\' un errore', () => {
    expect(instrada(LO, { ...grande, fatturato: 0 }, 150_000, OGGI)!.canale).toBe('pagarent');
  });
});

describe('Grenke spento o senza data di lettura del listino', () => {
  it('Grenke spento: mai Grenke', () => {
    expect(instrada(LO, srlTreAnni, 60_000, OGGI)!.canale).toBe('pagarent');
  });

  it('Grenke acceso ma PIONEER_LETTO null: mai Grenke', () => {
    expect(stato.letto).toBeNull();
    expect(instrada(LO_GRENKE, srlTreAnni, 60_000, OGGI)!.canale).toBe('pagarent');
  });

  it('il blocco e\' del listino Pioneer, non del canale: un altro canale sulla tabella pioneer non quota', () => {
    expect(stato.letto).toBeNull();
    // L'admin punta Pagarent sulla tabella pioneer: senza data di lettura il canale salta
    const pagarentSuPioneer: CanaleConfig = { ...PAGARENT, tabella: 'pioneer', maggiorazionePerc: 0 };
    expect(instrada([pagarentSuPioneer], srlTreAnni, 60_000, OGGI)).toBeNull();
    expect(instrada([pagarentSuPioneer, PAGARENT], srlTreAnni, 60_000, OGGI)).toMatchObject({ canale: 'pagarent', maggiorazione: 3_000 });
    // Con la data di lettura lo stesso canale quota
    stato.letto = '2026-01-01';
    expect(instrada([pagarentSuPioneer], srlTreAnni, 60_000, OGGI)).toMatchObject({ canale: 'pagarent', maggiorazione: 0 });
  });

  it('Grenke su un listino che ha la sua data di lettura (Sputnik) quota anche senza PIONEER_LETTO', () => {
    expect(stato.letto).toBeNull();
    const grenkeSputnik: CanaleConfig = { ...GRENKE, attivo: true, tabella: 'sputnik' };
    expect(instrada([grenkeSputnik], srlTreAnni, 60_000, OGGI)).toMatchObject({ canale: 'grenke', imponibile: 60_000 });
  });
});

describe('Grenke acceso con la data di lettura del listino', () => {
  beforeEach(() => {
    stato.letto = '2026-01-01';
  });

  it('SRL di tre anni a 60.000: Grenke, senza maggiorazione, bilancio provvisorio richiesto', () => {
    const r = instrada(LO_GRENKE, srlTreAnni, 60_000, OGGI)!;
    expect(r).toMatchObject({
      canale: 'grenke', beni: 60_000, maggiorazione: 0, imponibile: 60_000,
      daConfermare: false, richiedeProvvisorio: true,
    });
    expect(r.rate.map((x) => x.durata)).toEqual([24, 36, 48, 60]);
    const t = getTabella('pioneer');
    expect(r.rate.find((x) => x.durata === 60)!.canone).toBe(Math.round(60_000 * t.coefficiente(60_000, 60)!) / 100);
  });

  it('provvisorio solo sopra 50.000, 50.000 compresi esclusi', () => {
    expect(instrada(LO_GRENKE, srlTreAnni, 50_000, OGGI)).toMatchObject({ canale: 'grenke', richiedeProvvisorio: false });
    expect(instrada(LO_GRENKE, srlTreAnni, 50_001, OGGI)).toMatchObject({ canale: 'grenke', richiedeProvvisorio: true });
  });

  it('SRLS (codice RS): Pagarent', () => {
    expect(instrada(LO_GRENKE, { ...srlTreAnni, formaCodice: 'RS' }, 60_000, OGGI)!.canale).toBe('pagarent');
  });

  it('solo societa\' di capitali: ditta individuale e societa\' di persone vanno su Pagarent', () => {
    expect(instrada(LO_GRENKE, { ...srlTreAnni, formaCodice: 'DI' }, 60_000, OGGI)!.canale).toBe('pagarent');
    expect(instrada(LO_GRENKE, { ...srlTreAnni, formaCodice: 'SN' }, 60_000, OGGI)!.canale).toBe('pagarent');
  });

  it('almeno due anni di attivita\': 24 mesi pieni si', () => {
    // Oggi e' il 20/10/2026: il 20/10/2024 sono 24 mesi esatti, il 21/10/2024 ne mancano pochi giorni
    expect(instrada(LO_GRENKE, { ...piccolo, inizioAttivita: '2024-10-20' }, 60_000, OGGI)!.canale).toBe('grenke');
    expect(instrada(LO_GRENKE, { ...piccolo, inizioAttivita: '2024-10-21' }, 60_000, OGGI)!.canale).toBe('pagarent');
  });

  it('beni fino a 100.000, la fine della tabella; oltre, Pagarent', () => {
    expect(instrada(LO_GRENKE, srlTreAnni, 100_000, OGGI)!.canale).toBe('grenke');
    expect(instrada(LO_GRENKE, srlTreAnni, 100_001, OGGI)!.canale).toBe('pagarent');
    expect(instrada(LO_GRENKE, srlTreAnni, 110_000, OGGI)).toMatchObject({
      canale: 'pagarent', maggiorazione: 5_500, imponibile: 115_500,
    });
  });

  it('un ATECO escluso manda su Pagarent, per prefisso di cifre', () => {
    const conSettori = LO_GRENKE.map((c) => (c.canale === 'grenke' ? { ...c, settoriEsclusi: ['56', '4110'] } : c));
    // 56.10.11 (ristoranti) e 41.10.00: esclusi, anche scritti col punto
    expect(instrada(conSettori, { ...srlTreAnni, atecoCodice: '561011' }, 60_000, OGGI)!.canale).toBe('pagarent');
    expect(instrada(conSettori, { ...srlTreAnni, atecoCodice: '56.10.11' }, 60_000, OGGI)!.canale).toBe('pagarent');
    expect(instrada(conSettori, { ...srlTreAnni, atecoCodice: '411000' }, 60_000, OGGI)!.canale).toBe('pagarent');
    // 62.01.00 (software) e 41.20 (fuori dal prefisso 4110): ammessi
    expect(instrada(conSettori, { ...srlTreAnni, atecoCodice: '620100' }, 60_000, OGGI)!.canale).toBe('grenke');
    expect(instrada(conSettori, { ...srlTreAnni, atecoCodice: '412000' }, 60_000, OGGI)!.canale).toBe('grenke');
  });

  it('dati che mancano non soddisfano una condizione', () => {
    const conSettori = LO_GRENKE.map((c) => (c.canale === 'grenke' ? { ...c, settoriEsclusi: ['56'] } : c));
    // senza data di inizio non si prova che i due anni ci siano
    expect(instrada(LO_GRENKE, { ...srlTreAnni, inizioAttivita: null }, 60_000, OGGI)!.canale).toBe('pagarent');
    // senza forma giuridica non si prova che sia una societa' di capitali
    expect(instrada(LO_GRENKE, { ...srlTreAnni, formaCodice: null }, 60_000, OGGI)!.canale).toBe('pagarent');
    // senza ATECO non si prova che il settore non sia escluso, ma solo se ci sono settori esclusi
    expect(instrada(conSettori, { ...srlTreAnni, atecoCodice: null }, 60_000, OGGI)!.canale).toBe('pagarent');
    expect(instrada(LO_GRENKE, { ...srlTreAnni, atecoCodice: null }, 60_000, OGGI)!.canale).toBe('grenke');
  });

  it('una data di inizio illeggibile non passa per buona', () => {
    expect(instrada(LO_GRENKE, { ...srlTreAnni, inizioAttivita: 'non-una-data' }, 60_000, OGGI)!.canale).toBe('pagarent');
  });

  it('formeEscluse da sola, senza forma giuridica, non da\' per buono il canale', () => {
    const soloEscluse = LO_GRENKE.map((c) => (c.canale === 'grenke' ? { ...c, soloCapitali: false } : c));
    expect(instrada(soloEscluse, { ...srlTreAnni, formaCodice: null }, 60_000, OGGI)!.canale).toBe('pagarent');
    // e senza soloCapitali una ditta individuale puo' passare, se la forma non e' esclusa
    expect(instrada(soloEscluse, { ...srlTreAnni, formaCodice: 'DI' }, 60_000, OGGI)!.canale).toBe('grenke');
  });
});

describe('la configurazione', () => {
  it('canali vuoti: nessun canale, mai un altro listino', () => {
    expect(instrada([], piccolo, 50_000, OGGI)).toBeNull();
  });

  it('un canale spento si salta', () => {
    expect(instrada([{ ...PAGARENT, attivo: false }], piccolo, 50_000, OGGI)).toBeNull();
  });

  it('una tabella che non esiste fa saltare il canale, non ricade su un\'altra', () => {
    expect(instrada([{ ...PAGARENT, tabella: 'inesistente' }], piccolo, 50_000, OGGI)).toBeNull();
    // il canale dopo, se regge, risponde
    const r = instrada([{ ...ECONOCOM, tabella: 'inesistente' }, PAGARENT], grande, 150_000, OGGI)!;
    expect(r.canale).toBe('pagarent');
  });

  it('l\'ordine dei canali e\' la priorita\'', () => {
    // Pagarent davanti a Econocom: su un cliente grande vince Pagarent
    expect(instrada([PAGARENT, ECONOCOM], grande, 150_000, OGGI)!.canale).toBe('pagarent');
  });

  it('oltre il tetto di tutte le tabelle: nessun canale', () => {
    // 10 milioni e' il tetto della tabella Econocom, 200.000 quello di Pagarent
    const r = instrada(LO, { ...grande, fatturato: 50_000_000 }, 10_000_001, OGGI);
    expect(r).toBeNull();
  });

  it('beni non validi: nessun canale', () => {
    expect(instrada(LO, piccolo, 0, OGGI)).toBeNull();
    expect(instrada(LO, piccolo, -5_000, OGGI)).toBeNull();
    expect(instrada(LO, piccolo, Number.NaN, OGGI)).toBeNull();
  });
});

describe('la nota', () => {
  it('c\'e\' su ogni canale e non nomina locatori ne\' coefficienti', () => {
    stato.letto = '2026-01-01';
    const note = [
      instrada(LO_GRENKE, piccolo, 50_000, OGGI)!.nota,
      instrada(LO_GRENKE, srlTreAnni, 50_000, OGGI)!.nota,
      instrada(LO_GRENKE, grande, 150_000, OGGI)!.nota,
    ];
    for (const nota of note) {
      expect(nota).toBeTruthy();
      expect(nota!).not.toMatch(/pagarent|grenke|econocom|pioneer|rete\s?rent/i);
      expect(nota!).not.toMatch(/coefficient|maggiorazion|fascia/i);
    }
  });

  it('nessuna stringa con nomi o coefficienti nella nota (Pagarent)', () => {
    const r = instrada(LO, piccolo, 50_000, OGGI)!;
    expect(r.nota).toMatch(/istruttoria/i);
    expect(r.nota ?? '').not.toMatch(/pagarent|grenke|econocom/i);
  });
});

describe('vistaCommerciale', () => {
  const ESCLUSI = ['canale', 'beni', 'maggiorazione', 'imponibile'];

  it('lascia solo rate, nota e i due avvisi', () => {
    const r = instrada(LO, piccolo, 137_750, OGGI)!;
    const v = vistaCommerciale(r);
    expect(Object.keys(v).sort()).toEqual(['daConfermare', 'nota', 'rate', 'richiedeProvvisorio']);
    expect(v.rate).toEqual(r.rate);
    expect(v.nota).toBe(r.nota);
    expect(v.daConfermare).toBe(false);
    expect(v.richiedeProvvisorio).toBe(false);
  });

  it('il JSON non porta ne\' le chiavi riservate ne\' i nomi dei locatori, su ogni canale', () => {
    stato.letto = '2026-01-01';
    const viste = [
      instrada(LO_GRENKE, piccolo, 137_750, OGGI)!,
      instrada(LO_GRENKE, grande, 150_000, OGGI)!,
      instrada(LO_GRENKE, srlTreAnni, 60_000, OGGI)!,
    ].map(vistaCommerciale);
    for (const v of viste) {
      const json = JSON.stringify(v);
      for (const chiave of ESCLUSI) expect(json).not.toContain(`"${chiave}"`);
      expect(json).not.toMatch(/pagarent|grenke|econocom/i);
    }
    // gli avvisi passano com'erano
    expect(viste[1].daConfermare).toBe(true);
    expect(viste[2].richiedeProvvisorio).toBe(true);
  });

  it('dalla vista non si ricava la maggiorazione', () => {
    // la differenza fra imponibile e beni e' la maggiorazione: nessuno dei due deve uscire
    const v = vistaCommerciale(instrada(LO, piccolo, 137_750, OGGI)!);
    const json = JSON.stringify(v);
    expect(json).not.toContain('137750');
    expect(json).not.toContain('144638');
    expect(json).not.toContain('6888');
  });
});

// --- il bene: venditore, categoria, targa (settore mezzi) ----------------------

// I canali di Bergamelli (spec, sezione 4): Nol System va su Econocom solo per i
// clienti grandi e i beni grandi, Manc su Grenke Sputnik escluso i ponteggi; nessuno dei
// due quota il targato.
const ECONOCOM_NOLSYSTEM: CanaleConfig = { ...ECONOCOM, venditori: ['nolsystem'], escludiTargati: true };
const GRENKE_MANC: CanaleConfig = {
  canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0,
  venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true,
};
const BERGAMELLI: CanaleConfig[] = [ECONOCOM_NOLSYSTEM, GRENKE_MANC];

const gru: BeneInstradamento = { venditore: 'manc', categorie: ['Gru a torre'], targato: false, usato: false };
const nolsystem: BeneInstradamento = { venditore: 'nolsystem', categorie: ['Gru a torre'], targato: false, usato: false };

describe('il bene: Manc su Grenke Sputnik', () => {
  it('gru non targata a 50.000: Grenke, rate su tutte le durate del listino, nessuna maggiorazione', () => {
    const r = instrada(BERGAMELLI, piccolo, 50_000, OGGI, gru)!;
    expect(r).toMatchObject({ canale: 'grenke', beni: 50_000, maggiorazione: 0, imponibile: 50_000, daConfermare: false });
    // Le durate sono quelle che il listino quota a quell'importo: non un elenco scritto a mano
    expect(r.rate.map((x) => x.durata)).toEqual(getTabella('sputnik').durateDisponibili(50_000));
    expect(r.rate[0].durata).toBe(24);
    expect(r.rate.at(-1)!.durata).toBe(60);
  });

  it('il canone e\' quello della tabella Sputnik sull\'importo', () => {
    const r = instrada(BERGAMELLI, piccolo, 50_000, OGGI, gru)!;
    const t = getTabella('sputnik');
    for (const { durata, canone } of r.rate) {
      expect(canone).toBe(Math.round(50_000 * t.coefficiente(50_000, durata)!) / 100);
    }
  });

  it('lo stesso bene targato: nessun canale', () => {
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI, { ...gru, targato: true })).toBeNull();
  });

  it('una riga Ponteggi fra le categorie: nessun canale, anche se le altre sono ammesse', () => {
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI, { ...gru, categorie: ['Ponteggi'] })).toBeNull();
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI, { ...gru, categorie: ['Gru a torre', 'Ponteggi'] })).toBeNull();
  });

  it('il cliente grande non porta Manc su Econocom: il venditore decide', () => {
    // Fatturato e importo sarebbero da Econocom, ma i beni di Manc non sono suoi
    const r = instrada(BERGAMELLI, grande, 200_000, OGGI, gru)!;
    expect(r).toMatchObject({ canale: 'grenke', daConfermare: false });
  });

  it('un venditore che nessun canale quota: nessun canale', () => {
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI, { ...gru, venditore: 'altro' })).toBeNull();
  });
});

describe('il bene: Nol System su Econocom', () => {
  it('cliente oltre 5 milioni e 200.000 di beni: Econocom, 36/48/60 mesi, da confermare', () => {
    const r = instrada(BERGAMELLI, { ...grande, fatturato: 6_000_000 }, 200_000, OGGI, nolsystem)!;
    expect(r).toMatchObject({ canale: 'econocom', maggiorazione: 0, imponibile: 200_000, daConfermare: true });
    expect(r.rate).toEqual([
      { durata: 36, canone: 6_304 },
      { durata: 48, canone: 4_946 },
      { durata: 60, canone: 4_152 },
    ]);
  });

  it('fatturato esattamente 5.000.000: la soglia e\' "oltre", nessun canale', () => {
    expect(instrada(BERGAMELLI, { ...grande, fatturato: 5_000_000 }, 200_000, OGGI, nolsystem)).toBeNull();
    expect(instrada(BERGAMELLI, { ...grande, fatturato: 5_000_001 }, 200_000, OGGI, nolsystem)!.canale).toBe('econocom');
  });

  it('beni sotto 150.000: nessun canale (Nol System non ha altri noleggi)', () => {
    expect(instrada(BERGAMELLI, grande, 149_999, OGGI, nolsystem)).toBeNull();
  });

  it('fatturato sconosciuto: nessun canale', () => {
    expect(instrada(BERGAMELLI, { ...grande, fatturato: null }, 200_000, OGGI, nolsystem)).toBeNull();
  });

  it('un mezzo targato: nessun canale, nemmeno col cliente e i beni da Econocom', () => {
    expect(instrada(BERGAMELLI, { ...grande, fatturato: 6_000_000 }, 200_000, OGGI, { ...nolsystem, targato: true })).toBeNull();
  });
});

describe('il bene: i dati che mancano e le liste vuote', () => {
  it('un canale con condizioni sul bene, e nessun bene: non regge', () => {
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI)).toBeNull();
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI, null)).toBeNull();
    // Basta una sola delle tre condizioni
    for (const condizione of [{ venditori: ['manc'] }, { categorieEscluse: ['Ponteggi'] }, { escludiTargati: true }]) {
      const canale: CanaleConfig = { ...PAGARENT, ...condizione };
      expect(instrada([canale], piccolo, 50_000, OGGI)).toBeNull();
      expect(instrada([canale], piccolo, 50_000, OGGI, gru)).toMatchObject({ canale: 'pagarent' });
    }
  });

  it('venditori vuoto: il canale non vale per nessun venditore', () => {
    const canale: CanaleConfig = { ...PAGARENT, venditori: [] };
    expect(instrada([canale], piccolo, 50_000, OGGI, gru)).toBeNull();
    expect(instrada([canale], piccolo, 50_000, OGGI)).toBeNull();
  });

  it('categorieEscluse vuoto: nessuna esclusione', () => {
    const canale: CanaleConfig = { ...PAGARENT, categorieEscluse: [] };
    expect(instrada([canale], piccolo, 50_000, OGGI, { ...gru, categorie: ['Ponteggi'] })).toMatchObject({ canale: 'pagarent' });
    // e non e' una condizione sul bene: senza bene il canale regge come prima
    expect(instrada([canale], piccolo, 50_000, OGGI)).toMatchObject({ canale: 'pagarent' });
  });

  it('escludiTargati falso: il targato passa', () => {
    const canale: CanaleConfig = { ...PAGARENT, escludiTargati: false };
    expect(instrada([canale], piccolo, 50_000, OGGI, { ...gru, targato: true })).toMatchObject({ canale: 'pagarent' });
  });

  it('un canale che non regge sul bene lascia la parola al successivo', () => {
    const conChiusura: CanaleConfig[] = [GRENKE_MANC, PAGARENT];
    expect(instrada(conChiusura, piccolo, 50_000, OGGI, gru)!.canale).toBe('grenke');
    expect(instrada(conChiusura, piccolo, 50_000, OGGI, { ...gru, targato: true })).toMatchObject({
      canale: 'pagarent', maggiorazione: 2_500,
    });
  });
});

describe('il bene: i canali senza condizioni non cambiano', () => {
  it('Led Office con o senza bene da gli stessi risultati di sempre', () => {
    for (const [cliente, beni] of [[piccolo, 50_000], [piccolo, 137_750], [grande, 150_000], [grande, 149_999]] as const) {
      const senza = instrada(LO, cliente, beni, OGGI);
      expect(instrada(LO, cliente, beni, OGGI, null)).toEqual(senza);
      expect(instrada(LO, cliente, beni, OGGI, gru)).toEqual(senza);
      expect(instrada(LO, cliente, beni, OGGI, { ...gru, targato: true })).toEqual(senza);
    }
  });
});

describe('il bene usato (23/10/2026)', () => {
  // I canali di Bergamelli escludono anche l'usato: il noleggio dell'usato si chiede a MCF
  const SENZA_USATO: CanaleConfig[] = BERGAMELLI.map((c) => ({ ...c, escludiUsati: true }));

  it('gru nuova: Grenke come prima', () => {
    expect(instrada(SENZA_USATO, piccolo, 50_000, OGGI, gru)).toMatchObject({ canale: 'grenke' });
  });

  it('gru usata: nessun canale, ne\' Grenke per Manc ne\' Econocom per Nol System', () => {
    expect(instrada(SENZA_USATO, piccolo, 50_000, OGGI, { ...gru, usato: true })).toBeNull();
    expect(instrada(SENZA_USATO, { ...grande, fatturato: 6_000_000 }, 200_000, OGGI, { ...nolsystem, usato: true })).toBeNull();
  });

  it('senza la risposta sull\'usato un canale che lo esclude non regge: un dato che manca non prova niente', () => {
    const { usato: _, ...senza } = gru;
    expect(instrada(SENZA_USATO, piccolo, 50_000, OGGI, senza as BeneInstradamento)).toBeNull();
  });

  it('un canale senza escludiUsati quota anche l\'usato', () => {
    expect(instrada(BERGAMELLI, piccolo, 50_000, OGGI, { ...gru, usato: true })).toMatchObject({ canale: 'grenke' });
  });

  it('escludiUsati da solo e\' una condizione sul bene: senza bene il canale non regge', () => {
    const solo: CanaleConfig = { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 0, escludiUsati: true };
    expect(instrada([solo], piccolo, 20_000, OGGI, null)).toBeNull();
    expect(instrada([solo], piccolo, 20_000, OGGI, { ...gru, usato: false })).toMatchObject({ canale: 'pagarent' });
  });
});
