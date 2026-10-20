// Il prefiltro delle carrozzerie con regole_semaforo = 'prefiltro' (Led Office).
// Le undici regole della spec mcf_spec-ledoffice-motore_v1, paragrafo 5: se
// cambiano, deve cadere un test.

import { describe, expect, it } from 'vitest';
import type { Categoria } from './config-distinta';
import {
  datiPrefiltro,
  ETICHETTA_PREFILTRO,
  MOTIVAZIONE_MINIMA,
  TESTI_PREFILTRO,
  valutaPrefiltro,
  type DatiPrefiltro,
  type DistintaPrefiltro,
  type SegnaliPrefiltro,
} from './prefiltro';

const oggi = new Date('2026-10-20');

const sano: DatiPrefiltro = {
  formaCodice: 'SR', attiva: true, cessata: false, inizioAttivita: '2015-03-01',
  bilanciConRicavi: [2025, 2024], patrimonioNetto: 200_000, utile: 30_000,
  capitaleSociale: 50_000, dipendenti: 20, atecoCodice: '62.01.00',
};
const nessuno: SegnaliPrefiltro = { segnalato: null, praticaRecente: null };

// Le categorie della spec, paragrafo 11
const SIGNAGE = ['45', '46', '47', '55', '56', '59', '68', '73', '77', '79', '82', '85', '86', '90', '93'];
const CAT: Categoria[] = [
  { nome: 'Postazioni di lavoro', settoriTipici: [], postazione: true, ledwall: false },
  { nome: 'Workstation grafiche', settoriTipici: ['58', '59', '60', '62', '71', '72', '73', '74', '90'], postazione: true, ledwall: false },
  { nome: 'Periferiche e tablet', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Server e stampa', settoriTipici: [], postazione: false, ledwall: false },
  { nome: 'Digital signage e display', settoriTipici: SIGNAGE, postazione: false, ledwall: false },
  { nome: 'LEDwall', settoriTipici: SIGNAGE, postazione: false, ledwall: true },
];

const distinta = (righe: DistintaPrefiltro['righe']): DistintaPrefiltro =>
  ({ righe, consegna: 'sede', ledwallConfermato: false, motivazioni: {} });
const v = (x: Partial<DatiPrefiltro>) => valutaPrefiltro({ ...sano, ...x }, nessuno, 'assenti', CAT, null, oggi);

describe('le regole del brief', () => {
  it('verde quando tutto torna', () => expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, null, oggi).semaforo).toBe('verde'));
  it('rosso sotto i 24 mesi', () => expect(v({ inizioAttivita: '2025-06-01' }).semaforo).toBe('rosso'));
  it('rosso con un solo bilancio con ricavi', () => expect(v({ bilanciConRicavi: [2025] }).semaforo).toBe('rosso'));
  it('storico bilanci assente: giallo, non rosso', () => {
    const e = v({ bilanciConRicavi: null });
    expect(e.semaforo).toBe('giallo');
    expect(e.criteri.find((c) => c.chiave === 'bilanci')!.valore).toMatch(/non disponibil/);
  });
  it('ditta individuale senza bilanci: giallo con le dichiarazioni', () => {
    const e = v({ formaCodice: 'DI', bilanciConRicavi: null });
    expect(e.semaforo).toBe('giallo');
    expect(e.righe).toContain(TESTI_PREFILTRO.dichiarazioni);
  });
  it('eventi presenti: rosso; in verifica: provvisorio', () => {
    expect(valutaPrefiltro(sano, nessuno, 'presenti', CAT, null, oggi).semaforo).toBe('rosso');
    expect(valutaPrefiltro(sano, nessuno, 'in-verifica', CAT, null, oggi).provvisorio).toBe(true);
  });
  it('eventi non pervenuti: riga da verificare, il colore non cambia', () => {
    const e = valutaPrefiltro(sano, nessuno, 'non-pervenuti', CAT, null, oggi);
    expect(e.semaforo).toBe('verde');
    expect(e.righe).toContain(TESTI_PREFILTRO.eventiDaVerificare);
  });
  it('SRLS: giallo senza motivazione', () => {
    const e = v({ formaCodice: 'RS', capitaleSociale: 1_000 });
    expect(e.semaforo).toBe('giallo');
    expect(e.motivazioniRichieste).toEqual([]);
  });
  it('perdita o patrimonio negativo: giallo con motivazione obbligatoria', () => {
    const e = v({ utile: -5_000 });
    expect(e.semaforo).toBe('giallo');
    expect(e.motivazioniRichieste.map((m) => m.chiave)).toEqual(['perdita']);
    expect(e.bloccaProposta).toBe(true);
  });
  it('SRL con capitale sotto 10.000: giallo; capitale assente: nessun giallo', () => {
    expect(v({ capitaleSociale: 9_999 }).semaforo).toBe('giallo');
    expect(v({ capitaleSociale: null }).semaforo).toBe('verde');
  });
  it('riga fuori dai settori tipici: motivazione per riga', () => {
    const d = distinta([{ categoria: 'Workstation grafiche', quantita: 2 }]);
    const e = valutaPrefiltro({ ...sano, atecoCodice: '14.13.10' }, nessuno, 'assenti', CAT, d, oggi);
    expect(e.motivazioniRichieste.map((m) => m.chiave)).toEqual(['riga-0']);
    expect(valutaPrefiltro({ ...sano, atecoCodice: '14.13.10' }, nessuno, 'assenti', CAT,
      { ...d, motivazioni: { 'riga-0': 'grafica dei cartamodelli' } }, oggi).bloccaProposta).toBe(false);
  });
  it('postazioni oltre gli addetti, o addetti assenti: motivazione', () => {
    const d = distinta([{ categoria: 'Postazioni di lavoro', quantita: 21 }]);
    expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, d, oggi).motivazioniRichieste.map((m) => m.chiave)).toEqual(['addetti']);
    expect(valutaPrefiltro({ ...sano, dipendenti: null }, nessuno, 'assenti', CAT,
      distinta([{ categoria: 'Postazioni di lavoro', quantita: 1 }]), oggi).motivazioniRichieste.map((m) => m.chiave)).toEqual(['addetti']);
  });
  it('consegna ad altro indirizzo: giallo', () => expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, { ...distinta([]), consegna: 'altro' }, oggi).semaforo).toBe('giallo'));
  it('pratica recente: giallo, testo generico, nessun dettaglio', () => {
    const e = valutaPrefiltro(sano, { segnalato: null, praticaRecente: { data: '2026-07-28', canale: 'pagarent', fornitore: 'led-office', fonte: 'esterna' } }, 'assenti', CAT, null, oggi);
    expect(e.semaforo).toBe('giallo');
    expect(JSON.stringify(e)).not.toMatch(/pagarent|2026-07-28|led-office/);
    expect(e.righe).toContain(TESTI_PREFILTRO.praticaRecente);
  });
  it('righe fisse: Centrale Rischi e altri fornitori ci sono sempre', () => {
    const e = valutaPrefiltro(sano, nessuno, 'assenti', CAT, null, oggi);
    expect(e.righe).toEqual(expect.arrayContaining([TESTI_PREFILTRO.centraleRischi, TESTI_PREFILTRO.altriFornitori]));
  });
  it('LEDwall senza spunta: proposta bloccata, colore invariato', () => {
    // ATECO del commercio al dettaglio: il LEDwall e' tipico del settore, cosi' il
    // colore resta quello del cliente. Con l'ATECO 62 di `sano` scatterebbe la
    // regola 6 (bene non tipico), che e' un'altra regola.
    const e = valutaPrefiltro({ ...sano, atecoCodice: '47.11.00' }, nessuno, 'assenti', CAT, distinta([{ categoria: 'LEDwall', quantita: 1 }]), oggi);
    expect(e.ledwallMancante).toBe(true);
    expect(e.semaforo).toBe('verde');
    expect(e.bloccaProposta).toBe(true);
  });
  it('cliente segnalato: blocco vince su tutto, motivo mai esposto', () => {
    const e = valutaPrefiltro(sano, { segnalato: { motivo: 'insoluto', effetto: 'blocco' }, praticaRecente: null }, 'presenti', CAT, null, oggi);
    expect(e.semaforo).toBe('bloccato');
    expect(e.righe).toEqual([TESTI_PREFILTRO.bloccato]);
    expect(JSON.stringify(e)).not.toMatch(/insoluto/);
  });
  it('precedenza: rosso batte giallo, i gialli si sommano', () => {
    expect(v({ inizioAttivita: '2025-06-01', utile: -1 }).semaforo).toBe('rosso');
    expect(v({ formaCodice: 'RS', utile: -1 }).criteri.filter((c) => c.ok === false)).toHaveLength(2);
  });
});

describe('etichette e stato del cliente', () => {
  it('quattro etichette, mai "approvato"', () => {
    expect(ETICHETTA_PREFILTRO).toEqual({
      verde: 'In linea con il prefiltro',
      giallo: 'Da completare',
      rosso: 'Non presentabile dal portale',
      bloccato: 'Non lavorabile dal portale',
    });
    expect(v({}).etichetta).toBe('In linea con il prefiltro');
    expect(JSON.stringify(ETICHETTA_PREFILTRO)).not.toMatch(/approvat/i);
  });
  it('cessata o non attiva: rosso', () => {
    expect(v({ cessata: true }).semaforo).toBe('rosso');
    expect(v({ attiva: false }).semaforo).toBe('rosso');
    expect(v({ cessata: true }).etichetta).toBe('Non presentabile dal portale');
  });
  it('anagrafica che manca: giallo, mai rosso', () => {
    for (const x of [{ formaCodice: null }, { attiva: null }, { inizioAttivita: null }]) {
      const e = v(x);
      expect(e.semaforo).toBe('giallo');
      expect(e.criteri.some((c) => c.ok === null && /non disponibil/.test(c.valore))).toBe(true);
    }
  });
  it('24 mesi esatti bastano, 23 no', () => {
    expect(v({ inizioAttivita: '2024-10-20' }).semaforo).toBe('verde');
    expect(v({ inizioAttivita: '2024-10-21' }).semaforo).toBe('rosso');
  });
});

describe('bilanci e dichiarazioni', () => {
  it('storico presente ma vuoto: e\' un dato, rosso', () => {
    const e = v({ bilanciConRicavi: [] });
    expect(e.semaforo).toBe('rosso');
    expect(e.criteri.find((c) => c.chiave === 'bilanci')!.ok).toBe(false);
  });
  it('società di persone: giallo con le dichiarazioni anche senza storico', () => {
    const e = v({ formaCodice: 'SN', bilanciConRicavi: [] });
    expect(e.semaforo).toBe('giallo');
    expect(e.righe).toContain(TESTI_PREFILTRO.dichiarazioni);
  });
  it('la ditta individuale sotto i 24 mesi resta rossa', () => {
    expect(v({ formaCodice: 'DI', bilanciConRicavi: null, inizioAttivita: '2025-06-01' }).semaforo).toBe('rosso');
  });
  it('società di capitali: niente riga sulle dichiarazioni', () => {
    expect(v({}).righe).not.toContain(TESTI_PREFILTRO.dichiarazioni);
  });
});

describe('patrimonio, perdita e capitale', () => {
  it('patrimonio negativo: motivazione "perdita"', () => {
    const e = v({ patrimonioNetto: -1 });
    expect(e.semaforo).toBe('giallo');
    expect(e.motivazioniRichieste.map((m) => m.chiave)).toEqual(['perdita']);
  });
  it('patrimonio e utile a zero non sono negativi', () => {
    expect(v({ patrimonioNetto: 0, utile: 0 }).semaforo).toBe('verde');
  });
  it('patrimonio e utile assenti: non disponibili, nessun giallo', () => {
    const e = v({ patrimonioNetto: null, utile: null });
    expect(e.semaforo).toBe('verde');
    expect(e.criteri.find((c) => c.chiave === 'patrimonio')!.ok).toBeNull();
  });
  it('capitale sotto 10.000 solo sulla SRL ordinaria: a socio unico sì, SPA no', () => {
    expect(v({ formaCodice: 'SU', capitaleSociale: 5_000 }).semaforo).toBe('giallo');
    expect(v({ formaCodice: 'SP', capitaleSociale: 5_000 }).semaforo).toBe('verde');
    expect(v({ capitaleSociale: 10_000 }).semaforo).toBe('verde');
  });
  it('la motivazione conta da dieci caratteri dopo il trim', () => {
    const conMotivo = (m: string) => valutaPrefiltro({ ...sano, utile: -1 }, nessuno, 'assenti', CAT,
      { ...distinta([]), motivazioni: { perdita: m } }, oggi);
    expect(MOTIVAZIONE_MINIMA).toBe(10);
    expect(conMotivo('   corta    ').motivazioniMancanti).toEqual(['perdita']);
    expect(conMotivo('  123456789  ').bloccaProposta).toBe(true);
    expect(conMotivo('1234567890').motivazioniMancanti).toEqual([]);
    expect(conMotivo('1234567890').bloccaProposta).toBe(false);
    expect(conMotivo('1234567890').semaforo).toBe('giallo');
  });
});

describe('la distinta', () => {
  it('ATECO assente su una categoria non universale: da verificare e motivazione', () => {
    const e = valutaPrefiltro({ ...sano, atecoCodice: null }, nessuno, 'assenti', CAT,
      distinta([{ categoria: 'Postazioni di lavoro', quantita: 1 }, { categoria: 'Digital signage e display', quantita: 1 }]), oggi);
    expect(e.semaforo).toBe('giallo');
    expect(e.motivazioniRichieste.map((m) => m.chiave)).toEqual(['riga-1']);
    expect(e.criteri.find((c) => c.chiave === 'riga-1')!.ok).toBeNull();
  });
  it('ATECO assente e sole categorie universali: nessun giallo', () => {
    const e = valutaPrefiltro({ ...sano, atecoCodice: null }, nessuno, 'assenti', CAT,
      distinta([{ categoria: 'Periferiche e tablet', quantita: 3 }]), oggi);
    expect(e.semaforo).toBe('verde');
  });
  it('prefisso a due cifre: 47.11 e 59.11 sono tipici del signage, 62 no', () => {
    const riga = distinta([{ categoria: 'Digital signage e display', quantita: 1 }]);
    expect(valutaPrefiltro({ ...sano, atecoCodice: '47.11.00' }, nessuno, 'assenti', CAT, riga, oggi).semaforo).toBe('verde');
    expect(valutaPrefiltro({ ...sano, atecoCodice: '59.11' }, nessuno, 'assenti', CAT, riga, oggi).semaforo).toBe('verde');
    expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, riga, oggi).semaforo).toBe('giallo');
  });
  it('le postazioni si sommano fra le categorie con il flag', () => {
    const d = distinta([
      { categoria: 'Postazioni di lavoro', quantita: 15 },
      { categoria: 'Workstation grafiche', quantita: 5 },
      { categoria: 'Periferiche e tablet', quantita: 30 },
    ]);
    expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, d, oggi).semaforo).toBe('verde');
    const una = { ...d, righe: [...d.righe, { categoria: 'Postazioni di lavoro', quantita: 1 }] };
    expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, una, oggi).motivazioniRichieste.map((m) => m.chiave)).toEqual(['addetti']);
  });
  it('zero addetti dichiarati: e\' un dato, una postazione chiede la motivazione', () => {
    const e = valutaPrefiltro({ ...sano, dipendenti: 0 }, nessuno, 'assenti', CAT,
      distinta([{ categoria: 'Postazioni di lavoro', quantita: 1 }]), oggi);
    expect(e.motivazioniRichieste.map((m) => m.chiave)).toEqual(['addetti']);
    expect(e.criteri.find((c) => c.chiave === 'addetti')!.ok).toBe(false);
  });
  it('senza postazioni la regola degli addetti non si applica', () => {
    const e = valutaPrefiltro({ ...sano, dipendenti: null }, nessuno, 'assenti', CAT,
      distinta([{ categoria: 'Server e stampa', quantita: 2 }]), oggi);
    expect(e.semaforo).toBe('verde');
    expect(e.criteri.find((c) => c.chiave === 'addetti')).toBeUndefined();
  });
  it('consegna in sede o in unità locale: nessun giallo', () => {
    expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, distinta([]), oggi).semaforo).toBe('verde');
    expect(valutaPrefiltro(sano, nessuno, 'assenti', CAT, { ...distinta([]), consegna: 'unita' }, oggi).semaforo).toBe('verde');
  });
  it('LEDwall con la spunta: la proposta esce', () => {
    const d = { ...distinta([{ categoria: 'LEDwall', quantita: 1 }]), ledwallConfermato: true };
    const e = valutaPrefiltro({ ...sano, atecoCodice: '47.11.00' }, nessuno, 'assenti', CAT, d, oggi);
    expect(e.ledwallMancante).toBe(false);
    expect(e.bloccaProposta).toBe(false);
  });
  it('motivazioni di più regole insieme, nell\'ordine perdita, addetti, righe', () => {
    const d = distinta([
      { categoria: 'Workstation grafiche', quantita: 30 },
      { categoria: 'Digital signage e display', quantita: 1 },
    ]);
    const e = valutaPrefiltro({ ...sano, utile: -1, atecoCodice: '14.13.10' }, nessuno, 'assenti', CAT, d, oggi);
    expect(e.motivazioniRichieste.map((m) => m.chiave)).toEqual(['perdita', 'addetti', 'riga-0', 'riga-1']);
    expect(e.motivazioniMancanti).toEqual(['perdita', 'addetti', 'riga-0', 'riga-1']);
    expect(e.motivazioniRichieste.every((m) => m.testo.length > 0)).toBe(true);
  });
});

describe('segnali, eventi e riservatezza', () => {
  it('cliente segnalato con effetto rosso: rosso, motivo mai esposto', () => {
    const e = valutaPrefiltro(sano, { segnalato: { motivo: 'sofferenze in Centrale Rischi', effetto: 'rosso' }, praticaRecente: null }, 'assenti', CAT, null, oggi);
    expect(e.semaforo).toBe('rosso');
    expect(e.bloccaProposta).toBe(true);
    expect(JSON.stringify(e)).not.toMatch(/sofferenze/i);
  });
  it('bloccato: nessun criterio, nessuna motivazione, nessuna riga fissa', () => {
    const e = valutaPrefiltro({ ...sano, utile: -1 }, { segnalato: { motivo: 'insoluto', effetto: 'blocco' }, praticaRecente: null }, 'assenti', CAT,
      distinta([{ categoria: 'LEDwall', quantita: 1 }]), oggi);
    expect(e.criteri).toEqual([]);
    expect(e.motivazioniRichieste).toEqual([]);
    expect(e.motivazioniMancanti).toEqual([]);
    expect(e.etichetta).toBe('Non lavorabile dal portale');
    expect(e.bloccaProposta).toBe(true);
    expect(e.provvisorio).toBe(false);
  });
  it('le righe fisse stanno in coda', () => {
    const e = valutaPrefiltro(sano, { segnalato: null, praticaRecente: { data: '2026-07-28', canale: null, fornitore: null, fonte: 'motore' } }, 'non-pervenuti', CAT, null, oggi);
    expect(e.righe.slice(-2)).toEqual([TESTI_PREFILTRO.centraleRischi, TESTI_PREFILTRO.altriFornitori]);
    expect(e.righe).toContain(TESTI_PREFILTRO.praticaRecente);
    expect(e.righe).toContain(TESTI_PREFILTRO.eventiDaVerificare);
  });
  it('eventi non verificati (tetto finito): riga da verificare, colore invariato', () => {
    const e = valutaPrefiltro(sano, nessuno, 'non-avviata', CAT, null, oggi);
    expect(e.semaforo).toBe('verde');
    expect(e.righe).toContain(TESTI_PREFILTRO.eventiDaVerificare);
  });
  it('in verifica sul rosso: non provvisorio', () => {
    expect(v({ cessata: true }).provvisorio).toBe(false);
    expect(valutaPrefiltro({ ...sano, cessata: true }, nessuno, 'in-verifica', CAT, null, oggi).provvisorio).toBe(false);
  });
  it('mai un locatore, mai "approvato"', () => {
    const esiti = [
      v({}), v({ formaCodice: 'RS' }), v({ cessata: true }), v({ formaCodice: 'DI', bilanciConRicavi: null }),
      valutaPrefiltro(sano, nessuno, 'in-verifica', CAT, distinta([{ categoria: 'LEDwall', quantita: 1 }]), oggi),
    ];
    for (const e of esiti) expect(JSON.stringify(e)).not.toMatch(/approvat|grenke|pagarent|econocom|rete rent/i);
  });
});

describe('datiPrefiltro', () => {
  it('i campi assenti diventano null, mai zero', () => {
    const d = datiPrefiltro({ fatturato: 900_000, patrimonioNetto: 50_000, utile: 4_000, inizioAttivita: '2012-01-01' });
    expect(d).toEqual({
      formaCodice: null, attiva: null, cessata: false, inizioAttivita: '2012-01-01',
      bilanciConRicavi: null, patrimonioNetto: 50_000, utile: 4_000,
      capitaleSociale: null, dipendenti: null, atecoCodice: null,
    });
  });
  it('lo zero dichiarato resta zero, lo storico vuoto resta vuoto', () => {
    const d = datiPrefiltro({ fatturato: 10, dipendenti: 0, bilanciConRicavi: [], capitaleSociale: 0 });
    expect(d.dipendenti).toBe(0);
    expect(d.bilanciConRicavi).toEqual([]);
    expect(d.capitaleSociale).toBe(0);
  });
  it('porta i campi nuovi della scheda', () => {
    const d = datiPrefiltro({
      formaCodice: 'RS', attiva: true, cessata: false, capitaleSociale: 1_000, dipendenti: 3,
      bilanciConRicavi: [2025, 2024], atecoCodice: '62.01.00', fatturato: 1, patrimonioNetto: 1, utile: 1,
    });
    expect(d).toMatchObject({ formaCodice: 'RS', attiva: true, capitaleSociale: 1_000, dipendenti: 3, bilanciConRicavi: [2025, 2024], atecoCodice: '62.01.00' });
  });
  it('ricavi, patrimonio e utile tutti a zero: bilancio non depositato, non disponibili', () => {
    const d = datiPrefiltro({ fatturato: 0, patrimonioNetto: 0, utile: 0 });
    expect(d.patrimonioNetto).toBeNull();
    expect(d.utile).toBeNull();
  });
});
