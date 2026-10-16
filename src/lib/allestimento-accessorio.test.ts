// Un accessorio senza allestimento va con ogni versione della macchina; uno con
// l'allestimento (la batteria di scorta) solo con quella versione.

import { describe, expect, it } from 'vitest';
import { accessorioCompatibile } from './allestimento-accessorio';

describe('accessorio e allestimento della macchina', () => {
  it('senza allestimento: va con tutte le versioni, anche senza allestimento', () => {
    for (const m of ['cavo', 'batteria', 'steam', null, undefined]) {
      expect(accessorioCompatibile(undefined, m)).toBe(true);
      expect(accessorioCompatibile(null, m)).toBe(true);
      expect(accessorioCompatibile('', m)).toBe(true);
    }
  });
  it('a batteria: solo con la macchina a batteria', () => {
    expect(accessorioCompatibile('batteria', 'batteria')).toBe(true);
    expect(accessorioCompatibile('batteria', 'cavo')).toBe(false);
    expect(accessorioCompatibile('batteria', 'steam')).toBe(false);
    expect(accessorioCompatibile('batteria', null)).toBe(false);
    expect(accessorioCompatibile('batteria', undefined)).toBe(false);
  });
});
