import { describe, it, expect } from 'vitest';
import {
  leggiEventiNegativi, sintesiEventi, leggiMotivo, frase, nomeProprio, dataBreve, conEventi, righeEventi,
  leggiVisuraProtesti, confrontoVerificaVisura,
} from './eventi-negativi';

// Dati sintetici con la forma della risposta reale di IT-negativita/dettaglio
// (letta il 14/10/2026 su una SRL con un assegno protestato): nessun dato vero nel repo.
const MOTIVO = 'DIFETTO DI PROVVISTA  ART. 2, L. 386/90  - Mancanza totale o parziale di fondi nel momento in cui il titolo viene presentato per il pagamento.';

const effetto = (x: Record<string, unknown> = {}) => ({
  cciaa: 'RM', data_iscrizione: '2026-09-17', data_levata: '2026-08-10', provincia_levata: 'RM', comune_levata: 'ROMA',
  data_scadenza: null, tipo_effetto: 'ASSEGNO', codice_tipo_effetto: 'A', importo: 10000,
  motivo_rifiuto_pagamento: MOTIVO, codice_motivo_rifiuto_pagamento: 'A20', stato_effetto: 'NORMALE',
  informazione_legata_effetto: null, informazione: null, ...x,
});

const dettaglio = (effetti: unknown[]) => ({
  presenzaPregiudizievoli: false, pregiudizievoli: null, presenzaProcedure: false, procedure: null, presenzaProtesti: true,
  protesti: [{
    identificativo_protesto: 1, denominazione: 'ALFA SRL', codice_fiscale: '01234567890',
    indirizzo_residenza: { denominazione: 'VIA DEI MILLE 6', cap: null, comune: 'CIVITAVECCHIA', provincia: 'RM' },
    effetti,
  }],
});

// Come lo conserva il registro: le tre presenze e la risposta intera sotto `dettaglio`
const registro = (d: any) => ({ presenzaProtesti: d.presenzaProtesti, presenzaPregiudizievoli: d.presenzaPregiudizievoli, presenzaProcedure: d.presenzaProcedure, dettaglio: d });

describe('leggiEventiNegativi', () => {
  it('legge il protesto dalla forma del registro', () => {
    const e = leggiEventiNegativi(registro(dettaglio([effetto()])))!;
    expect(e.protesti).toHaveLength(1);
    expect(e.protesti[0]).toMatchObject({ denominazione: 'ALFA SRL', cf: '01234567890', indirizzo: 'Via Dei Mille 6 Civitavecchia (RM)' });
    expect(e.protesti[0].effetti[0]).toEqual({
      tipo: 'Assegno', importo: 10000, dataLevata: '10/08/2026', luogoLevata: 'Roma (RM)', dataIscrizione: '17/09/2026',
      cciaa: 'RM', dataScadenza: '', motivo: 'Difetto di provvista (art. 2, L. 386/90)',
      motivoEsteso: 'Mancanza totale o parziale di fondi nel momento in cui il titolo viene presentato per il pagamento.',
      stato: 'Normale', informazione: '', repertorio: '',
    });
    expect(e.effetti).toBe(1);
    expect(e.totaleProtestato).toBe(10000);
    expect(e.dettaglioDisponibile).toBe(true);
  });

  it('accetta anche la risposta grezza del dettaglio', () => {
    const e = leggiEventiNegativi(dettaglio([effetto()]))!;
    expect(e.presenzaProtesti).toBe(true);
    expect(e.effetti).toBe(1);
  });

  it('somma gli importi su piu\' effetti', () => {
    const e = leggiEventiNegativi(registro(dettaglio([effetto(), effetto({ importo: 2500.5, tipo_effetto: 'CAMBIALE' })])))!;
    expect(e.effetti).toBe(2);
    expect(e.totaleProtestato).toBe(12500.5);
    expect(sintesiEventi(e)).toBe('protesti: 2 effetti per 12.500,5 €');
  });

  it('verifica pulita: nessun evento', () => {
    const e = leggiEventiNegativi({ presenzaProtesti: false, presenzaPregiudizievoli: false, presenzaProcedure: false })!;
    expect(conEventi(e)).toBe(false);
    expect(e.dettaglioDisponibile).toBe(true);
    expect(sintesiEventi(e)).toBe('nessun evento');
  });

  it('presenza vera senza dettaglio conservato: lo dice invece di mostrare una lista vuota', () => {
    const e = leggiEventiNegativi({ presenzaProtesti: true, presenzaPregiudizievoli: false, presenzaProcedure: false })!;
    expect(e.dettaglioDisponibile).toBe(false);
    expect(sintesiEventi(e)).toBe('protesti');
  });

  it('pregiudizievoli di forma ignota: campo per campo, senza inventare', () => {
    const e = leggiEventiNegativi(registro({
      presenzaProtesti: false, protesti: null, presenzaProcedure: false, procedure: null,
      presenzaPregiudizievoli: true,
      pregiudizievoli: { tipo_atto: 'IPOTECA GIUDIZIALE', data_atto: '2025-03-01', importo: 5000, ufficio: { comune: 'VICENZA' }, vuoto: null },
    }))!;
    expect(e.pregiudizievoli).toHaveLength(1);
    expect(e.pregiudizievoli[0].campi).toEqual([
      ['Tipo atto', 'IPOTECA GIUDIZIALE'], ['Data atto', '01/03/2025'], ['Importo', '5000'], ['Ufficio · comune', 'VICENZA'],
    ]);
    expect(sintesiEventi(e)).toBe('pregiudizievoli');
  });

  it('niente dati: null', () => {
    expect(leggiEventiNegativi(null)).toBeNull();
    expect(sintesiEventi(null)).toBe('nessuna risposta');
  });
});

describe('sintesiEventi', () => {
  it('un solo effetto: tipo e importo', () => {
    expect(sintesiEventi(leggiEventiNegativi(registro(dettaglio([effetto()]))))).toBe('protesto: assegno da 10.000 €');
  });
});

describe('formattazione', () => {
  it('motivo con riferimento normativo tra parentesi', () => {
    expect(leggiMotivo(MOTIVO).motivo).toBe('Difetto di provvista (art. 2, L. 386/90)');
    expect(leggiMotivo('MANCANZA DI FIRMA').motivo).toBe('Mancanza di firma');
    expect(leggiMotivo(null)).toEqual({ motivo: '', esteso: '' });
  });
  it('frase e nomi propri', () => {
    expect(frase('TRATTA ACCETTATA')).toBe('Tratta accettata');
    expect(nomeProprio("SANT'ANGELO IN VADO")).toBe("Sant'Angelo In Vado");
  });
  it('date AAAA-MM-GG e AAAAMMGG in gg/mm/aaaa', () => {
    expect(dataBreve('2026-08-10')).toBe('10/08/2026');
    expect(dataBreve('20260810')).toBe('10/08/2026');
    expect(dataBreve('12345678')).toBe('12345678');
    expect(dataBreve('2026-08-10T00:00:00')).toBe('10/08/2026');
    expect(dataBreve(null)).toBe('');
  });
});

describe('righeEventi', () => {
  it('una riga per effetto, leggibile su carta', () => {
    expect(righeEventi(leggiEventiNegativi(registro(dettaglio([effetto()]))))).toEqual([[
      'Assegno · 10.000 €',
      'levato il 10/08/2026 a Roma (RM) · iscritto il 17/09/2026 (CCIAA RM) · Difetto di provvista (art. 2, L. 386/90) · stato normale',
    ]]);
  });
  it('presenza senza dettaglio: lo dice', () => {
    expect(righeEventi(leggiEventiNegativi({ presenzaProtesti: true }))).toEqual([['Protesti', 'presenti, dettaglio non disponibile']]);
  });
  it('verifica pulita: nessuna riga', () => {
    expect(righeEventi(leggiEventiNegativi({ presenzaProtesti: false }))).toEqual([]);
  });
});

// Forma del JSON della visura protesti DocuEngine (prima visura, 14/10/2026), dati inventati
const effVisura = (levata: string, iscrizione: string, importo: string, rep: string) => ({
  DatiRegistroProtesti: {
    CciaaPubblicazione: { sigla: 'RM', valore: 'ROMA' },
    DataIscrizioneRegistro: { anno: iscrizione.slice(0, 4), giorno: '1', mese: '1', valore: iscrizione },
  },
  InformazioniEffetto: {
    DataLevata: { valore: levata },
    ProvinciaLevata: { sigla: 'RM', valore: 'ROMA' },
    ComuneLevata: { codice: 'RM091', valore: 'ROMA' },
    TipoEffetto: { codice: 'A', valore: 'ASSEGNO' },
    Importo: { ValutaLevata: { codice: 'EU', valuta: 'EURO', valore: importo } },
    MancatoPagamentoRepr: { codice: 'A20', valore: MOTIVO },
    StatoEffetto: { codice: 'N', valore: 'NORMALE' },
    NumeroRepertorio: rep,
  },
  ElencoInfoAggiuntiveEffetto: { InfoAggiuntiveEffetto: { Progressivo: '1', Tipo: { codice: 'TX', valore: 'TESTUALE' }, TestoInfoEffetto: { RigaTesto: 'FIRMA: ROSSI MARIO' } } },
  idEffetto: '1',
});

const visura = (effetti: unknown) => ({
  Dati: { EventiNegativiImpresa: {
    InfoImpresa: { Denominazione: 'ALFA SRL' },
    Sintesi: { Globale: { semaforo: 'R' }, Protesti: { dataUltimoProtesto: '20260916', semaforo: 'R', totEffetti: '3', totImportoProtesti: '27979.15', totProtesti: '1' } },
    ElencoProtesti: { Protesto: {
      Anagrafica: { Nominativo: 'ALFA SRL', CodiceFiscale: '01234567890', Residenza: { Provincia: { sigla: 'RM' }, Comune: { valore: 'CIVITAVECCHIA' }, Indirizzo: 'VIA DEI MILLE 6' } },
      ElencoEffettiRP: { EffettoProtestoRP: effetti },
    } },
    ElencoOmonimieProtesti: { flagPresenza: 'N' },
  } },
});

const TRE = [
  effVisura('20260810', '20260917', '10000.00', '61173'),
  effVisura('20260908', '20261013', '8979.15', '61182'),
  effVisura('20260916', '20261013', '9000.00', '61186'),
];

describe('leggiVisuraProtesti', () => {
  it('legge sintesi ed effetti della visura', () => {
    const v = leggiVisuraProtesti(visura(TRE))!;
    expect(v.sintesi).toEqual({ protesti: 1, effetti: 3, importo: 27979.15, ultimoProtesto: '16/09/2026', semaforo: 'R', omonimie: false });
    expect(v.effetti).toBe(3);
    expect(v.totaleProtestato).toBeCloseTo(27979.15, 2);
    expect(v.dettaglioDisponibile).toBe(true);
    expect(v.protesti[0]).toMatchObject({ denominazione: 'ALFA SRL', cf: '01234567890', indirizzo: 'Via Dei Mille 6 Civitavecchia (RM)' });
    expect(v.protesti[0].effetti[1]).toEqual({
      tipo: 'Assegno', importo: 8979.15, dataLevata: '08/09/2026', luogoLevata: 'Roma (RM)', dataIscrizione: '13/10/2026',
      cciaa: 'RM', dataScadenza: '', motivo: 'Difetto di provvista (art. 2, L. 386/90)',
      motivoEsteso: 'Mancanza totale o parziale di fondi nel momento in cui il titolo viene presentato per il pagamento.',
      stato: 'Normale', informazione: 'FIRMA: ROSSI MARIO', repertorio: '61182',
    });
    expect(sintesiEventi(v)).toBe('protesti: 3 effetti per 27.979,15 €');
  });

  it('un solo effetto arriva come oggetto e va letto come elenco di uno', () => {
    const v = leggiVisuraProtesti(visura(TRE[0]))!;
    expect(v.effetti).toBe(1);
    // la sintesi ne dichiara tre: l'elenco letto e' incompleto e va detto
    expect(v.dettaglioDisponibile).toBe(false);
  });

  it('visura pulita: nessun protesto', () => {
    const pulita = { Dati: { EventiNegativiImpresa: { Sintesi: { Protesti: { totEffetti: '0', totProtesti: '0', semaforo: 'V' } } } } };
    const v = leggiVisuraProtesti(pulita)!;
    expect(v.presenzaProtesti).toBe(false);
    expect(conEventi(v)).toBe(false);
    expect(sintesiEventi(v)).toBe('nessun evento');
  });

  it('omonimi segnalati dal Registro', () => {
    const j = visura(TRE) as any;
    j.Dati.EventiNegativiImpresa.ElencoOmonimieProtesti = { flagPresenza: 'S' };
    expect(leggiVisuraProtesti(j)!.sintesi.omonimie).toBe(true);
  });

  // Forma della visura protesti persona fisica (prima visura, 14/10/2026), dati inventati
  const persona = (flag: string, semaforo: string) => ({
    Dati: {
      EventiNegativiPersona: {
        InfoPersona: { Nominativo: { cognome: 'ROSSI', nome: 'MARIO', valore: 'ROSSI MARIO' }, CodiceFiscale: 'RSSMRA80A01H501U', DatiNascita: '' },
        Sintesi: { Globale: { semaforo }, Protesti: { semaforo } },
        ElencoProtesti: { flagPresenza: flag },
        ElencoOmonimieProtesti: { flagPresenza: 'N' },
      },
      ElencoDettagli: { Dettaglio: [{ id: 'id-pratica', valore: 'x' }] },
    },
  });

  it('visura persona pulita: nessun protesto', () => {
    const v = leggiVisuraProtesti(persona('N', 'V'))!;
    expect(v.presenzaProtesti).toBe(false);
    expect(v.dettaglioDisponibile).toBe(true);
    expect(v.sintesi).toMatchObject({ effetti: 0, semaforo: 'V', omonimie: false });
  });

  it('visura persona con protesti segnalati ma elenco illeggibile: presenti, senza dettaglio', () => {
    const v = leggiVisuraProtesti(persona('S', 'R'))!;
    expect(v.presenzaProtesti).toBe(true);
    expect(v.dettaglioDisponibile).toBe(false);
    expect(sintesiEventi(v)).toBe('protesti');
    expect(righeEventi(v)).toEqual([['Protesti', 'presenti, dettaglio non disponibile']]);
  });

  it('struttura sconosciuta: null, mai un falso "nessun protesto"', () => {
    expect(leggiVisuraProtesti({})).toBeNull();
    expect(leggiVisuraProtesti({ Dati: { Altro: { x: 1 } } })).toBeNull();
  });

  it('le righe del PDF portano repertorio e firma', () => {
    const r = righeEventi(leggiVisuraProtesti(visura(TRE[0])));
    expect(r[0][1]).toContain('repertorio 61173 · FIRMA: ROSSI MARIO');
  });
});

describe('confrontoVerificaVisura', () => {
  const verifica = leggiEventiNegativi(registro(dettaglio([effetto()])));
  it('verifica indietro rispetto alla visura: lo dice', () => {
    expect(confrontoVerificaVisura(verifica, leggiVisuraProtesti(visura(TRE)))).toBe(
      'La verifica eventi negativi riportava 1 effetto per 10.000 €, la visura 3 effetti per 27.979,15 €. '
      + 'La banca dati della verifica può essere indietro di qualche settimana rispetto al Registro: fa fede la visura.',
    );
  });
  it('stessi effetti e stesso importo: niente da dire', () => {
    expect(confrontoVerificaVisura(verifica, leggiVisuraProtesti(visura([effVisura('20260810', '20260917', '10000.00', '1')])))).toBeNull();
  });
  it('manca uno dei due: niente confronto', () => {
    expect(confrontoVerificaVisura(null, leggiVisuraProtesti(visura(TRE)))).toBeNull();
  });
});
