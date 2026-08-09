import { describe, it, expect } from 'vitest';
import { classifyStudent, priorityMeta, type PriorityInput } from './student-priority';

const base: PriorityInput = {
  isPremium: false, hasBuddy: false, paymentStuck: false, wantsBuddy: false,
  activeRecently: false, hasPlan: false, daysSinceLog: null,
};
const c = (o: Partial<PriorityInput>) => classifyStudent({ ...base, ...o }).priority;

describe('P0 — revenue at risk always wins', () => {
  it('a stuck payment is P0 even if everything else looks healthy', () => {
    expect(c({ paymentStuck: true, isPremium: true, hasBuddy: true })).toBe('P0');
  });
  it('premium without a mentor is P0', () => {
    expect(c({ isPremium: true, hasBuddy: false })).toBe('P0');
  });
  it('a premium student WITH a mentor is not P0', () => {
    expect(c({ isPremium: true, hasBuddy: true })).toBe('P3');
  });
});

describe('P1 — the hot sales lead', () => {
  it('wants a buddy, active, not subscribed → P1', () => {
    expect(c({ wantsBuddy: true, activeRecently: true })).toBe('P1');
  });
  it('wants a buddy but inactive is NOT a hot lead', () => {
    expect(c({ wantsBuddy: true, activeRecently: false })).not.toBe('P1');
  });
  it('a paying student is never P1 — they already bought', () => {
    expect(c({ isPremium: true, hasBuddy: true, wantsBuddy: true, activeRecently: true })).toBe('P3');
  });
});

describe('P2 — engagement opportunity', () => {
  it('active and free, no explicit want → P2', () => {
    expect(c({ activeRecently: true })).toBe('P2');
  });
  it('going cold (4+ days) → P2', () => {
    expect(c({ daysSinceLog: 6 })).toBe('P2');
  });
});

describe('P3 — healthy', () => {
  it('premium with a mentor, or a quiet free student', () => {
    expect(c({ isPremium: true, hasBuddy: true })).toBe('P3');
    expect(c({ daysSinceLog: 1 })).toBe('P3');
  });
});

describe('the ranking is total and stable', () => {
  it('every verdict carries a reason and a badge tone', () => {
    for (const p of ['P0', 'P1', 'P2', 'P3'] as const) {
      const m = priorityMeta(p);
      expect(m.label.length).toBeGreaterThan(3);
      expect(['red', 'orange', 'amber', 'green']).toContain(m.tone);
    }
  });
});
