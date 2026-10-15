// Le regole pure degli eventi negativi della ricerca: su che codice si fa la
// verifica, come si legge l'esito, quando una ricerca riaperta interroga Openapi.

import { describe, expect, it } from 'vitest';
import { ATTESA_EVENTI_MS, bersaglioEventi, codiceVerifica, eventiNonAvviati, RILETTURA_DOPO_MS, serveControllo, statoDaEsito, type EventiRicerca } from './eventi-stato';

describe('bersaglio della verifica', () => {
  it('partita IVA sulle società', () => {
    expect(bersaglioEventi('01234567890', 'SR', '01234567890')).toBe('01234567890');
  });
  it('codice fiscale del titolare sulle ditte individuali', () => {
    expect(bersaglioEventi('01234567890', 'DI', 'rssmra70a01l840x')).toBe('RSSMRA70A01L840X');
  });
  it('ditta senza codice fiscale leggibile: partita IVA', () => {
    expect(bersaglioEventi('01234567890', 'DI', null)).toBe('01234567890');
    expect(bersaglioEventi('01234567890', 'DI', '01234567890')).toBe('01234567890');
  });
});

describe('esito', () => {
  it('basta una presenza per dire presenti', () => {
    expect(statoDaEsito({ presenzaProtesti: false, presenzaPregiudizievoli: true, presenzaProcedure: false })).toBe('presenti');
    expect(statoDaEsito({ presenzaProtesti: false, presenzaPregiudizievoli: false, presenzaProcedure: false })).toBe('assenti');
    expect(statoDaEsito(null)).toBe('assenti');
  });
});

describe('ricerca riaperta', () => {
  const base: EventiRicerca = {
    stato: 'in-verifica', id: 'neg-1', avviata: '2026-10-15T10:00:00.000Z', chiusa: null,
    codice: '01234567890', daRegistro: false, mail: 'da-mandare',
  };
  const t0 = new Date(base.avviata!).getTime();
  it('dentro i 90 secondi risponde il database', () => {
    expect(serveControllo(base, t0 + ATTESA_EVENTI_MS - 1)).toBe(false);
  });
  it('nel margine dopo i 90 secondi risponde ancora il database', () => {
    // l'ultimo giro del server e la pagina non devono leggere insieme: il dettaglio si paga a ogni lettura
    expect(serveControllo(base, t0 + ATTESA_EVENTI_MS + 15_000)).toBe(false);
  });
  it('finito il giro in background, con margine, una lettura su Openapi', () => {
    expect(serveControllo(base, t0 + RILETTURA_DOPO_MS + 1)).toBe(true);
    expect(serveControllo({ ...base, stato: 'non-pervenuti' }, t0 + 10 * 60_000)).toBe(true);
  });
  it('esito chiuso o verifica mai partita: niente da leggere', () => {
    expect(serveControllo({ ...base, stato: 'assenti' }, t0 + 10 * 60_000)).toBe(false);
    expect(serveControllo(eventiNonAvviati('01234567890'), t0 + 10 * 60_000)).toBe(false);
    expect(serveControllo(null)).toBe(false);
  });
});

describe('codice della verifica alla pratica', () => {
  const ev: EventiRicerca = {
    stato: 'assenti', id: 'neg-1', avviata: '2026-10-15T10:00:00.000Z', chiusa: '2026-10-15T10:00:30.000Z',
    codice: 'RSSMRA70A01L840X', daRegistro: false, mail: 'mandata',
  };
  it('lo stesso della ricerca: sulle ditte il codice fiscale del titolare', () => {
    expect(codiceVerifica({ piva: '01234567890', eventi: ev })).toBe('RSSMRA70A01L840X');
  });
  it('senza eventi salvati: la partita IVA', () => {
    expect(codiceVerifica({ piva: '01234567890', eventi: null })).toBe('01234567890');
  });
});
