// Le pratiche lavorate prima del portale nella scheda Pratiche: MCF e referente
// le vedono, il commerciale no; il canale esce solo per MCF.

import { describe, expect, it } from 'vitest';
import { praticheEsternePerRuolo, type RigaEsterna } from './pratiche-esterne';

const righe: RigaEsterna[] = [
  { id: '3', piva: '01234567890', ragione_sociale: 'MACMARK S.R.L.', canale: 'pagarent', data: '2026-07-28', esito: 'sospesa', importo: '67160.00' },
  { id: '7', piva: '09876543210', ragione_sociale: 'C.R. CONSULTING S.R.L.', canale: null, data: '2026-10-14', esito: 'non deliberabile', importo: null },
];

describe('pratiche lavorate prima del portale', () => {
  it('il commerciale non le vede', () => {
    expect(praticheEsternePerRuolo(righe, 'agente', false)).toEqual([]);
  });

  it('il referente le vede senza il canale', () => {
    const r = praticheEsternePerRuolo(righe, 'referente', true);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: '3', piva: '01234567890', ragione_sociale: 'MACMARK S.R.L.', data: '2026-07-28', esito: 'sospesa', importo: 67160 });
    expect(r.every((x) => !('canale' in x))).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/pagarent|rete rent|reterent/i);
  });

  it('MCF le vede col nome del canale, o null se non indicato', () => {
    const r = praticheEsternePerRuolo(righe, 'admin', true);
    expect(r[0].canale).toBe('Pagarent');
    expect(r[1].canale).toBeNull();
  });

  it('un importo assente resta assente, non zero', () => {
    expect(praticheEsternePerRuolo(righe, 'referente', true)[1].importo).toBeNull();
  });
});
