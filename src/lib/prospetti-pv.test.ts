// Test di accettazione del motore prospetti PV.
//
// Dal 07/08/2026 la griglia e' quella PagaRent (durate 24-60). I canoni attesi
// sono verificati contro pagarentRata(), che e' la funzione gia' in uso nel
// portale UNIDIMA e rilevata dal calcolatore ufficiale: se qualcuno tocca la
// tabella, questi test cadono.
//
// I tre casi sono impianti reali: B Service, Giaccio Cesare, Nuova Era.
// Nota storica: fino al 07/08/2026 si usava la griglia Rete Rent-Grenke e a 60
// mesi Giaccio dava 945,24. Con PagaRent da' 1.063,20: i due prospetti gia'
// consegnati non sono piu' riproducibili, ed e' voluto.
//
// Girano con: npm test

import { describe, expect, it } from 'vitest';
import {
  autoconsumoStimato,
  buildPayloadPdf,
  calcolaPreventivo,
  coefficientiPerImporto,
  importoQuotabile,
  zonaDaProvincia,
  type InputPreventivo,
} from './prospetti-pv';
import { DURATE, IMPORTO_MAX, IMPORTO_MIN, RISCATTO } from './prospetti-pv-coefficienti';
import { pagarentRata } from '../data/pagarent';

const r2 = (v: number) => Math.round(v * 100) / 100;

const base = {
  comune: 'Baronissi',
  provincia: 'SA',
  forma_giuridica: 'societa-capitali',
  rif_preventivo: 'Preventivo InnovaLux',
  installazione: 'tetto',
} as const;

const B_SERVICE: InputPreventivo = { ...base, cliente: 'B Service SRL', kwp: 20, kwh_accumulo: 10, importo: 24980, durata: 60 };
const GIACCIO: InputPreventivo = { ...base, cliente: 'Giaccio Cesare', kwp: 30, kwh_accumulo: 30, importo: 46980, durata: 60 };
const NUOVA_ERA: InputPreventivo = { ...base, cliente: 'Nuova Era', kwp: 55, kwh_accumulo: 50, importo: 87980, durata: 60 };

describe('durate quotate', () => {
  it('sono le quattro di PagaRent, senza i 72 mesi', () => {
    expect(DURATE).toEqual([24, 36, 48, 60]);
  });
});

describe('caso B Service (20 kWp, 10 kWh, 24.980 euro, Campania)', () => {
  const c = calcolaPreventivo(B_SERVICE);

  it('cade nella zona attesa', () => {
    expect(c.zona).toBe('sud');
    expect(c.irraggiamento).toBe(1450);
  });

  it('stima l autoconsumo al 60 per cento (0,5 kWh per kWp)', () => {
    expect(c.autoconsumoQuota).toBeCloseTo(0.6, 10);
  });

  it('calcola i canoni su tutte le durate', () => {
    expect(c.canoni[24]).toBe(1298.3);
    expect(c.canoni[36]).toBe(899.96);
    expect(c.canoni[48]).toBe(687.69);
    expect(c.canoni[60]).toBe(567.11);
    expect(c.canone).toBe(567.11);
  });

  it('calcola il riscatto a 60 mesi', () => {
    expect(c.riscatto).toBe(749.4);
  });

  it('calcola produzione, autoconsumo e beneficio', () => {
    expect(c.produzione).toBe(29000);
    expect(c.autoKwh).toBe(17400);
    expect(r2(c.beneficioAnno)).toBe(5510);
    expect(r2(c.beneficioMese)).toBe(459.17);
  });

  it('calcola il risparmio fiscale su 60 mesi', () => {
    expect(r2(c.fiscoNol)).toBe(9493.42);
  });

  it('calcola la rata leasing al 6 per cento e gli interessi', () => {
    expect(c.rataLeasing).toBe(479.35);
    expect(r2(c.interessi)).toBe(4030.8);
  });

  it('calcola contributo Sabatini e risparmio IRES da iper', () => {
    expect(r2(c.sabatini)).toBe(2517.98);
    expect(r2(c.iresIper)).toBe(10791.36);
  });

  it('resta in attivo dopo la deducibilita', () => {
    expect(Math.round(c.coperturaCanone * 100)).toBe(81);
    expect(Math.round(c.margineMese)).toBe(50);
  });
});

describe('caso Giaccio Cesare (30 kWp, 30 kWh, 46.980 euro)', () => {
  const c = calcolaPreventivo(GIACCIO);

  it('stima l autoconsumo al 65 per cento (1,0 kWh per kWp)', () => {
    expect(c.autoconsumoQuota).toBeCloseTo(0.65, 10);
  });

  it('calcola canone, beneficio e rata leasing', () => {
    expect(c.canone).toBe(1063.2);
    expect(r2(c.beneficioAnno)).toBe(8591.25);
    expect(c.rataLeasing).toBe(901.52);
  });

  it('con PagaRent il canone non e piu coperto dal risparmio', () => {
    expect(Math.round(c.coperturaCanone * 100)).toBe(67);
    expect(Math.round(c.margineMese)).toBe(-51);
  });
});

describe('caso Nuova Era (55 kWp, 50 kWh, 87.980 euro)', () => {
  const c = calcolaPreventivo(NUOVA_ERA);

  it('calcola canone, beneficio e rata leasing', () => {
    expect(c.canone).toBe(1991.07);
    expect(r2(c.beneficioAnno)).toBe(15641.88);
    expect(c.rataLeasing).toBe(1688.29);
  });
});

describe('coerenza con la tabella PagaRent', () => {
  it('i canoni coincidono con pagarentRata su ogni caso e ogni durata', () => {
    for (const input of [B_SERVICE, GIACCIO, NUOVA_ERA]) {
      const c = calcolaPreventivo(input);
      for (const m of DURATE) {
        expect(c.canoni[m]).toBe(r2(pagarentRata(input.importo, m)!));
      }
    }
  });

  it('i coefficienti risolti per importo coprono tutte le durate', () => {
    const mappa = coefficientiPerImporto(46980);
    expect(Object.keys(mappa).map(Number).sort((a, b) => a - b)).toEqual(DURATE);
  });
});

describe('range quotabile', () => {
  it('accetta gli importi dentro il range verificato', () => {
    expect(importoQuotabile(IMPORTO_MIN)).toBe(true);
    expect(importoQuotabile(IMPORTO_MAX)).toBe(true);
    expect(importoQuotabile(46980)).toBe(true);
  });

  it('rifiuta quelli fuori, invece di inventare un canone', () => {
    expect(importoQuotabile(IMPORTO_MIN - 1)).toBe(false);
    expect(importoQuotabile(IMPORTO_MAX + 1)).toBe(false);
    expect(() => calcolaPreventivo({ ...GIACCIO, importo: 250000 })).toThrow(/fuori_range/);
  });
});

describe('riscatti', () => {
  it('coprono tutte le durate quotate', () => {
    for (const m of DURATE) expect(typeof RISCATTO[m]).toBe('number');
  });

  it('il 24 mesi riusa il valore del 36, in mancanza del dato PagaRent', () => {
    expect(RISCATTO[24]).toBe(RISCATTO[36]);
  });
});

describe('durata consigliata', () => {
  it('sceglie la piu corta in cui il canone netto e coperto', () => {
    // Impianto generoso rispetto all'importo: la copertura arriva presto
    const c = calcolaPreventivo({ ...B_SERVICE, kwp: 60, kwh_accumulo: 60, durata: null });
    expect(c.durataConsigliata).toBeLessThan(60);
  });

  it('ripiega sulla durata piu lunga quando nessuna e coperta', () => {
    const c = calcolaPreventivo({ ...B_SERVICE, kwp: 5, kwh_accumulo: 0, importo: 60000, durata: null });
    expect(c.durataConsigliata).toBe(60);
  });
});

describe('irraggiamento per provincia', () => {
  it('mappa le zone e usa il valore prudente della fascia', () => {
    expect(zonaDaProvincia('MI')).toBe('nord');
    expect(zonaDaProvincia('fi')).toBe('centro');
    expect(zonaDaProvincia('SA')).toBe('sud');
    expect(zonaDaProvincia('CA')).toBe('sud');
    expect(zonaDaProvincia('XX')).toBe('centro');
  });
});

describe('autoconsumo', () => {
  it('senza accumulo dipende dal profilo', () => {
    expect(autoconsumoStimato(20, 0, 'diurno')).toBe(0.4);
    expect(autoconsumoStimato(20, 0, 'h24')).toBe(0.55);
  });

  it('non supera mai il tetto del 75 per cento', () => {
    expect(autoconsumoStimato(10, 100, 'h24')).toBe(0.75);
  });

  it('e limitato dal consumo reale quando dichiarato', () => {
    const c = calcolaPreventivo({ ...B_SERVICE, consumo_annuo: 10000 });
    expect(c.autoKwh).toBe(10000);
    expect(c.autoconsumoCappatoDaConsumi).toBe(true);
    expect(r2(c.beneficioAnno)).toBe(r2(10000 * 0.25 + 19000 * 0.1));
  });

  it('usa il prezzo energia della bolletta quando fornito', () => {
    const c = calcolaPreventivo({ ...B_SERVICE, prezzo_kwh: 0.32 });
    expect(c.prezzoKwh).toBe(0.32);
    expect(c.datiRealiConsumo).toBe(true);
  });
});

describe('payload per il microservizio PDF', () => {
  const payload = buildPayloadPdf(GIACCIO, calcolaPreventivo(GIACCIO)) as Record<string, unknown>;

  it('espone esattamente le chiavi che lo script si aspetta', () => {
    const attese = [
      'slug', 'data_file', 'data_testo', 'soluzione', 'rif_impianto', 'rif_contratto',
      'installazione', 'kwp', 'kwh_accumulo', 'importo', 'irraggiamento', 'autoconsumo',
      'prezzo_kwh', 'prezzo_cessione', 'durata', 'ires', 'irap', 'tasso_leasing',
      'riscatto_leasing', 'sabatini_pct', 'costo_sabatini', 'iper_pct', 'costo_40',
      'testo_ipotesi', 'testo_ipotesi_breve', 'testo_copertura', 'testo_grafico1',
      'fornitore_nome', 'fornitore_citta', 'includi_sabatini', 'includi_iper',
      'ramo', 'con_leasing', 'brand',
    ];
    expect(Object.keys(payload).sort()).toEqual(attese.sort());
  });

  it('senza opzioni resta il prospetto InnovaLux, identico a prima', () => {
    expect(payload.fornitore_nome).toBe('InnovaLux S.r.l.');
    expect(payload.fornitore_citta).toBe('Milano');
    expect(payload.includi_sabatini).toBe(true);
    expect(payload.includi_iper).toBe(true);
    // L'intestazione dei prospetti gia' emessi dice "InnovaLux", non la
    // ragione sociale per esteso: quella riga non deve cambiare.
    expect(String(payload.soluzione)).toMatch(/ InnovaLux$/);
  });

  it('il nome del fornitore arriva dal chiamante e finisce nel prospetto', () => {
    // Era cablato dentro il motore Python: i prospetti di Green-Go uscivano
    // con scritto InnovaLux addosso, sotto gli occhi del cliente finale.
    const altro = buildPayloadPdf(GIACCIO, calcolaPreventivo(GIACCIO), {
      fornitoreNome: 'GREEN-GO SRLS',
      fornitoreCitta: 'Avellino',
    }) as Record<string, unknown>;
    expect(altro.fornitore_nome).toBe('GREEN-GO SRLS');
    expect(String(altro.soluzione)).toContain('GREEN-GO SRLS');
    // Chi non indica l'etichetta breve non deve ritrovarsi InnovaLux addosso
    expect(String(altro.soluzione)).not.toContain('InnovaLux');
  });

  it('senza opzioni resta il documento unico, come per InnovaLux', () => {
    expect(payload.ramo).toBe('tutto');
    expect(payload.con_leasing).toBe(false);
    expect(payload.brand).toBeUndefined();
  });

  it('con i documenti separati il leasing esce solo sopra la soglia', () => {
    const sotto = buildPayloadPdf(
      { ...GIACCIO, importo: 35_000 },
      calcolaPreventivo({ ...GIACCIO, importo: 35_000 }),
      { separati: true },
    ) as Record<string, unknown>;
    expect(sotto.ramo).toBe('separati');
    // 35.000 euro: il leasing non si propone, quindi il documento non esce
    expect(sotto.con_leasing).toBe(false);

    const sopra = buildPayloadPdf(
      { ...GIACCIO, importo: 120_000 },
      calcolaPreventivo({ ...GIACCIO, importo: 120_000 }),
      { separati: true },
    ) as Record<string, unknown>;
    expect(sopra.con_leasing).toBe(true);
  });

  it('il marchio del fornitore viaggia nel payload solo se lo si passa', () => {
    const brandizzato = buildPayloadPdf(GIACCIO, calcolaPreventivo(GIACCIO), {
      separati: true,
      brand: { colore: '#1e6145', nome: 'GREEN-GO SRLS' },
    }) as Record<string, unknown>;
    expect(brandizzato.brand).toMatchObject({ colore: '#1e6145' });
  });

  it('le agevolazioni spente escono dai totali, non solo dai testi', () => {
    const con = calcolaPreventivo(GIACCIO);
    const senza = calcolaPreventivo(GIACCIO, undefined, {
      includiSabatini: false,
      includiIper: false,
    });
    expect(senza.sabatini).toBe(0);
    expect(senza.iresIper).toBe(0);
    expect(senza.conSabatini).toBe(false);
    // Niente agevolazioni, niente pratiche da pagare: il costo netto del
    // leasing sale, ma l'esborso non porta piu' le spese di gestione.
    expect(senza.costoNettoLeasing).toBeGreaterThan(con.costoNettoLeasing);
    expect(con.conSabatini).toBe(true);
    expect(con.conIper).toBe(true);
  });

  it('non fa trapelare coefficienti', () => {
    const dump = JSON.stringify(payload);
    expect(dump).not.toContain('2.26309');
    expect(dump).not.toContain('PagaRent');
    expect(dump).not.toMatch(/fascia/i);
  });

  it('genera i testi narrativi dai numeri reali', () => {
    expect(payload.testo_copertura).toContain('67 per cento del canone');
    // Canone scoperto: il testo lo dice invece di millantare un attivo
    expect(payload.testo_copertura).toContain('resta a carico del cliente');
    expect(payload.testo_ipotesi).toContain('1.450 kWh per kWp');
    expect(payload.testo_ipotesi).toContain('in assenza dei dati di consumo reali');
    expect(payload.slug).toBe('Giaccio_Cesare');
  });

  it('dichiara quando i consumi sono reali invece che stimati', () => {
    const input = { ...GIACCIO, consumo_annuo: 40000, prezzo_kwh: 0.3 };
    const p = buildPayloadPdf(input, calcolaPreventivo(input)) as Record<string, string>;
    expect(p.testo_ipotesi).toContain('dati di consumo reali del cliente');
    expect(p.testo_ipotesi).not.toContain('in assenza dei dati');
  });
});
