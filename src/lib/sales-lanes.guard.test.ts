import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyLane, type LaneSignals } from './call-queue';
import { CONVERSION_INTENT_DAYS } from './os/scale-config';

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
/** An intent moment n days before TODAY. */
const intentDaysAgo = (n: number) => new Date(Date.parse(TODAY) - n * 86_400_000).toISOString();

describe('the founder’s worked examples classify as he described them', () => {
  it('“Studied 5 of last 7 days → 0 of last 3” is GOING COLD', () => {
    const v = classifyLane(base({ logDates: days(3, 4, 5, 6, 8) }));
    expect(v!.dueReason).toBe('going_cold');
    expect(v!.why.join(' ')).toMatch(/5 of the 7 days before/);
    expect(v!.why.join(' ')).toMatch(/0 in the last 3/);
    expect(v!.action.toLowerCase()).toContain('call today');
  });

  it('“Joined 2 days ago, hasn’t submitted first study log” is NEW — NEVER LOGGED', () => {
    const v = classifyLane(base({ createdAt: new Date(Date.parse(TODAY) - 2 * 86_400_000).toISOString() }));
    expect(v!.dueReason).toBe('new_never_logged');
    expect(v!.why.join(' ')).toMatch(/2 days ago/);
    expect(v!.action).toMatch(/Day 1/);
  });

  it('a 6-day daily run that ended yesterday is BROKEN STREAK, not going-cold', () => {
    const v = classifyLane(base({ logDates: days(1, 2, 3, 4, 5, 6) }));
    expect(v!.dueReason).toBe('broken_streak');
    expect(v!.why.join(' ')).toMatch(/6-day streak/);
  });

  it('RECENT declared buddy intent is the CONVERSION lane, with the taps as evidence', () => {
    const v = classifyLane(base({ buddyTaps: 2, logDates: days(1), intentAt: intentDaysAgo(2) }));
    expect(v!.dueReason).toBe('conversion');
    expect(v!.why.join(' ')).toMatch(/2×/);
    expect(v!.why.join(' '), 'the card must say WHEN, not just how many').toMatch(/2 days ago/);
  });
});

// ── Incident #71 (4 Sep 2026) ──────────────────────────────────────────────
//
// buddy_cta_clicks is a cumulative counter that never resets, so this lane was
// a permanent flag: 136 students held it, only 32 had tapped inside a
// fortnight, and the oldest live one was from 21 July. The lane took 47 and 52
// cards of a 70-card day, rotation got ZERO, and 243 never-contacted students
// were never dealt — while the card told the counsellor "intent is warm".
describe('buddy intent expires — a flag is not a signal', () => {
  it('a tap inside the window is intent', () => {
    const v = classifyLane(base({ buddyTaps: 1, intentAt: intentDaysAgo(CONVERSION_INTENT_DAYS) }));
    expect(v?.dueReason).toBe('conversion');
  });

  it('a tap one day past the window is NOT intent — it is history', () => {
    const v = classifyLane(base({ buddyTaps: 1, intentAt: intentDaysAgo(CONVERSION_INTENT_DAYS + 1) }));
    expect(v?.dueReason).not.toBe('conversion');
  });

  it('the 21 July tap that started this incident no longer pitches anybody', () => {
    const v = classifyLane(base({ buddyTaps: 3, intentAt: '2026-07-21T10:00:00Z' }));
    expect(v, 'a six-week-old tap is not a commercial signal').not.toMatchObject({ dueReason: 'conversion' });
  });

  it('AN UNDATEABLE TAP IS NOT RECENT: 29 production rows carry clicks with no timestamp', () => {
    // The column was added after those rows existed. "We cannot date this" is
    // not "this is fresh" — L1: a trustworthy UNKNOWN beats a precise lie.
    const v = classifyLane(base({ buddyTaps: 5, intentDoor: true, intentAt: null }));
    expect(v?.dueReason).not.toBe('conversion');
  });

  it('a stale-intent student is not deleted — they fall through to be reached another way', () => {
    // Losing them would be a worse bug than over-pitching them: they stay in
    // the book and rotation reaches them with a reason that is true.
    const stale = base({ buddyTaps: 2, intentAt: intentDaysAgo(60), logDates: days(3, 4, 5, 6, 8) });
    expect(classifyLane(stale)?.dueReason, 'a real retention signal still fires').toBe('going_cold');
  });

  it('the intent door alone still counts, and it is always dateable', () => {
    const v = classifyLane(base({ buddyTaps: 0, intentDoor: true, intentAt: intentDaysAgo(1) }));
    expect(v?.dueReason).toBe('conversion');
    expect(v!.why.join(' ')).toMatch(/intent door/);
  });

  it('the ceiling is the fuse behind the recency rule', () => {
    const day = readFileSync('src/lib/sales-day.ts', 'utf8');
    expect(day).toMatch(/conversion: CONVERSION_CEILING/);
  });
});

describe('lane discipline', () => {
  it('every verdict explains itself: non-empty why[] and an action', () => {
    const cases: LaneSignals[] = [
      base({}),
      base({ logDates: days(3, 4, 5, 6, 8) }),
      base({ logDates: days(1, 2, 3, 4, 5, 6) }),
      base({ createdAt: new Date(Date.parse(TODAY) - 3 * 86_400_000).toISOString() }),
      base({ buddyTaps: 1, intentAt: intentDaysAgo(1) }),
      base({ logDates: days(0, 1, 2) }),
    ];
    // A NULL verdict has nothing to explain and is a legitimate answer since
    // §5 removed the catch-all lane — but a version of this test that only
    // skipped nulls would pass if the classifier returned null for everything.
    // So it counts the real verdicts too.
    let verdicts = 0;
    for (const c of cases) {
      const v = classifyLane(c);
      if (v === null) continue;
      verdicts++;
      expect(v.why.length, `lane ${v.dueReason} has no why[]`).toBeGreaterThan(0);
      expect(v.action.length, `lane ${v.dueReason} has no action`).toBeGreaterThan(0);
    }
    expect(verdicts, 'this guard proves nothing if every case classified as null')
      .toBeGreaterThanOrEqual(4);
  });

  it('retention beats conversion: a going-cold student with buddy taps is called for retention', () => {
    // The habit is the product (MISSION: retention outranks monetisation).
    // Intent is real, but a student going cold is losing the thing the pitch
    // depends on — the lanes check retention predicates first.
    const v = classifyLane(base({ logDates: days(3, 4, 5, 6, 8), buddyTaps: 2 }));
    expect(v!.dueReason).toBe('going_cold');
  });

  it('a signup a few hours old is NOT called — 1-day grace before the activation lane', () => {
    const v = classifyLane(base({ createdAt: new Date(Date.parse(TODAY) + 3 * 3600_000).toISOString() }));
    // Since §5 this is null rather than a `fresh` fallthrough — which honours
    // the grace period more strictly than before, not less.
    expect(v?.dueReason).not.toBe('new_never_logged');
  });

  it('a student active today never lands in a retention lane', () => {
    const v = classifyLane(base({ logDates: days(0, 1, 2, 3, 4) }));
    // Updated 29 Aug 2026 (§5): a student studying today, with no buddy intent
    // and past their activation window, now classifies as NO LANE rather than
    // falling through to `fresh`. The assertion this test exists for is
    // unchanged and still holds — they are never pulled into a retention lane.
    expect(v === null || ['conversion', 'fresh'].includes(v.dueReason)).toBe(true);
    expect(v?.dueReason).not.toBe('going_cold');
    expect(v?.dueReason).not.toBe('broken_streak');
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
    // Since 2 Sep 2026 the ceilings live in lib/sales-day (NEW_ARRIVAL_CEILING,
    // ATTENTION_CEILING) and the queue hands its ranked candidates to
    // assembleDay, which is proven on its own in sales-day.test.ts.
    expect(SRC).toMatch(/assembleDay\(/);
    const day = readFileSync('src/lib/sales-day.ts', 'utf8');
    expect(day).toMatch(/new_never_logged: NEW_ARRIVAL_CEILING/);
    expect(day).toMatch(/attention: ATTENTION_CEILING/);
  });

  it('the deck renders the explanation, not just the label', () => {
    const deck = readFileSync('src/components/call-deck.tsx', 'utf8');
    expect(deck).toContain('lead.why');
    expect(deck).toContain('lead.action');
  });
});
