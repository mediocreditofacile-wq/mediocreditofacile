import { describe, expect, it } from 'vitest';
import { rottaAuthChiusa } from './rotte-auth';

describe('rottaAuthChiusa', () => {
  it('chiude le route di gestione organizzazione di Better Auth', () => {
    for (const p of [
      '/api/auth/organization/update-member-role',
      '/api/auth/organization/invite-member',
      '/api/auth/organization/remove-member',
      '/api/auth/organization/delete',
      '/api/auth/organization/update',
      '/api/auth/organization/list-members',
      '/api/auth/organization/get-full-organization',
      '/api/auth/organization',
    ]) {
      expect(rottaAuthChiusa(p), p).toBe(true);
    }
  });

  it('non si aggira con doppie barre, maiuscole o caratteri codificati', () => {
    for (const p of [
      '/api/auth//organization/update-member-role',
      '//api/auth/organization/list',
      '/api/auth/organization/',
      '/API/Auth/Organization/update-member-role',
      '/api/auth/%6Frganization/list',
      '/api/auth/organization%2Fupdate-member-role',
    ]) {
      expect(rottaAuthChiusa(p), p).toBe(true);
    }
  });

  it('lascia aperte le route che il portale usa', () => {
    for (const p of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
      '/api/auth/reset-password/token-di-prova',
      '/api/auth/get-session',
    ]) {
      expect(rottaAuthChiusa(p), p).toBe(false);
    }
  });

  it('non scambia per organizzazione un nome che la contiene soltanto', () => {
    expect(rottaAuthChiusa('/api/auth/organizations')).toBe(false);
    expect(rottaAuthChiusa('/api/organization/list')).toBe(false);
  });

  it('una codifica malformata non fa saltare il controllo', () => {
    expect(rottaAuthChiusa('/api/auth/organization/%E0%A4%A')).toBe(true);
    expect(rottaAuthChiusa('/api/auth/sign-in/%E0%A4%A')).toBe(false);
  });
});
