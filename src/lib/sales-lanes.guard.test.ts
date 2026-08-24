import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyLane, type LaneSignals } from './call-queue';

// ── The retention-first queue explains itself ───────────────────────────────
//
// Founder build order, 24 Aug 2026: the rep's Job #1 is retention, so the
// queue leads with retention lanes, and EVERY card answers "WHY THIS STUDENT
// IS HERE" — the trigger, the evidence with real numbers, and the recommended
// move. This guard pins the ideas:
//   · lanes are deterministic predicates over named data, not an opaque score
//   · every verdict carries non-empty why[] and an action
//   · the founder's own worked examples classify the way he described them
//
// classifyLane is pure precisely so this file can drive it without a DB —
// the same "encode the idea" philosophy as every other guard here.

const TODAY = '2026-08-24';
function base(over: Partial<LaneSignals>): LaneSignals {
  return { todayIst: TODAY, createdAt: null, logDates: [], buddyTaps: 0, intentDoor: false, momentumScore: 0, ...over };
}
/** Log dates n days ago (IST). */
function days(...ago: number[]): string[] {
  return ago.map((n) => new Date(Date.parse(TODAY) - n * 86_400_000).toISOString().slice(0, 10));
}

describe('the founder’s worked examples classify as he described them', () => {
  it('“Studied 5 of last 7 days → 0 of last 3” is GOING COLD', () => {
    const v = classifyLane(base({ logDates: days(3, 4, 5, 6, 8) }));
    expect(v.dueReason).toBe('going_cold');
    expect(v.why.join(' ')).toMatch(/5 of the 7 days before/);
    expect(v.why.join(' ')).toMatch(/0 in the last 3/);
    expect(v.action.toLowerCase()).toContain('call today');
  });

  it('“Joined 2 days ago, hasn’t submitted first study log” is NEW — NEVER LOGGED', () => {
    const v = classifyLane(base({ createdAt: new Date(Date.parse(TODAY) - 2 * 86_400_000).toISOString() }));
    expect(v.dueReason).toBe('new_never_logged');
    expect(v.why.join(' ')).toMatch(/2 days ago/);
    expect(v.action).toMatch(/Day 1/);
  });

  it('a 6-day daily run that ended yesterday is BROKEN STREAK, not going-cold', () => {
    const v = classifyLane(base({ logDates: days(1, 2, 3, 4, 5, 6) }));
    expect(v.dueReason).toBe('broken_streak');
    expect(v.why.join(' ')).toMatch(/6-day streak/);
  });

  it('declared buddy intent is the CONVERSION lane, with the taps as evidence', () => {
    const v = classifyLane(base({ buddyTaps: 2, logDates: days(1) }));
    expect(v.dueReason).toBe('conversion');
    expect(v.why.join(' ')).toMatch(/2×/);
  });
});

describe('lane discipline', () => {
  it('every verdict explains itself: non-empty why[] and an action', () => {
    const cases: LaneSignals[] = [
      base({}),
      base({ logDates: days(3, 4, 5, 6, 8) }),
      base({ logDates: days(1, 2, 3, 4, 5, 6) }),
      base({ createdAt: new Date(Date.parse(TODAY) - 3 * 86_400_000).toISOString() }),
      base({ buddyTaps: 1 }),
      base({ logDates: days(0, 1, 2) }),
    ];
    for (const c of cases) {
      const v = classifyLane(c);
      expect(v.why.length, `lane ${v.dueReason} has no why[]`).toBeGreaterThan(0);
      expect(v.action.length, `lane ${v.dueReason} has no action`).toBeGreaterThan(0);
    }
  });

  it('retention beats conversion: a going-cold student with buddy taps is called for retention', () => {
    // The habit is the product (MISSION: retention outranks monetisation).
    // Intent is real, but a student going cold is losing the thing the pitch
    // depends on — the lanes check retention predicates first.
    const v = classifyLane(base({ logDates: days(3, 4, 5, 6, 8), buddyTaps: 2 }));
    expect(v.dueReason).toBe('going_cold');
  });

  it('a signup a few hours old is NOT called — 1-day grace before the activation lane', () => {
    const v = classifyLane(base({ createdAt: new Date(Date.parse(TODAY) + 3 * 3600_000).toISOString() }));
    expect(v.dueReason).not.toBe('new_never_logged');
  });

  it('a student active today never lands in a retention lane', () => {
    const v = classifyLane(base({ logDates: days(0, 1, 2, 3, 4) }));
    expect(['conversion', 'fresh']).toContain(v.dueReason);
  });
});

describe('queue-level wiring (source-pinned)', () => {
  const SRC = readFileSync('src/lib/call-queue.ts', 'utf8');

  it('promises still outrank every retention lane: callback > retry > followup > lanes', () => {
    // The sort bands: due tiers 5–7M, retention 3–4M, conversion 1M, fresh <1M.
    expect(SRC).toMatch(/7_000_000 \+ minutesOverdue/);
    expect(SRC).toMatch(/6_000_000 \+ minutesOverdue/);
    expect(SRC).toMatch(/5_000_000 \+ minutesOverdue/);
    expect(SRC).toMatch(/going_cold: 4_000_000/);
  });

  it('the never-logged flood is capped so one lane cannot eat the whole day', () => {
    expect(SRC).toMatch(/LANE_CAPS/);
    expect(SRC).toMatch(/new_never_logged: 25/);
  });

  it('the deck renders the explanation, not just the label', () => {
    const deck = readFileSync('src/components/call-deck.tsx', 'utf8');
    expect(deck).toContain('lead.why');
    expect(deck).toContain('lead.action');
  });
});
