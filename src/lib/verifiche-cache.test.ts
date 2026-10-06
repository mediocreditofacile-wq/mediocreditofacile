import { describe, it, expect } from 'vitest';
import { decidiVerifica, riduciNegativita, conEsito, TTL_VERIFICA, ATTESA_MAX, type RegistroVerifiche } from './verifiche-cache';

const adesso = new Date('2026-09-23T12:00:00Z').getTime();
const fa = (ms: number) => new Date(adesso - ms).toISOString();
const GIORNO = 24 * 60 * 60 * 1000;

const reg = (r: Partial<RegistroVerifiche>): RegistroVerifiche => ({ cf: 'PSCMGN83M63G674A', ...r });

describe('decidiVerifica', () => {
  it('nessun registro: si chiama Openapi', () => {
    expect(decidiVerifica(null, 'negativita', adesso)).toEqual({ azione: 'chiama', motivo: 'assente' });
  });

  it('registro con il solo altro tipo: si chiama', () => {
    const r = reg({ negativita: { id: 'n1', avviata: fa(GIORNO), pronto: true, dati: {} } });
    expect(decidiVerifica(r, 'report', adesso)).toEqual({ azione: 'chiama', motivo: 'assente' });
  });

  it('esito pronto dentro il TTL: risponde il registro, con i dati', () => {
    const r = reg({ negativita: { id: 'n1', avviata: fa(10 * GIORNO), pronto: true, dati: { presenzaProtesti: false } } });
    const d = decidiVerifica(r, 'negativita', adesso);
    expect(d.azione).toBe('registro');
    if (d.azione === 'registro') {
      expect(d.pronto).toBe(true);
      expect(d.id).toBe('n1');
      expect(d.dati).toEqual({ presenzaProtesti: false });
    }
  });

  it('esito pronto oltre il TTL: si richiama', () => {
    const r = reg({ report: { id: 'r1', avviata: fa(TTL_VERIFICA + 1000), pronto: true, dati: {} } });
    expect(decidiVerifica(r, 'report', adesso)).toEqual({ azione: 'chiama', motivo: 'scaduta' });
  });

  it('il TTL si misura sulla singola verifica, non sulle altre del file', () => {
    const r = reg({
      negativita: { id: 'n1', avviata: fa(40 * GIORNO), pronto: true, dati: {} },
      report: { id: 'r1', avviata: fa(GIORNO), pronto: true, dati: {} },
    });
    expect(decidiVerifica(r, 'negativita', adesso).azione).toBe('chiama');
    expect(decidiVerifica(r, 'report', adesso).azione).toBe('registro');
  });

  it('in lavorazione da poco: registro senza dati, il browser riprende il polling sullo stesso id', () => {
    const r = reg({ report: { id: '6ab3d4c887f66a1b8a0e02a3', avviata: fa(10 * 60 * 1000), pronto: false } });
    const d = decidiVerifica(r, 'report', adesso);
    expect(d).toMatchObject({ azione: 'registro', id: '6ab3d4c887f66a1b8a0e02a3', pronto: false });
  });

  it('in lavorazione da oltre ATTESA_MAX: la pratica e\' morta, si rilancia', () => {
    const r = reg({ report: { id: 'r1', avviata: fa(ATTESA_MAX + 1000), pronto: false } });
    expect(decidiVerifica(r, 'report', adesso)).toEqual({ azione: 'chiama', motivo: 'bloccata' });
  });

  it('data di avvio illeggibile: si richiama', () => {
    const r = reg({ negativita: { id: 'n1', avviata: 'boh', pronto: true, dati: {} } });
    expect(decidiVerifica(r, 'negativita', adesso).azione).toBe('chiama');
  });
});

describe('riduciNegativita', () => {
  it('nessun evento: solo le tre presenze', () => {
    expect(riduciNegativita({ presenzaProtesti: false, altro: 'x' })).toEqual({
      presenzaProtesti: false, presenzaPregiudizievoli: false, presenzaProcedure: false,
    });
  });
  it('con un evento: si tiene anche il dettaglio', () => {
    const d = { presenzaProtesti: true, protesti: [{ importo: 100 }] };
    expect(riduciNegativita(d)).toMatchObject({ presenzaProtesti: true, dettaglio: d });
  });
});

describe('conEsito', () => {
  it('scrivere il report non cancella la negativita\'', () => {
    const r = reg({ negativita: { id: 'n1', avviata: fa(0), pronto: true, dati: {} } });
    const out = conEsito(r, r.cf, 'report', { id: 'r1', avviata: fa(0), pronto: false });
    expect(out.negativita?.id).toBe('n1');
    expect(out.report?.id).toBe('r1');
  });
});
