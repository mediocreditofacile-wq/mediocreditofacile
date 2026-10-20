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
import { DURATA_EVIDENZA, instrada, type ClienteInstradamento } from './instradamento';

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
  it('cliente oltre 5 milioni e beni da 150.000: 60 mesi, nessuna maggiorazione', () => {
    const r = instrada(LO, grande, 150_000, OGGI)!;
    expect(r).toMatchObject({
      canale: 'econocom', beni: 150_000, maggiorazione: 0, imponibile: 150_000,
      daConfermare: true, richiedeProvvisorio: false,
    });
    expect(r.rate.map((x) => x.durata)).toEqual([60]);
    // 150.000 x 2,02% = 3.030
    expect(r.rate[0].canone).toBe(3_030);
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
