import { describe, it, expect } from 'vitest';
import { REVENUE_META, type RevenueState } from './revenue-ops';

describe('Revenue Operations ranks money by risk', () => {
  it('captured-not-unlocked is the top priority — real money stuck', () => {
    expect(REVENUE_META.captured_not_unlocked.priority).toBe(0);
    expect(REVENUE_META.captured_not_unlocked.tone).toBe('red');
  });
  it('abandoned checkouts are the lowest — a sales follow-up, not stuck money', () => {
    expect(REVENUE_META.abandoned.priority).toBe(2);
  });
  it('every state has an honest label and a tone', () => {
    for (const s of Object.keys(REVENUE_META) as RevenueState[]) {
      expect(REVENUE_META[s].label.length).toBeGreaterThan(3);
      expect(['red', 'amber', 'stone']).toContain(REVENUE_META[s].tone);
    }
  });
});
