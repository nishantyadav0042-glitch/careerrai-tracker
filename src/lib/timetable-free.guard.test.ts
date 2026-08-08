import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// ── "The machine is free. The human is paid." ───────────────────────────────
//
// Founder, 8 Aug 2026: the coaching-timetable scanner is free for every
// student. It had been premium-gated for a day, and the evidence said that was
// backwards — 70–80% of serious aspirants already hold a coaching timetable,
// so turning that sheet into an aligned daily plan is the fastest proof we can
// offer that we save them work. We were charging for the proof.
//
// The line this test defends: uploading, reading and aligning a timetable is
// automation and costs us cents, so it is free. A mentor sitting with a
// student to correct it is a person's hours, so it stays paid.
//
// This is a guard rather than a comment because a paywall is exactly the kind
// of thing that gets re-added in a hurry during a revenue conversation.

const parseRoute = readFileSync('src/app/api/timetable/parse/route.ts', 'utf8');
const saveRoute = readFileSync('src/app/api/timetable/route.ts', 'utf8');
const buddyRoute = readFileSync('src/app/api/buddy/student-timetable/route.ts', 'utf8');
const card = readFileSync('src/components/timetable-card.tsx', 'utf8');

/** Strip comments so prose ABOUT the paywall doesn't read as the paywall. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

describe('the coaching timetable is free for every student', () => {
  it('the scanner refuses nobody for lack of premium', () => {
    const src = code(parseRoute);
    expect(src).not.toMatch(/is_premium/);
    expect(src).not.toMatch(/premiumRequired/);
  });

  it('saving a timetable refuses nobody for lack of premium', () => {
    const src = code(saveRoute);
    expect(src).not.toMatch(/premiumRequired/);
    // The GET may still REPORT is_premium (the card uses it to offer the
    // mentor). What it must never do is branch the save on it.
    expect(src).not.toMatch(/is_premium\s*!==\s*true/);
  });

  it('the card never puts a wall in front of a student without a timetable', () => {
    const src = code(card);
    // The mentor offer must sit inside the branch that renders saved classes,
    // never in the empty state. Proxy for that: the empty state's CTA exists
    // and no lock iconography is imported at all.
    expect(src).toMatch(/Add my timetable/);
    expect(src).not.toMatch(/\bLock\b/);
  });

  it('still charges for the human — buddy curation stays authorized', () => {
    // The other half of the line. If this ever goes open, we are giving away
    // mentor hours, which is the one thing that genuinely costs us money.
    const src = code(buddyRoute);
    expect(src).toMatch(/buddy_id/);
  });
});

describe('the quota that replaced the paywall', () => {
  it('caps uploads per hour and per day, since free students share the AI key', () => {
    const src = code(parseRoute);
    expect(src).toMatch(/timetable_parsed/);
    // Two ceilings, not one: a burst limit for retry loops and a daily limit,
    // because this is a once-or-twice-a-week action for a real student.
    expect(src).toMatch(/lastHour/);
    expect(src).toMatch(/lastDay/);
    expect(src).toMatch(/429/);
  });
});
