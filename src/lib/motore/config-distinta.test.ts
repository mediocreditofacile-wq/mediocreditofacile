// Configurazione di una carrozzeria sul settore "distinta": canali, societa'
// fornitrice, checklist e categorie. Sono letture di JSON scritto dal Pannello
// MCF, quindi si provano soprattutto i casi storti: un valore che non si legge
// si scarta, non si indovina.

import { describe, expect, it } from 'vitest';
import {
  leggiCanali,
  leggiCategorie,
  leggiChecklist,
  leggiSocieta,
  vociChecklist,
  type ChecklistConfig,
} from './config-distinta';

describe('leggiCanali', () => {
  it('tiene l\'ordine e scarta i canali sconosciuti', () => {
    const c = leggiCanali([
      { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0, fatturatoMin: 5_000_000, importoMin: 150_000 },
      { canale: 'ifis', attivo: true, tabella: 'x', maggiorazionePerc: 0 },
      { canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 },
    ])!;
    expect(c.map((x) => x.canale)).toEqual(['econocom', 'pagarent']);
    expect(c[1].maggiorazionePerc).toBe(5);
  });

  it('null e non-array danno null, maggiorazione fuori 0-50 scartata', () => {
    expect(leggiCanali(null)).toBeNull();
    expect(leggiCanali({})).toBeNull();
    expect(leggiCanali([{ canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 80 }])).toEqual([]);
  });

  it('legge tutte le condizioni di Grenke', () => {
    const [g] = leggiCanali([{
      canale: 'grenke', attivo: false, tabella: 'pioneer', maggiorazionePerc: 0,
      soloCapitali: true, formeEscluse: ['RS'], anniMin: 2, settoriEsclusi: ['56.1', '41'], sogliaProvvisorio: 50_000,
    }])!;
    expect(g).toEqual({
      canale: 'grenke', attivo: false, tabella: 'pioneer', maggiorazionePerc: 0,
      soloCapitali: true, formeEscluse: ['RS'], anniMin: 2, settoriEsclusi: ['561', '41'], sogliaProvvisorio: 50_000,
    });
  });

  it('legge le condizioni sul bene: venditori, categorie escluse, mezzi targati', () => {
    const canale = {
      canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0,
      venditori: ['manc'], categorieEscluse: ['Ponteggi'], escludiTargati: true,
    };
    expect(leggiCanali([canale])).toEqual([canale]);
    // escludiTargati: false e' una condizione letta, non un'assenza
    expect(leggiCanali([{ ...canale, escludiTargati: false }])![0].escludiTargati).toBe(false);
  });

  it('le condizioni sul bene scritte male fanno scartare il canale', () => {
    const base = { canale: 'grenke', attivo: true, tabella: 'sputnik', maggiorazionePerc: 0 };
    expect(leggiCanali([{ ...base, venditori: 'manc' }])).toEqual([]);
    expect(leggiCanali([{ ...base, venditori: ['manc', 7] }])).toEqual([]);
    expect(leggiCanali([{ ...base, categorieEscluse: 'Ponteggi' }])).toEqual([]);
    expect(leggiCanali([{ ...base, escludiTargati: 'si' }])).toEqual([]);
    // L'usato si legge come il targato: booleano o niente
    expect(leggiCanali([{ ...base, escludiUsati: true }])![0].escludiUsati).toBe(true);
    expect(leggiCanali([{ ...base, escludiUsati: false }])![0].escludiUsati).toBe(false);
    expect(leggiCanali([{ ...base, escludiUsati: 'si' }])).toEqual([]);
  });

  it('una condizione scritta male fa scartare il canale: non lo si allarga di nascosto', () => {
    const base = { canale: 'econocom', attivo: true, tabella: 'econocom-pa', maggiorazionePerc: 0 };
    expect(leggiCanali([{ ...base, fatturatoMin: 'tanto' }])).toEqual([]);
    expect(leggiCanali([{ ...base, importoMin: -1 }])).toEqual([]);
    expect(leggiCanali([{ ...base, soloCapitali: 'si' }])).toEqual([]);
    expect(leggiCanali([{ ...base, formeEscluse: 'RS' }])).toEqual([]);
    expect(leggiCanali([{ ...base, settoriEsclusi: ['56', 'ristorazione'] }])).toEqual([]);
  });

  it('una condizione assente o null non e\' una condizione', () => {
    const [c] = leggiCanali([{ canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5, fatturatoMin: null }])!;
    expect(c).toEqual({ canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: 5 });
  });

  it('scarta il canale senza tabella o con "attivo" che non e\' un booleano', () => {
    expect(leggiCanali([{ canale: 'pagarent', attivo: true, tabella: '', maggiorazionePerc: 5 }])).toEqual([]);
    expect(leggiCanali([{ canale: 'pagarent', attivo: 'true', tabella: 'pagarent', maggiorazionePerc: 5 }])).toEqual([]);
    expect(leggiCanali([{ canale: 'pagarent', attivo: true, tabella: 'pagarent' }])).toEqual([]);
  });

  it('i confini della maggiorazione: 0 e 50 passano, 50,5 e NaN no', () => {
    const una = (m: number) => leggiCanali([{ canale: 'pagarent', attivo: true, tabella: 'pagarent', maggiorazionePerc: m }])!.length;
    expect([una(0), una(50), una(50.5), una(-1), una(Number.NaN)]).toEqual([1, 1, 0, 0, 0]);
  });
});

describe('leggiSocieta', () => {
  const OK = {
    ragioneSociale: 'EMME 2 SERVIZI S.R.L.', piva: '01234567890', rea: 'RM-123456',
    indirizzo: 'Via Roma 1, 00100 Roma (RM)', telefono: '+39 06 1234567', email: 'info@esempio.it',
    pec: 'esempio@pec.it', logo: 'brand/logo.png',
  };
  it('legge la societa\' completa', () => {
    expect(leggiSocieta(OK)).toEqual(OK);
  });
  it('il logo puo\' mancare', () => {
    expect(leggiSocieta({ ...OK, logo: null })!.logo).toBeNull();
    const { logo: _l, ...senzaLogo } = OK;
    expect(leggiSocieta(senzaLogo)!.logo).toBeNull();
  });
  it('senza ragione sociale o partita IVA, o con un campo non testuale, da null', () => {
    expect(leggiSocieta(null)).toBeNull();
    expect(leggiSocieta([])).toBeNull();
    expect(leggiSocieta({ ...OK, ragioneSociale: '' })).toBeNull();
    expect(leggiSocieta({ ...OK, piva: '  ' })).toBeNull();
    expect(leggiSocieta({ ...OK, rea: 12345 })).toBeNull();
    expect(leggiSocieta({ ...OK, pec: undefined })).toBeNull();
  });
});

describe('leggiChecklist e vociChecklist', () => {
  const ck = { formati: ['pdf', 'jpg'], voci: [
    { nome: 'A', obbligatoria: true },
    { nome: 'Bilanci', obbligatoria: false, forme: ['capitali'] },
    { nome: 'Dichiarazioni', obbligatoria: false, forme: ['persone', 'individuale'] },
    { nome: 'Provvisorio', obbligatoria: false, sopraImporto: 50_000 },
  ] } as ChecklistConfig;

  it('filtra per forma e importo', () => {
    expect(vociChecklist(ck, 'capitali', 50_000).map((v) => v.nome)).toEqual(['A', 'Bilanci']);
    expect(vociChecklist(ck, 'individuale', 50_001).map((v) => v.nome)).toEqual(['A', 'Dichiarazioni', 'Provvisorio']);
    expect(vociChecklist(ck, 'non-classificata', 0).map((v) => v.nome)).toEqual(['A', 'Bilanci', 'Dichiarazioni']);
  });

  it('un importo che non si legge non fa perdere la voce', () => {
    expect(vociChecklist(ck, 'capitali', Number.NaN).map((v) => v.nome)).toEqual(['A', 'Bilanci', 'Provvisorio']);
  });

  it('legge la checklist e tiene l\'ordine delle voci', () => {
    const c = leggiChecklist(ck)!;
    expect(c.voci.map((v) => v.nome)).toEqual(['A', 'Bilanci', 'Dichiarazioni', 'Provvisorio']);
    expect(c.voci[2].forme).toEqual(['persone', 'individuale']);
    expect(c.voci[3].sopraImporto).toBe(50_000);
    expect(c.formati).toEqual(['pdf', 'jpg']);
  });

  it('scarta la voce che non si legge, e le altre restano', () => {
    const c = leggiChecklist({ formati: ['pdf'], voci: [
      { nome: 'A', obbligatoria: true },
      { nome: '', obbligatoria: true },
      { nome: 'B', obbligatoria: 'si' },
      { nome: 'C', obbligatoria: false, forme: ['societa'] },
      { nome: 'D', obbligatoria: false, sopraImporto: 'molto' },
    ] })!;
    expect(c.voci.map((v) => v.nome)).toEqual(['A']);
  });

  it('formato sconosciuto scartato, doppioni tolti', () => {
    const c = leggiChecklist({ formati: ['pdf', 'png', 'pdf'], voci: [{ nome: 'A', obbligatoria: true }] })!;
    expect(c.formati).toEqual(['pdf']);
  });

  it('senza voci leggibili o senza formati ammessi da null: si torna alla checklist di sempre', () => {
    expect(leggiChecklist(null)).toBeNull();
    expect(leggiChecklist({ formati: ['pdf'], voci: 'A' })).toBeNull();
    expect(leggiChecklist({ formati: ['pdf'], voci: [] })).toBeNull();
    expect(leggiChecklist({ formati: ['pdf'], voci: [{ nome: '', obbligatoria: true }] })).toBeNull();
    expect(leggiChecklist({ formati: ['png'], voci: [{ nome: 'A', obbligatoria: true }] })).toBeNull();
    expect(leggiChecklist({ voci: [{ nome: 'A', obbligatoria: true }] })).toBeNull();
  });
});

describe('leggiCategorie', () => {
  it('normalizza i prefissi ATECO a sole cifre', () => {
    expect(leggiCategorie([{ nome: 'X', settoriTipici: ['58', '62.0'], postazione: true, ledwall: false }])![0].settoriTipici)
      .toEqual(['58', '620']);
  });

  it('settori tipici vuoti restano vuoti: vuol dire tipico per ogni settore', () => {
    expect(leggiCategorie([{ nome: 'X', settoriTipici: [], postazione: false, ledwall: true }])![0])
      .toEqual({ nome: 'X', settoriTipici: [], postazione: false, ledwall: true });
  });

  it('un prefisso senza cifre fa scartare la categoria: la lista non si svuota di nascosto', () => {
    // Se 'abc' sparisse da solo, la categoria resterebbe senza settori e varrebbe come tipica per tutti
    expect(leggiCategorie([{ nome: 'X', settoriTipici: ['abc'], postazione: false, ledwall: false }])).toEqual([]);
    expect(leggiCategorie([{ nome: 'X', settoriTipici: ['47.', 58], postazione: false, ledwall: false }])).toEqual([]);
    expect(leggiCategorie([{ nome: 'X', settoriTipici: ['47.', '58'], postazione: false, ledwall: false }])![0].settoriTipici)
      .toEqual(['47', '58']);
  });

  it('non-array da null, categoria che non si legge scartata', () => {
    expect(leggiCategorie(undefined)).toBeNull();
    expect(leggiCategorie('boh')).toBeNull();
    const c = leggiCategorie([
      { nome: 'Buona', settoriTipici: [], postazione: false, ledwall: false },
      { nome: '', settoriTipici: [], postazione: false, ledwall: false },
      { nome: 'Senza flag', settoriTipici: [], postazione: true },
      { nome: 'Settori storti', settoriTipici: 'tutti', postazione: false, ledwall: false },
    ])!;
    expect(c.map((x) => x.nome)).toEqual(['Buona']);
  });
});
