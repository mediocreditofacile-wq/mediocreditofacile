// Il semaforo sui criteri del locatore (Duplex). Regole decise da Alberto il
// 30/09 e il 15/10/2026: se cambiano, deve cadere un test.

import { describe, expect, it } from 'vitest';
import {
  annoBilancioAtteso,
  classeForma,
  mesiDiAttivita,
  RIGA_PERCORSO_PARALLELO,
  valutaLocatore,
  type DatiLocatore,
} from './semaforo-locatore';

const OGGI = new Date(2026, 9, 15); // 15 ottobre 2026: bilancio atteso il 2025
const BASE: DatiLocatore = {
  formaCodice: 'SR', attiva: true, cessata: false, inizioAttivita: '2010-03-01',
  volumeAffari: 850_000, patrimonioNetto: 310_000, annoBilancio: 2025,
};
const v = (d: Partial<DatiLocatore>, importo: number | null = 3500, eventi: Parameters<typeof valutaLocatore>[2] = 'assenti', oggi = OGGI) =>
  valutaLocatore({ ...BASE, ...d }, importo, eventi, oggi);

describe('classe della forma giuridica', () => {
  it('dal codice del registro', () => {
    expect(classeForma('SR')).toBe('capitali');
    expect(classeForma('RS')).toBe('capitali');
    expect(classeForma('SC')).toBe('capitali');
    expect(classeForma('DI')).toBe('individuale');
    expect(classeForma('SN')).toBe('persone');
    expect(classeForma('AS')).toBe('persone');
    expect(classeForma('')).toBe('non-classificata');
    expect(classeForma(null)).toBe('non-classificata');
  });
});

describe('anno di bilancio atteso e mesi di attività', () => {
  it('dal 1° agosto è quello appena chiuso', () => {
    expect(annoBilancioAtteso(new Date(2026, 6, 31))).toBe(2024);
    expect(annoBilancioAtteso(new Date(2026, 7, 1))).toBe(2025);
    expect(annoBilancioAtteso(OGGI)).toBe(2025);
  });
  it('conta i mesi interi', () => {
    expect(mesiDiAttivita('2024-10-15', OGGI)).toBe(24);
    expect(mesiDiAttivita('2024-10-16', OGGI)).toBe(23);
  });
});

describe('verde scuro', () => {
  it('importo non superiore al patrimonio, volume positivo, nessun evento', () => {
    const e = v({});
    expect(e.semaforo).toBe('verde-scuro');
    expect(e.etichetta).toBe('In linea con i criteri');
    expect(e.provvisorio).toBe(false);
    expect(v({ patrimonioNetto: 3500 }).semaforo).toBe('verde-scuro');
  });
});

describe('verde chiaro', () => {
  it('patrimonio sotto l importo', () => {
    const e = v({ patrimonioNetto: 2000 });
    expect(e.semaforo).toBe('verde-chiaro');
    expect(e.etichetta).toBe('Buone basi');
  });
  it('eventi in verifica: provvisorio', () => {
    const e = v({}, 3500, 'in-verifica');
    expect(e.semaforo).toBe('verde-chiaro');
    expect(e.provvisorio).toBe(true);
    expect(e.righe.join(' ')).toMatch(/in verifica/);
  });
  it('eventi non pervenuti o non verificati: si ferma al verde chiaro', () => {
    expect(v({}, 3500, 'non-pervenuti').semaforo).toBe('verde-chiaro');
    expect(v({}, 3500, 'non-pervenuti').provvisorio).toBe(false);
    expect(v({}, 3500, 'non-avviata').semaforo).toBe('verde-chiaro');
  });
  it('prima valutazione senza importo', () => {
    const e = v({}, null);
    expect(e.semaforo).toBe('verde-chiaro');
    expect(e.righe.join(' ')).toMatch(/confronto tra patrimonio e importo/);
  });
  it('ditte individuali e società di persone senza bilancio', () => {
    const ditta = { formaCodice: 'DI', volumeAffari: null, patrimonioNetto: null, annoBilancio: null, inizioAttivita: '2015-01-10' };
    expect(v(ditta).semaforo).toBe('verde-chiaro');
    expect(v({ ...ditta, formaCodice: 'SN' }).semaforo).toBe('verde-chiaro');
  });
});

describe('giallo', () => {
  it('patrimonio a zero o negativo', () => {
    expect(v({ patrimonioNetto: 0 }).semaforo).toBe('giallo');
    expect(v({ patrimonioNetto: -12000 }).righe).toContain('Patrimonio netto a zero o negativo.');
  });
  it('manca il bilancio atteso', () => {
    const e = v({ annoBilancio: 2024 });
    expect(e.semaforo).toBe('giallo');
    expect(e.etichetta).toBe('Da istruire');
    expect(e.righe.join(' ')).toContain('Chiedi al cliente il bilancio 2025 con la ricevuta di deposito.');
  });
  it('lo stesso bilancio il 31 luglio è ancora in regola', () => {
    expect(v({ annoBilancio: 2024 }, 3500, 'assenti', new Date(2026, 6, 31)).semaforo).toBe('verde-scuro');
  });
  it('società di capitali senza bilancio', () => {
    const e = v({ annoBilancio: null, patrimonioNetto: null, volumeAffari: null });
    expect(e.semaforo).toBe('giallo');
    expect(e.righe.join(' ')).toMatch(/Bilancio non disponibile/);
  });
  it('forma o stato mancanti', () => {
    expect(v({ formaCodice: null }).semaforo).toBe('giallo');
    expect(v({ attiva: null }).semaforo).toBe('giallo');
    expect(v({ inizioAttivita: null }).semaforo).toBe('giallo');
  });
});

describe('rosso', () => {
  it('Difficile: cessata, non attiva, volume non positivo, eventi presenti', () => {
    for (const d of [{ cessata: true }, { attiva: false }, { volumeAffari: 0 }, { volumeAffari: -5 }]) {
      const e = v(d);
      expect(e.semaforo).toBe('rosso');
      expect(e.etichetta).toBe('Difficile');
    }
    const ev = v({}, 3500, 'presenti');
    expect(ev.semaforo).toBe('rosso');
    expect(ev.provvisorio).toBe(false);
  });
  it('sotto i due anni: percorso parallelo', () => {
    const e = v({ inizioAttivita: '2024-10-16' });
    expect(e.semaforo).toBe('rosso');
    expect(e.etichetta).toBe('Sotto i due anni: percorso parallelo');
    expect(e.righe).toEqual([RIGA_PERCORSO_PARALLELO]);
    expect(v({ inizioAttivita: '2024-10-15' }).semaforo).toBe('verde-scuro');
  });
  it('Difficile prevale sui due anni', () => {
    expect(v({ inizioAttivita: '2025-06-01', cessata: true }).etichetta).toBe('Difficile');
  });
});

describe('mai promesse', () => {
  it('nessun esito parla di approvazione o nomina il locatore', () => {
    const esiti = [v({}), v({ patrimonioNetto: 0 }), v({ cessata: true }), v({ inizioAttivita: '2025-06-01' }), v({}, null, 'in-verifica')];
    for (const e of esiti) expect(JSON.stringify(e)).not.toMatch(/approvat|grenke/i);
  });
});
