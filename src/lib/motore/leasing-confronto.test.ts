// Leasing a tre partner affiancati, ciascuno a una condizione fissa scelta per spread.
//
// I confronti sulle rate non scrivono numeri a mano: ricalcolano con
// calcolaRataLeasingPartner dallo stesso listino, cosi' il test non dipende
// dall'Euribor. Le rate di riferimento della spec valgono solo con l'Euribor di
// quel giorno (2,66) e girano solo se e' ancora quello.

import { describe, expect, it } from 'vitest';
import {
  ALBA,
  CREDEM,
  EURIBOR_3M,
  SELLA,
  calcolaRataLeasingPartner,
  getCondizioneFornitori,
  type PartnerLeasing,
} from '../../data/leasing';
import type { ConfigMezzi } from './config-mezzi';
import { leasingConfronto, spreadPerDurata } from './leasing-confronto';
import { DURATE_LEASING_MOTORE, leasingPartner } from './proposte';

const r2 = (v: number) => Math.round(v * 100) / 100;

// Le condizioni della spec, sezione 5: Sella 2,25 ovunque, Credem 2,90 ovunque,
// Alba 3,10 fino a 48 mesi e 2,50 da 60 in su
const CFG: ConfigMezzi['leasing'] = {
  anticipoPerc: 10,
  partner: [
    { partner: 'sella', spreadFinoA48: 2.25, spreadDa60: 2.25 },
    { partner: 'credem', spreadFinoA48: 2.9, spreadDa60: 2.9 },
    { partner: 'alba', spreadFinoA48: 3.1, spreadDa60: 2.5 },
  ],
};

const LISTINO: Record<string, PartnerLeasing> = { sella: SELLA, credem: CREDEM, alba: ALBA };

// Id attesi dal listino: la condizione scelta per ogni gruppo di durate
const ID_ATTESI: Record<string, { finoA48: number; da60: number }> = {
  sella: { finoA48: 397300, da60: 397300 },
  credem: { finoA48: 391663, da60: 391663 },
  alba: { finoA48: 394804, da60: 394812 },
};

const rataDi = (confronto: ReturnType<typeof leasingConfronto>, partner: string, durata: number) =>
  confronto.find((c) => c.partner === partner)!.righe.find((r) => r.durata === durata)!.rata;

describe('leasingConfronto: struttura', () => {
  const c = leasingConfronto(CFG, 50000, 10);

  it('un elemento per partner, nell\'ordine della configurazione', () => {
    expect(c.map((x) => x.partner)).toEqual(['sella', 'credem', 'alba']);
    const rovesciato = leasingConfronto({ ...CFG, partner: [...CFG.partner].reverse() }, 50000, 10);
    expect(rovesciato.map((x) => x.partner)).toEqual(['alba', 'credem', 'sella']);
  });

  it('il nome e\' l\'etichetta del listino', () => {
    expect(c.map((x) => x.nome)).toEqual(['Sella Leasing', 'Credem Leasing', 'Alba Leasing']);
  });

  it('una riga per ciascuna durata del motore, senza motivo', () => {
    for (const p of c) {
      expect(p.righe.map((r) => r.durata)).toEqual(DURATE_LEASING_MOTORE);
      expect(p.motivo).toBeNull();
    }
  });

  it('con una configurazione vuota non c\'e\' nessun partner', () => {
    expect(leasingConfronto({ anticipoPerc: 10, partner: [] }, 50000, 10)).toEqual([]);
  });
});

describe('leasingConfronto: la condizione dipende dal gruppo di durate', () => {
  const importo = 50000;
  const c = leasingConfronto(CFG, importo, 10);

  for (const p of c) {
    const listino = LISTINO[p.partner];
    for (const r of p.righe) {
      const id = r.durata <= 48 ? ID_ATTESI[p.partner].finoA48 : ID_ATTESI[p.partner].da60;
      it(`${p.partner} a ${r.durata} mesi usa la condizione ${id}`, () => {
        const attesa = calcolaRataLeasingPartner(listino, importo, r.durata, 10, 1, id);
        expect(r.rata).toBe(r2(attesa.rataMensile));
        expect(r.numRate).toBe(attesa.numRate);
        expect(r.anticipo).toBe(r2(attesa.anticipo));
        expect(r.riscatto).toBe(r2(attesa.riscatto));
        expect(r.riscattoPerc).toBe(1);
        expect(r.speseIstruttoria).toBe(listino.speseIstruttoria);
        expect(r.speseIncassoRata).toBe(listino.speseIncassoRata);
      });
    }
  }

  it('Alba da 60 mesi usa 2,50 e non lo spread medio del listino (3,00)', () => {
    const conMedio = r2(
      calcolaRataLeasingPartner(ALBA, importo, 60, 10, 1, getCondizioneFornitori(ALBA, 60).id).rataMensile,
    );
    expect(rataDi(c, 'alba', 60)).toBeLessThan(conMedio);
  });

  it('l\'anticipo passato arriva nelle righe', () => {
    const c20 = leasingConfronto(CFG, 50000, 20);
    for (const p of c20) {
      for (const r of p.righe) {
        expect(r.anticipoPerc).toBe(20);
        expect(r.anticipo).toBe(10000);
      }
    }
    // A parita' di tutto il resto, un anticipo piu' alto abbassa la rata
    expect(rataDi(c20, 'alba', 60)).toBeLessThan(rataDi(c, 'alba', 60));
  });
});

describe('leasingConfronto: limiti di importo del partner', () => {
  const FUORI = 'Importo fuori dai limiti di questo partner.';

  it('sotto il minimo di Sella (9.000) Sella resta con il motivo, gli altri hanno le righe', () => {
    const c = leasingConfronto(CFG, 8000, 10);
    const [sella, credem, alba] = c;
    expect(sella.righe).toEqual([]);
    expect(sella.motivo).toBe(FUORI);
    expect(sella.nome).toBe('Sella Leasing');
    expect(credem.righe.length).toBe(DURATE_LEASING_MOTORE.length);
    expect(credem.motivo).toBeNull();
    expect(alba.righe.length).toBe(DURATE_LEASING_MOTORE.length);
    expect(alba.motivo).toBeNull();
  });

  it('al minimo esatto di Sella le righe ci sono', () => {
    const [sella] = leasingConfronto(CFG, SELLA.importoMin, 10);
    expect(sella.righe.length).toBe(DURATE_LEASING_MOTORE.length);
    expect(sella.motivo).toBeNull();
  });

  it('sotto il minimo di tutti (4.000) nessuno ha righe e tutti dicono perche\'', () => {
    for (const p of leasingConfronto(CFG, 4000, 10)) {
      expect(p.righe).toEqual([]);
      expect(p.motivo).toBe(FUORI);
    }
  });

  it('sopra il massimo del partner il partner resta senza righe e con il motivo', () => {
    for (const p of leasingConfronto(CFG, 10_000_000, 10)) {
      expect(p.righe).toEqual([]);
      expect(p.motivo).toBe(FUORI);
    }
  });
});

describe('leasingConfronto: verso il browser', () => {
  it('nell\'uscita non c\'e\' nessuno spread, tasso o provvigione', () => {
    const json = JSON.stringify(leasingConfronto(CFG, 50000, 10));
    expect(json).not.toMatch(/spread|tasso|provvigione|euribor/i);
  });
});

describe('spreadPerDurata', () => {
  const alba = CFG.partner[2];

  it('fino a 48 mesi lo spread "fino a 48", da 60 mesi quello "da 60"', () => {
    expect([36, 48].map((d) => spreadPerDurata(alba, d))).toEqual([3.1, 3.1]);
    expect([60, 72, 84].map((d) => spreadPerDurata(alba, d))).toEqual([2.5, 2.5, 2.5]);
  });
});

describe('rate di riferimento della spec (Euribor 3M 2,66)', () => {
  it.runIf(EURIBOR_3M === 2.66)('50.000 e 100.000 euro a 36 e 60 mesi', () => {
    const c50 = leasingConfronto(CFG, 50000, 10);
    expect([36, 60].map((d) => [rataDi(c50, 'sella', d), rataDi(c50, 'credem', d), rataDi(c50, 'alba', d)])).toEqual([
      [1384.64, 1405.82, 1386.66],
      [862.07, 880.63, 857.72],
    ]);
    const c100 = leasingConfronto(CFG, 100000, 10);
    expect([36, 60].map((d) => [rataDi(c100, 'sella', d), rataDi(c100, 'credem', d), rataDi(c100, 'alba', d)])).toEqual([
      [2769.29, 2811.64, 2773.32],
      [1724.14, 1761.26, 1715.43],
    ]);
  });
});

describe('leasingPartner: la condizione scelta e il ripiego', () => {
  it('senza la condizione resta lo spread medio commerciale del partner', () => {
    const l = leasingPartner(SELLA, 50000, 60, 10, 0)!;
    const attesa = calcolaRataLeasingPartner(SELLA, 50000, 60, 10, 1, getCondizioneFornitori(SELLA, 60).id);
    expect(l.rata).toBe(r2(attesa.rataMensile));
  });

  it('con la condizione usa quella, anche se non e\' la media', () => {
    const media = leasingPartner(SELLA, 50000, 60, 10, 0)!;
    const scelta = leasingPartner(SELLA, 50000, 60, 10, 0, 397300)!;
    const attesa = calcolaRataLeasingPartner(SELLA, 50000, 60, 10, 1, 397300);
    expect(scelta.rata).toBe(r2(attesa.rataMensile));
    // Spread 2,25 contro la media 2,75: la rata scende
    expect(scelta.rata).toBeLessThan(media.rata);
  });

  it('il markup si applica anche sulla condizione scelta', () => {
    const l = leasingPartner(ALBA, 50000, 36, 10, 0.5, 394804)!;
    const attesa = calcolaRataLeasingPartner(ALBA, 50000, 36, 10, 1, 394804);
    expect(l.rata).toBe(r2(attesa.rataMensile * 1.005));
  });
});
