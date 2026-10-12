// Promo Alba Easy Lease: vale fino a fine giornata della scadenza, poi sparisce da sola.
// Nasce dal 12/10/2026: la scadenza non si controllava e la promo e' rimasta a video
// con la data del 30 giugno ormai passata.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALBA, ALBA_EASY_LEASE, SELLA, easyLeaseEligibile, easyLeaseInCorso } from './leasing';

describe('promo Easy Lease', () => {
  afterEach(() => vi.useRealTimers());

  it("e' in corso fino a fine giornata del 30 ottobre 2026", () => {
    expect(ALBA_EASY_LEASE.scadenza).toBe('2026-10-30');
    expect(easyLeaseInCorso(new Date('2026-10-30T23:59:00'))).toBe(true);
    expect(easyLeaseInCorso(new Date('2026-10-31T00:00:01'))).toBe(false);
  });

  it('dopo la scadenza non si applica piu ad Alba', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00'));
    expect(easyLeaseEligibile(ALBA, 50_000, 'strumentale-generico')).toBe(true);
    vi.setSystemTime(new Date('2026-11-02T10:00:00'));
    expect(easyLeaseEligibile(ALBA, 50_000, 'strumentale-generico')).toBe(false);
  });

  it('vale solo per Alba e fino a 200.000 euro', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00'));
    expect(easyLeaseEligibile(SELLA, 50_000, 'strumentale-generico')).toBe(false);
    expect(easyLeaseEligibile(ALBA, 200_001, 'strumentale-generico')).toBe(false);
  });
});
