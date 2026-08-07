// Test di accettazione del motore prospetti PV.
// I valori attesi vengono dai due prospetti gia' emessi e validati a mano:
// B Service (9 luglio 2026) e Giaccio Cesare (3 agosto 2026).
//
// Girano con: npm test

import { describe, expect, it } from 'vitest';
import {
  autoconsumoStimato,
  buildPayloadPdf,
  calcolaPreventivo,
  fasciaDi,
  zonaDaProvincia,
  type InputPreventivo,
} from './prospetti-pv';

const r2 = (v: number) => Math.round(v * 100) / 100;

const B_SERVICE: InputPreventivo = {
  cliente: 'B Service SRL',
  comune: 'Baronissi',
  provincia: 'SA',
  forma_giuridica: 'societa-capitali',
  rif_preventivo: 'Preventivo InnovaLux',
  kwp: 20,
  kwh_accumulo: 10,
  importo: 24980,
  installazione: 'tetto',
  durata: 60,
};

const GIACCIO: InputPreventivo = {
  cliente: 'Giaccio Cesare',
  comune: 'Baronissi',
  provincia: 'SA',
  forma_giuridica: 'societa-capitali',
  rif_preventivo: 'Preventivo InnovaLux del 30/07/2026',
  kwp: 30,
  kwh_accumulo: 30,
  importo: 46980,
  installazione: 'tetto',
  durata: 60,
};

describe('caso B Service (20 kWp, 10 kWh, 24.980 euro, Campania)', () => {
  const c = calcolaPreventivo(B_SERVICE);

  it('cade nella fascia e nella zona attese', () => {
    expect(c.fascia).toBe('f3');
    expect(c.zona).toBe('sud');
    expect(c.irraggiamento).toBe(1450);
  });

  it('stima l autoconsumo al 60 per cento (0,5 kWh per kWp)', () => {
    expect(c.autoconsumoQuota).toBeCloseTo(0.6, 10);
  });

  it('calcola i canoni su tutte le durate', () => {
    expect(c.canoni[36]).toBe(791.12);
    expect(c.canoni[48]).toBe(613.26);
    expect(c.canoni[60]).toBe(507.59);
    expect(c.canoni[72]).toBe(437.9);
    expect(c.canone).toBe(507.59);
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
    expect(r2(c.fiscoNol)).toBe(8497.06);
  });

  it('calcola la rata leasing al 6 per cento e gli interessi', () => {
    expect(c.rataLeasing).toBe(479.35);
    expect(r2(c.interessi)).toBe(4030.8);
  });

  it('calcola contributo Sabatini e risparmio IRES da iper', () => {
    expect(r2(c.sabatini)).toBe(2517.98);
    expect(r2(c.iresIper)).toBe(10791.36);
  });
});

describe('caso Giaccio Cesare (30 kWp, 30 kWh, 46.980 euro)', () => {
  const c = calcolaPreventivo(GIACCIO);

  it('cade nella fascia oltre 40.000', () => {
    expect(c.fascia).toBe('f4');
  });

  it('stima l autoconsumo al 65 per cento (1,0 kWh per kWp)', () => {
    expect(c.autoconsumoQuota).toBeCloseTo(0.65, 10);
  });

  it('calcola canone, beneficio e rata leasing', () => {
    expect(c.canone).toBe(945.24);
    expect(r2(c.beneficioAnno)).toBe(8591.25);
    expect(c.rataLeasing).toBe(901.52);
  });

  it('riproduce copertura e margine dei testi del prospetto emesso', () => {
    // "copre circa il 76 per cento del canone", "in attivo di circa 34 euro al mese"
    expect(Math.round(c.coperturaCanone * 100)).toBe(76);
    expect(Math.round(c.margineMese)).toBe(34);
    // "A 72 mesi ... 814,16 euro ... circa 129 euro mensili"
    expect(c.canoni[72]).toBe(814.16);
  });

  it('consiglia 60 mesi, la piu corta coperta dal beneficio', () => {
    expect(c.durataConsigliata).toBe(60);
  });
});

describe('durata consigliata', () => {
  it('sceglie la piu corta in cui il canone netto e coperto', () => {
    // B Service: a 48 mesi 613,26 x 0,721 = 442,16 < 459,17 beneficio mensile
    const c = calcolaPreventivo({ ...B_SERVICE, durata: null });
    expect(c.durataConsigliata).toBe(48);
    expect(c.durata).toBe(48);
  });

  it('ripiega su 72 mesi quando nessuna durata e coperta', () => {
    // Impianto sovradimensionato rispetto al beneficio: nessuna copertura
    const c = calcolaPreventivo({ ...B_SERVICE, kwp: 5, kwh_accumulo: 0, importo: 60000, durata: null });
    expect(c.durataConsigliata).toBe(72);
  });
});

describe('fasce di importo', () => {
  it('rispetta gli scaglioni', () => {
    expect(fasciaDi(8000)).toBe('f1');
    expect(fasciaDi(8001)).toBe('f2');
    expect(fasciaDi(20000)).toBe('f2');
    expect(fasciaDi(20001)).toBe('f3');
    expect(fasciaDi(40000)).toBe('f3');
    expect(fasciaDi(40001)).toBe('f4');
  });
});

describe('irraggiamento per provincia', () => {
  it('mappa le zone e usa il valore prudente della fascia', () => {
    expect(zonaDaProvincia('MI')).toBe('nord');
    expect(zonaDaProvincia('fi')).toBe('centro');
    expect(zonaDaProvincia('SA')).toBe('sud');
    expect(zonaDaProvincia('CA')).toBe('sud');
    // provincia sconosciuta: default centro
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
    // 29.000 kWh prodotti, 60% sarebbe 17.400: con 10.000 kWh di consumo si ferma li'
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
    ];
    expect(Object.keys(payload).sort()).toEqual(attese.sort());
  });

  it('non fa trapelare coefficienti o fascia', () => {
    const dump = JSON.stringify(payload);
    expect(dump).not.toContain('2.012');
    expect(dump).not.toContain('ESG');
    expect(dump).not.toMatch(/fascia/i);
  });

  it('genera i testi narrativi dai numeri reali', () => {
    expect(payload.testo_copertura).toContain('76 per cento del canone');
    expect(payload.testo_copertura).toContain('34 euro al mese');
    expect(payload.testo_copertura).toContain('814,16');
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
