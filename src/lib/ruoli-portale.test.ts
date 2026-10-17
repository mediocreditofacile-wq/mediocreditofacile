import { describe, expect, it } from 'vitest';
import { agente, referente } from './ruoli-portale';

// F5 della scansione Claude Security del 17/10/2026: il referente non deve
// avere i permessi di Better Auth su membri, inviti e organizzazione.

describe('referente', () => {
  it('non gestisce membri, inviti e organizzazione dalle API di Better Auth', () => {
    expect(referente.authorize({ member: ['create'] }).success).toBe(false);
    expect(referente.authorize({ member: ['update'] }).success).toBe(false);
    expect(referente.authorize({ member: ['delete'] }).success).toBe(false);
    expect(referente.authorize({ invitation: ['create'] }).success).toBe(false);
    expect(referente.authorize({ invitation: ['cancel'] }).success).toBe(false);
    expect(referente.authorize({ organization: ['update'] }).success).toBe(false);
    expect(referente.authorize({ organization: ['delete'] }).success).toBe(false);
  });

  it('tiene i permessi del portale', () => {
    expect(referente.authorize({ preventivo: ['crea', 'leggi-propri', 'leggi-org'] }).success).toBe(true);
    expect(referente.authorize({ utente: ['invita', 'disattiva', 'lista'] }).success).toBe(true);
    expect(referente.authorize({ documento: ['leggi-propri', 'leggi-org'] }).success).toBe(true);
  });
});

describe('agente', () => {
  it('crea e rilegge solo i propri', () => {
    expect(agente.authorize({ preventivo: ['crea', 'leggi-propri'] }).success).toBe(true);
    expect(agente.authorize({ documento: ['leggi-propri'] }).success).toBe(true);
    expect(agente.authorize({ preventivo: ['leggi-org'] }).success).toBe(false);
    expect(agente.authorize({ utente: ['lista'] }).success).toBe(false);
    expect(agente.authorize({ member: ['update'] }).success).toBe(false);
  });
});
