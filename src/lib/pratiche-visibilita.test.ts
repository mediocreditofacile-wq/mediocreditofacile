import { describe, expect, it } from 'vitest';
import { cartellaDocumenti, documentoVisibile, praticaPerElenco, praticaVisibile } from './pratiche-visibilita';
import { PORTALI_PARTNER, ruoloDaChiave } from '../data/portali-partner';

const paolo = { userId: 'referente01', vedeTutto: true };
const agenteA = { userId: 'agenteA0001', vedeTutto: false };
const agenteB = { userId: 'agenteB0001', vedeTutto: false };

const diA = {
  autore: { userId: 'agenteA0001', email: 'a@esempio.it', nome: 'A' },
  documenti: [{ pathname: 'pratiche/stilo/docs/agenteA0001/x/ci.pdf' }],
};
const storica = { documenti: [{ pathname: 'pratiche/stilo/docs/m1/visura.pdf' }] };

describe('praticaVisibile', () => {
  it("l'agente vede le sue e non quelle del collega", () => {
    expect(praticaVisibile(diA, agenteA)).toBe(true);
    expect(praticaVisibile(diA, agenteB)).toBe(false);
  });

  it('referente e MCF vedono tutto, comprese le pratiche senza autore', () => {
    expect(praticaVisibile(diA, paolo)).toBe(true);
    expect(praticaVisibile(storica, paolo)).toBe(true);
  });

  it('le pratiche caricate prima del passaggio non le vede nessun agente', () => {
    expect(praticaVisibile(storica, agenteA)).toBe(false);
    expect(praticaVisibile({ autore: { userId: '' } }, { userId: '', vedeTutto: false })).toBe(false);
  });
});

describe('documentoVisibile', () => {
  const pratiche = [diA, storica];

  it("l'agente scarica i documenti delle sue pratiche", () => {
    expect(documentoVisibile(pratiche, 'pratiche/stilo/docs/agenteA0001/x/ci.pdf', 'stilo', agenteA)).toBe(true);
  });

  it('il collega non li scarica indovinando il percorso', () => {
    expect(documentoVisibile(pratiche, 'pratiche/stilo/docs/agenteA0001/x/ci.pdf', 'stilo', agenteB)).toBe(false);
    expect(documentoVisibile(pratiche, 'pratiche/stilo/docs/m1/visura.pdf', 'stilo', agenteB)).toBe(false);
  });

  it('un file che non sta in nessuna pratica non si scarica, nemmeno dal referente', () => {
    expect(documentoVisibile(pratiche, 'pratiche/stilo/docs/agenteA0001/altro.pdf', 'stilo', paolo)).toBe(false);
  });

  it('fuori dalla cartella del fornitore o con .. si rifiuta', () => {
    expect(documentoVisibile(pratiche, 'pratiche/unidima/docs/agenteA0001/x/ci.pdf', 'stilo', paolo)).toBe(false);
    expect(documentoVisibile(pratiche, 'pratiche/stilo/../unidima/a.pdf', 'stilo', paolo)).toBe(false);
  });
});

describe('cartellaDocumenti', () => {
  it('una cartella per persona dentro quella del fornitore', () => {
    expect(cartellaDocumenti('stilo', 'agenteA0001')).toBe('pratiche/stilo/docs/agenteA0001/');
  });

  it('un id che non sembra un id non diventa un percorso', () => {
    expect(() => cartellaDocumenti('stilo', '../unidima')).toThrow();
    expect(() => cartellaDocumenti('stilo', '')).toThrow();
  });
});

describe('password condivisa sui portali ad accesso nominale', () => {
  const admin = 'chiave-admin-di-prova';

  it('su STILO la vecchia password non apre piu niente', () => {
    expect(ruoloDaChiave('stilosrl', PORTALI_PARTNER.stilo, admin)).toBeNull();
  });

  it('la chiave admin dei link nelle mail resta valida', () => {
    expect(ruoloDaChiave(admin, PORTALI_PARTNER.stilo, admin)).toBe('admin');
  });

  it('gli altri portali a password non cambiano', () => {
    expect(ruoloDaChiave('unidima', PORTALI_PARTNER.unidima, admin)).toBe('partner');
  });
});

describe('praticaPerElenco', () => {
  const record = {
    id: 'ST-20261016-101500',
    cliente: { ragione_sociale: 'Rossi SRL', telefono: '3331234567', email: 'a@b.it', iban: 'IT60X0542811101000000123456' },
    documenti: [],
  };

  it("toglie l'IBAN del cliente: nelle liste del portale non compare a nessuno", () => {
    const r = praticaPerElenco(record);
    expect(r.cliente).not.toHaveProperty('iban');
    expect(r.cliente.ragione_sociale).toBe('Rossi SRL');
    expect(r.id).toBe(record.id);
  });

  it('non tocca il record originale', () => {
    praticaPerElenco(record);
    expect(record.cliente.iban).toBe('IT60X0542811101000000123456');
  });

  it('regge i record vecchi, senza IBAN o senza cliente', () => {
    expect(praticaPerElenco({ id: 'EE-1' })).toEqual({ id: 'EE-1' });
    expect(praticaPerElenco({ id: 'EE-2', cliente: { ragione_sociale: 'X' } })).toEqual({ id: 'EE-2', cliente: { ragione_sociale: 'X' } });
  });
});
