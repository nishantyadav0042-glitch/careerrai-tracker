/**
 * ── Came back once, then stopped ───────────────────────────────────────────
 *
 * Founder, 15 Sep 2026: *"jis bhi student ne ek se zyada din log kiya hai, wo
 * students hamari pehli priority hain calling ke liye."*
 *
 * Day one is us — onboarding walks the student into the log. Day two is the
 * student choosing, on a different day, to come back. It is the only unpaid
 * evidence of intent the free product produces, and 47 of the 103 free
 * students who have it had studied nothing in fifteen days while the queue
 * classified them as `null` — backlog, reachable "eventually" through
 * rotation.
 *
 * This guard pins the four things that make the lane worth having and the one
 * that stops it becoming a nuisance.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyLane, RETENTION_LANES, type LaneSignals } from './call-queue';
import { RESTART_MIN_LOG_DAYS, RESTART_MIN_SILENT_DAYS, TOUCH_COOLDOWN_DAYS } from './os/scale-config';
import { SECTION_OF } from './sales-day';

const TODAY = '2026-09-15';
const days = (...ago: number[]) =>
  ago.map((n) => new Date(Date.parse(TODAY) - n * 86_400_000).toISOString().slice(0, 10));
function base(over: Partial<LaneSignals>): LaneSignals {
  const b: LaneSignals = {
    todayIst: TODAY, createdAt: null, logDates: [], studiedDates: [],
    buddyTaps: 0, intentDoor: false, momentumScore: 0, ...over,
  };
  return over.studiedDates === undefined ? { ...b, studiedDates: b.logDates } : b;
}

describe('a student who logged more than one day and stopped is not backlog', () => {
  it('two logged days and a week of silence is the RESTART lane', () => {
    // Before 15 Sep this returned null: two days is not a 3-of-7 rhythm
    // (going_cold) and not a 5-day run (broken_streak), so the student fell
    // through to "no signal today".
    const v = classifyLane(base({ logDates: days(8, 14) }));
    expect(v, 'this student used to classify as nothing at all').not.toBeNull();
    expect(v!.dueReason).toBe('restart');
    expect(v!.why.join(' ')).toMatch(/2 separate days/);
    expect(v!.action, 'the call opens on what they did, not on a pitch').toMatch(/what changed/i);
  });

  it('one logged day is NOT the lane — that day was onboarding, not a choice', () => {
    // 186 free students logged exactly one day and stopped. Counting them here
    // would bury the 103 who came back under a group four times its size and
    // make "first priority" meaningless.
    expect(classifyLane(base({ logDates: days(9) }))).toBeNull();
    expect(RESTART_MIN_LOG_DAYS).toBe(2);
  });

  it('does not chase a student who simply has not logged since yesterday', () => {
    expect(classifyLane(base({ logDates: days(1, 6) }))).toBeNull();
    expect(RESTART_MIN_SILENT_DAYS).toBe(3);
  });

  it('never takes a student the stronger habit lanes want', () => {
    // going_cold and broken_streak are this same student further along. They
    // are checked first and must stay first — a 3-of-7 rhythm gone quiet is a
    // more urgent conversation than two days a fortnight ago.
    expect(classifyLane(base({ logDates: days(3, 4, 5, 6, 8) }))!.dueReason).toBe('going_cold');
    expect(classifyLane(base({ logDates: days(2, 3, 4, 5, 6, 7) }))!.dueReason).toBe('broken_streak');
  });

  it('ranks more days, then more recent, above fewer and older', () => {
    const many = classifyLane(base({ logDates: days(5, 6, 9) }))!;
    const few = classifyLane(base({ logDates: days(5, 9) }))!;
    const old = classifyLane(base({ logDates: days(25, 28) }))!;
    expect(many.sortBoost).toBeGreaterThan(few.sortBoost);
    expect(few.sortBoost, 'a student who stopped last week is asked before one who stopped a month ago')
      .toBeGreaterThan(old.sortBoost);
  });
});

describe('the lane cannot become the never-refreshing list', () => {
  it('waits out the one-touch-a-week cooldown like attention and rotation', () => {
    // THE FAILURE THIS PREVENTS. The other retention lanes are exempt from the
    // cooldown because they expire on their own — going cold is a 10-day
    // window, a broken streak is at most three days old. Two logged days never
    // expire, so an exempt restart card would be re-dealt every single morning
    // until the student logged again. That is the bug that put 115 of 121
    // worked cards back into the next day's deck before 10 Sep.
    const src = readFileSync(join(__dirname, 'call-queue.ts'), 'utf8');
    const guard = src.slice(src.indexOf('daysSilent < TOUCH_COOLDOWN_DAYS'));
    const stanza = guard.slice(0, guard.indexOf('continue;'));
    expect(stanza, 'restart must respect the cooldown').toContain("dueReason === 'restart'");
    expect(TOUCH_COOLDOWN_DAYS).toBeGreaterThan(0);
  });

  it('clears by itself the moment the student logs again', () => {
    // A retention lane is transient by definition: it must be a state the
    // student can leave, never a flag that never resets (Incident #71).
    expect(RETENTION_LANES.has('restart')).toBe(true);
    expect(classifyLane(base({ logDates: days(0, 8, 14) })), 'logged today — nothing to restart').toBeNull();
  });

  it('is dealt as a CALL, under retention', () => {
    // Only attention and rotation are messaged. "Ask what changed" is a
    // conversation; a template asking it would be worse than silence.
    expect(SECTION_OF.restart).toBe('retention');
  });
});

describe('it ranks where the founder put it', () => {
  it('above everything that is not a promise or a stronger habit lane', () => {
    const src = readFileSync(join(__dirname, 'call-queue.ts'), 'utf8');
    const band = src.slice(src.indexOf('const BAND: Record<string, number>'));
    const line = band.slice(0, band.indexOf('};'));
    const val = (lane: string) => Number(line.match(new RegExp(`${lane}: ([0-9_]+)`))![1].replace(/_/g, ''));
    expect(val('restart')).toBeLessThan(val('broken_streak'));
    expect(val('restart')).toBeGreaterThan(val('new_never_logged'));
    expect(val('restart')).toBeGreaterThan(val('conversion'));
    expect(val('restart')).toBeGreaterThan(val('attention'));
    expect(val('restart')).toBeGreaterThan(val('fresh'));
  });
});
