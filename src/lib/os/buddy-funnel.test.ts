import { describe, it, expect } from 'vitest';
import { rateOrNull, ratesAreMeaningful, MIN_FOR_RATE, BUDDY_FUNNEL_STEPS, type FunnelStepCount } from '@/lib/os/buddy-funnel';

const step = (key: string, people: number): FunnelStepCount =>
  ({ key, label: key, note: '', events: people, people, firstSeen: null, lastSeen: null });

describe('rateOrNull', () => {
  it('refuses to state a rate over a tiny base', () => {
    // Three ₹299 clicks and no payment is not "0% conversion".
    expect(rateOrNull(0, 3)).toBeNull();
    expect(rateOrNull(1, MIN_FOR_RATE - 1)).toBeNull();
  });

  it('states a rate once the base can carry one', () => {
    expect(rateOrNull(15, 30)).toBe(50);
    expect(rateOrNull(0, 100)).toBe(0);
  });
});

describe('ratesAreMeaningful', () => {
  it('is false at the current scale', () => {
    expect(ratesAreMeaningful([step('session_book_click', 3)])).toBe(false);
  });

  it('turns true only at the threshold', () => {
    expect(ratesAreMeaningful([step('session_book_click', MIN_FOR_RATE)])).toBe(true);
  });

  it('is false when the entry step is absent entirely', () => {
    expect(ratesAreMeaningful([])).toBe(false);
  });
});

describe('the funnel definition', () => {
  it('separates the two ways a student reaches the buddy', () => {
    const keys = BUDDY_FUNNEL_STEPS.map((s) => s.key);
    expect(keys).toContain('buddy_nudge_shown');   // Rai offered
    expect(keys).toContain('buddy_unlock_open');   // student went looking
  });

  it('records dismissals without naming a reason', () => {
    const dismissals = BUDDY_FUNNEL_STEPS.filter((s) => s.label.includes('Dismissed'));
    expect(dismissals.length).toBeGreaterThan(0);
    for (const d of dismissals) {
      expect(d.note, 'we never asked, so we must not claim to know').toMatch(/unknown/i);
    }
  });
});
