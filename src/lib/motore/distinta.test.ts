// La distinta di una proposta di vendita: righe di listino e fuori listino,
// ricontrollate sul server contro il catalogo del fornitore. Il browser si aggira,
// quindi si provano soprattutto i casi storti: ogni riga che non regge deve fermare
// la distinta con il suo motivo e il suo indice.

import { describe, expect, it } from 'vitest';
import type { Categoria } from './config-distinta';
import type { VoceCatalogo } from './carrozzeria';
import { MAX_QUANTITA, MAX_RIGHE, MAX_TOTALE, totaleRighe, validaDistinta } from './distinta';

// --- fixture ----------------------------------------------------------------

const voce = (
  codice: string,
  nome: string,
  prezzo: number,
  attributi: Record<string, unknown>,
  attivo = true,
): VoceCatalogo => ({ id: 1, codice, nome, descrizione: null, prezzo, attributi, ordine: 0, attivo });

// Le categorie del paragrafo 11 della spec
const CAT: Categoria[] = [
  { nome: 'Postazioni di lavoro', settoriTipici: [], postazione: true, ledwall: false },
  { nome: 'Workstation grafiche', settoriTipici: ['58', '59', '60', '62', '71', '72', '73', '74', '90'], postazione: true, ledwall: false },
  { nome: 'Periferiche e tablet', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Server e stampa', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Digital signage e display', settoriTipici: ['45', '46', '47', '55', '56', '59', '68', '73', '77', '79', '82', '85', '86', '90', '93'], postazione: false, ledwall: false },
  { nome: 'LEDwall', settoriTipici: ['45', '46', '47', '55', '56', '59', '68', '73', '77', '79', '82', '85', '86', '90', '93'], postazione: false, ledwall: true },
];

const VOCI: VoceCatalogo[] = [
  voce('LO-AIO-AM242', 'ALL IN ONE ASUS AM242', 1800, { categoria: 'Postazioni di lavoro' }),
  voce('LO-TAB-S10FE', 'TABLET SAMSUNG GALAXY TAB S10 FE', 560, { categoria: 'Periferiche e tablet' }),
  voce('LO-WS-RTX', 'WORKSTATION GRAFICA RTX', 3200, { categoria: 'Workstation grafiche' }),
  voce('LO-SENZA-CAT', 'VOCE SENZA CATEGORIA', 100, {}),
  voce('LO-CAT-IGNOTA', 'VOCE CON CATEGORIA CHE NON ESISTE', 100, { categoria: 'Inventata' }),
];
const VOCI_CON_SPENTA = [...VOCI, voce('LO-SPENTA', 'VOCE SPENTA', 100, { categoria: 'Server e stampa' }, false)];
const VOCI_CON_SCADUTA = [...VOCI, voce('LO-SCADUTA', 'VOCE SCADUTA', 900, { categoria: 'Server e stampa', valido_fino: '2026-01-01' })];

const OGGI = new Date('2026-10-20');

// --- le righe, nei casi del brief ---------------------------------------------

describe('validaDistinta: righe valide', () => {
  it('riga di listino: prezzo trattato, listino accanto, totale arrotondato', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-AIO-AM242', quantita: 3, prezzo: 1750.333 }]);
    expect(r.ok && r.distinta.righe[0]).toMatchObject({ prezzo: 1750.33, listino: 1800, totale: 5250.99, fuoriListino: false });
  });

  it('riga fuori listino con categoria esistente', () => {
    const r = validaDistinta(VOCI, CAT, [{ descrizione: 'LEDwall 3x2 interno', categoria: 'LEDwall', quantita: 1, prezzo: 18000 }]);
    expect(r.ok && r.distinta).toMatchObject({ conLedwall: true, totale: 18000 });
  });

  it('postazioni contano le quantita\' delle categorie con postazione', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-AIO-AM242', quantita: 50 }, { codice: 'LO-TAB-S10FE', quantita: 70 }]);
    expect(r.ok && r.distinta.postazioni).toBe(50);
  });

  it('voce scaduta: proponibile con scaduta true', () => {
    const r = validaDistinta(VOCI_CON_SCADUTA, CAT, [{ codice: 'LO-SCADUTA', quantita: 1 }], OGGI);
    expect(r.ok && r.distinta.righe[0].scaduta).toBe(true); // valido_fino '2026-01-01'
  });

  it('prezzo scritto all\'italiana', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-AIO-AM242', quantita: 1, prezzo: '1.799,50' }]);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.distinta.righe[0].prezzo).toBe(1799.5);
  });
});

describe('validaDistinta: righe respinte', () => {
  it.each([
    [[], 'distinta_vuota'],
    [[{ codice: 'NON-C-E', quantita: 1 }], 'voce_non_trovata'],
    [[{ codice: 'LO-AIO-AM242', quantita: 0 }], 'quantita_non_valida'],
    [[{ codice: 'LO-AIO-AM242', quantita: 1.5 }], 'quantita_non_valida'],
    [[{ codice: 'LO-AIO-AM242', quantita: 1, prezzo: -1 }], 'prezzo_non_valido'],
    [[{ descrizione: 'X', categoria: 'Inventata', quantita: 1, prezzo: 10 }], 'categoria_non_valida'],
    [[{ descrizione: ' ', categoria: 'LEDwall', quantita: 1, prezzo: 10 }], 'descrizione_mancante'],
    [[{ codice: 'LO-AIO-AM242', quantita: 10_000, prezzo: 2000 }], 'importo_non_valido'],
  ])('%j -> %s', (righe, errore) => expect(validaDistinta(VOCI, CAT, righe)).toMatchObject({ ok: false, error: errore }));

  it('voce spenta: non trovata', () =>
    expect(validaDistinta(VOCI_CON_SPENTA, CAT, [{ codice: 'LO-SPENTA', quantita: 1 }])).toMatchObject({
      ok: false,
      error: 'voce_non_trovata',
      riga: 0,
    }));
});

// --- il resto delle regole -----------------------------------------------------

describe('riga di listino', () => {
  it('senza prezzo vale il listino; descrizione e categoria vengono dalla voce', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 2 }]);
    expect(r.ok && r.distinta.righe[0]).toEqual({
      codice: 'LO-TAB-S10FE',
      descrizione: 'TABLET SAMSUNG GALAXY TAB S10 FE',
      categoria: 'Periferiche e tablet',
      quantita: 2,
      prezzo: 560,
      listino: 560,
      fuoriListino: false,
      scaduta: false,
      totale: 1120,
    });
  });

  it('descrizione e categoria mandate dal browser su una riga di listino non contano', () => {
    const r = validaDistinta(VOCI, CAT, [
      { codice: 'LO-TAB-S10FE', quantita: 1, descrizione: 'ALTRO', categoria: 'LEDwall' },
    ]);
    expect(r.ok && r.distinta.righe[0]).toMatchObject({ descrizione: 'TABLET SAMSUNG GALAXY TAB S10 FE', categoria: 'Periferiche e tablet' });
    expect(r.ok && r.distinta.conLedwall).toBe(false);
  });

  it('il codice si legge senza maiuscole e spazi, come lo normalizza l\'import', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: ' lo-aio-am242 ', quantita: 1 }]);
    expect(r.ok && r.distinta.righe[0].codice).toBe('LO-AIO-AM242');
  });

  it('codice vuoto non diventa una riga fuori listino: voce non trovata', () => {
    expect(validaDistinta(VOCI, CAT, [{ codice: '', descrizione: 'X', categoria: 'LEDwall', quantita: 1, prezzo: 10 }]))
      .toMatchObject({ ok: false, error: 'voce_non_trovata', riga: 0 });
  });

  it('prezzo vuoto vale come assente: si usa il listino', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-AIO-AM242', quantita: 1, prezzo: '' }]);
    expect(r.ok && r.distinta.righe[0].prezzo).toBe(1800);
  });

  it('voce senza categoria o con una categoria che il fornitore non ha: categoria non valida', () => {
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-SENZA-CAT', quantita: 1 }])).toMatchObject({ ok: false, error: 'categoria_non_valida', riga: 0 });
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-CAT-IGNOTA', quantita: 1 }])).toMatchObject({ ok: false, error: 'categoria_non_valida', riga: 0 });
  });
});

describe('riga fuori listino', () => {
  it('codice null, nessun listino, marcata fuori listino e mai scaduta', () => {
    const r = validaDistinta(VOCI, CAT, [{ descrizione: 'SERVER SU MISURA', categoria: 'Server e stampa', quantita: 2, prezzo: '4.200,00' }]);
    expect(r.ok && r.distinta.righe[0]).toEqual({
      codice: null,
      descrizione: 'SERVER SU MISURA',
      categoria: 'Server e stampa',
      quantita: 2,
      prezzo: 4200,
      listino: null,
      fuoriListino: true,
      scaduta: false,
      totale: 8400,
    });
  });

  it('la descrizione si ripulisce e si ferma a 200 caratteri', () => {
    const r = validaDistinta(VOCI, CAT, [{ descrizione: `  ${'A'.repeat(250)}  `, categoria: 'LEDwall', quantita: 1, prezzo: 10 }]);
    expect(r.ok && r.distinta.righe[0].descrizione).toBe('A'.repeat(200));
  });

  it('senza prezzo non c\'e\' listino a cui ripiegare', () => {
    expect(validaDistinta(VOCI, CAT, [{ descrizione: 'X', categoria: 'LEDwall', quantita: 1 }])).toMatchObject({ ok: false, error: 'prezzo_non_valido', riga: 0 });
    expect(validaDistinta(VOCI, CAT, [{ descrizione: 'X', categoria: 'LEDwall', quantita: 1, prezzo: '' }])).toMatchObject({ ok: false, error: 'prezzo_non_valido' });
  });

  it('una riga che non e\' nemmeno un oggetto: descrizione mancante', () => {
    expect(validaDistinta(VOCI, CAT, [null])).toMatchObject({ ok: false, error: 'descrizione_mancante', riga: 0 });
    expect(validaDistinta(VOCI, CAT, ['LO-AIO-AM242'])).toMatchObject({ ok: false, error: 'descrizione_mancante', riga: 0 });
  });

  it('categoria o descrizione che non sono testo non passano', () => {
    expect(validaDistinta(VOCI, CAT, [{ descrizione: 'X', categoria: 5, quantita: 1, prezzo: 10 }])).toMatchObject({ ok: false, error: 'categoria_non_valida' });
    expect(validaDistinta(VOCI, CAT, [{ descrizione: { a: 1 }, categoria: 'LEDwall', quantita: 1, prezzo: 10 }])).toMatchObject({ ok: false, error: 'descrizione_mancante' });
  });

  it('la categoria si confronta col nome esatto: una scritta a modo suo non passa', () => {
    expect(validaDistinta(VOCI, CAT, [{ descrizione: 'X', categoria: 'ledwall', quantita: 1, prezzo: 10 }])).toMatchObject({ ok: false, error: 'categoria_non_valida' });
  });
});

describe('quantita e prezzo', () => {
  it('quantita: intero da 1 a MAX_QUANTITA, anche scritto come testo', () => {
    expect(MAX_QUANTITA).toBe(10_000);
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: '3' }]).ok).toBe(true);
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: MAX_QUANTITA, prezzo: 1 }]).ok).toBe(true);
    for (const q of [MAX_QUANTITA + 1, -2, NaN, 'molte', null, undefined, Infinity, 'Infinity']) {
      expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: q }])).toMatchObject({ ok: false, error: 'quantita_non_valida' });
    }
  });

  it('punto come separatore delle migliaia e niente virgola: ambiguo, non passa', () => {
    // "1.500" per numero() e' 1,5 e "1.000" e' 1: mille volte meno di quello che si intendeva
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: '1.500' }])).toMatchObject({ ok: false, error: 'prezzo_non_valido', riga: 0 });
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: '1.000' }])).toMatchObject({ ok: false, error: 'quantita_non_valida', riga: 0 });
    // Vale anche con piu' gruppi, col simbolo dell'euro e sulle righe fuori listino
    for (const p of ['12.345', '1.234.567', ' 1.500 ', '1.500 €', '€ 1.500']) {
      expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: p }])).toMatchObject({ ok: false, error: 'prezzo_non_valido' });
    }
    expect(validaDistinta(VOCI, CAT, [{ descrizione: 'X', categoria: 'LEDwall', quantita: 1, prezzo: '1.500' }])).toMatchObject({ ok: false, error: 'prezzo_non_valido' });
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: '2.500' }])).toMatchObject({ ok: false, error: 'quantita_non_valida' });
  });

  it('le scritture non ambigue restano: virgola, numero vero, nessun punto', () => {
    const prezzo = (p: unknown) => {
      const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: p }]);
      return r.ok ? r.distinta.righe[0].prezzo : r;
    };
    expect(prezzo('1.500,00')).toBe(1500);
    expect(prezzo('1.500,5')).toBe(1500.5);
    expect(prezzo(1500)).toBe(1500);
    expect(prezzo('1500')).toBe(1500);
    expect(prezzo('1.5')).toBe(1.5); // un decimale solo con il punto: non e' un gruppo di migliaia
    expect(prezzo('1.234.567,89')).toBe(1234567.89);
    const q = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: '1000', prezzo: 1 }]);
    expect(q.ok && q.distinta.righe[0].quantita).toBe(1000);
    const n = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1000, prezzo: 1 }]);
    expect(n.ok && n.distinta.righe[0].quantita).toBe(1000);
  });

  it('prezzo: zero, negativo, illeggibile o infinito non passano', () => {
    for (const p of [0, -0.5, 'gratis', 'Infinity', NaN, Infinity, {}]) {
      expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: p }])).toMatchObject({ ok: false, error: 'prezzo_non_valido', riga: 0 });
    }
  });

  it('un prezzo che arrotondato al centesimo fa zero non passa', () => {
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: 0.004 }])).toMatchObject({ ok: false, error: 'prezzo_non_valido' });
  });

  it('l\'errore dice quale riga: l\'indice parte da zero', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1 }, { codice: 'LO-AIO-AM242', quantita: 1 }, { codice: 'NON-C-E', quantita: 1 }]);
    expect(r).toMatchObject({ ok: false, error: 'voce_non_trovata', riga: 2 });
  });
});

describe('numero di righe e importo', () => {
  const riga = { codice: 'LO-TAB-S10FE', quantita: 1 };

  it('fino a MAX_RIGHE passa, oltre: troppe righe, senza indicare una riga', () => {
    expect(MAX_RIGHE).toBe(60);
    expect(validaDistinta(VOCI, CAT, Array(MAX_RIGHE).fill(riga)).ok).toBe(true);
    expect(validaDistinta(VOCI, CAT, Array(MAX_RIGHE + 1).fill(riga))).toMatchObject({ ok: false, error: 'troppe_righe', riga: null });
  });

  it('non e\' un elenco o e\' vuoto: distinta vuota', () => {
    for (const g of [[], null, undefined, 'LO-AIO-AM242', { 0: riga }]) {
      expect(validaDistinta(VOCI, CAT, g)).toMatchObject({ ok: false, error: 'distinta_vuota', riga: null });
    }
  });

  it('una riga sopra MAX_TOTALE ferma quella riga; le righe che sommate lo superano fermano la distinta', () => {
    expect(MAX_TOTALE).toBe(10_000_000);
    expect(validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: 10_000_001 }])).toMatchObject({ ok: false, error: 'importo_non_valido', riga: 0 });
    const meta = { codice: 'LO-TAB-S10FE', quantita: 1, prezzo: 6_000_000 };
    expect(validaDistinta(VOCI, CAT, [meta, meta])).toMatchObject({ ok: false, error: 'importo_non_valido', riga: null });
  });

  it('esattamente MAX_TOTALE passa', () => {
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: MAX_TOTALE }]);
    expect(r.ok && r.distinta.totale).toBe(MAX_TOTALE);
  });
});

describe('scadenza del listino', () => {
  const con = (valido_fino: unknown) => [...VOCI, voce('LO-V', 'VOCE', 100, { categoria: 'Server e stampa', valido_fino })];
  const scaduta = (valido_fino: unknown, oggi: Date) => {
    const r = validaDistinta(con(valido_fino), CAT, [{ codice: 'LO-V', quantita: 1 }], oggi);
    return r.ok && r.distinta.righe[0].scaduta;
  };

  it('scade il giorno dopo valido_fino, non il giorno stesso', () => {
    expect(scaduta('2026-10-20', new Date('2026-10-20T12:00:00Z'))).toBe(false);
    expect(scaduta('2026-10-19', new Date('2026-10-20T12:00:00Z'))).toBe(true);
  });

  it('il giorno e\' quello italiano: a mezzanotte e mezza di Roma e\' gia\' il giorno dopo', () => {
    // 23:30 UTC del 31 dicembre sono le 00:30 del 1 gennaio a Roma
    expect(scaduta('2026-12-31', new Date('2026-12-31T23:30:00Z'))).toBe(true);
    // 22:30 UTC sono le 23:30 del 31 dicembre a Roma
    expect(scaduta('2026-12-31', new Date('2026-12-31T22:30:00Z'))).toBe(false);
  });

  it('senza validita\' non scade; con una validita\' illeggibile si chiede di riconfermare', () => {
    expect(scaduta(undefined, OGGI)).toBe(false);
    expect(scaduta(null, OGGI)).toBe(false);
    expect(scaduta('', OGGI)).toBe(false);
    expect(scaduta('domani', OGGI)).toBe(true);
    expect(scaduta(20261231, OGGI)).toBe(true);
  });
});

// --- i totali ------------------------------------------------------------------

describe('totaleRighe', () => {
  it('somma i totali di riga gia\' arrotondati, non il prezzo esatto', () => {
    // Due righe da mezzo centesimo: 0,01 + 0,01 = 0,02; sommando prima si avrebbe 0,01
    expect(totaleRighe([{ quantita: 1, prezzo: 0.005 }, { quantita: 1, prezzo: 0.005 }])).toBe(0.02);
  });

  it('prezzo per quantita\', arrotondato al centesimo', () => {
    expect(totaleRighe([{ quantita: 3, prezzo: 1750.33 }])).toBe(5250.99);
    expect(totaleRighe([{ quantita: 7, prezzo: 19.99 }, { quantita: 2, prezzo: 0.1 }])).toBe(140.13);
  });

  it('il mezzo centesimo sale anche quando il decimale binario lo farebbe scendere', () => {
    // 1,005 * 100 in virgola mobile fa 100,49999999999999
    expect(totaleRighe([{ quantita: 1, prezzo: 1.005 }])).toBe(1.01);
    const r = validaDistinta(VOCI, CAT, [{ codice: 'LO-TAB-S10FE', quantita: 1, prezzo: 1.005 }]);
    expect(r.ok && r.distinta.righe[0].prezzo).toBe(1.01);
  });

  it('nessuna riga: zero', () => expect(totaleRighe([])).toBe(0));

  it('il totale della distinta e\' quello di totaleRighe sulle sue righe', () => {
    const r = validaDistinta(VOCI, CAT, [
      { codice: 'LO-AIO-AM242', quantita: 3, prezzo: 1750.333 },
      { codice: 'LO-TAB-S10FE', quantita: 7, prezzo: '559,99' },
      { descrizione: 'LEDWALL', categoria: 'LEDwall', quantita: 1, prezzo: 18000.005 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.distinta.totale).toBe(totaleRighe(r.distinta.righe));
      expect(r.distinta.totale).toBe(2717093 / 100); // 5.250,99 + 3.919,93 + 18.000,01
    }
  });
});
