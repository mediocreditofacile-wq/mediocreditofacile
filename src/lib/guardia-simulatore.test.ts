import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./db', () => ({
  env: (k: string) => process.env[k],
  query: async () => ({ rows: [] }),
  getPool: () => ({ connect: async () => { throw new Error('db giu'); } }),
}));

import { decidi, prenota, type Conteggi } from './guardia-simulatore';

const zero: Conteggi = { ultimoMinutoIp: 0, inviiOggi: 0, ricercheOggi: 0, ricercheMese: 0, schedeMese: 0 };

describe('decisione della guardia del simulatore', () => {
  beforeEach(() => {
    delete process.env.OPENAPI_TETTO_SIMULATORE;
    delete process.env.SIMULATORE_TETTO_GIORNO;
    delete process.env.SIMULATORE_TETTO_INVII;
  });

  it('a conteggi zero concede le ricerche chieste e la scheda', () => {
    expect(decidi(zero, 2)).toEqual({ frequenza: false, invio: true, ricerche: 2, scheda: true });
  });

  it('dieci invii nell\'ultimo minuto dallo stesso indirizzo fermano tutto', () => {
    expect(decidi({ ...zero, ultimoMinutoIp: 10 }, 1)).toMatchObject({ frequenza: true, invio: false, ricerche: 0 });
  });

  it('oltre 30 invii nel giorno niente mail e niente ricerca', () => {
    expect(decidi({ ...zero, inviiOggi: 30 }, 1)).toMatchObject({ invio: false, ricerche: 0, motivo: 'tetto_invii' });
  });

  it('con 19 ricerche nel giorno ne concede una sola delle due chieste', () => {
    expect(decidi({ ...zero, ricercheOggi: 19 }, 2)).toMatchObject({ invio: true, ricerche: 1, motivo: 'tetto_giorno' });
  });

  it('il tetto in euro conta ricerche a 0,10 e schede a 0,81', () => {
    // 150 ricerche (15 euro) e 6 schede (4,86): restano 0,14 euro, cioe' una ricerca e niente scheda
    const p = decidi({ ...zero, ricercheMese: 150, schedeMese: 6 }, 2);
    expect(p).toMatchObject({ invio: true, ricerche: 1, scheda: false, motivo: 'tetto_spesa' });
  });

  it('a tetto in euro pieno la mail parte ma la ricerca no', () => {
    expect(decidi({ ...zero, ricercheMese: 200 }, 1)).toMatchObject({ invio: true, ricerche: 0, scheda: false });
  });

  it('col database giu nessuna ricerca, la mail parte', async () => {
    expect(await prenota('ip', 2)).toMatchObject({ id: null, invio: true, ricerche: 0, scheda: false });
  });
});
