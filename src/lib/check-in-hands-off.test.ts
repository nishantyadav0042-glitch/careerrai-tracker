import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outcomeNeedsDuration, dayWasStudied, durationIsUnknown, VALID_DAY_OUTCOMES } from './check-in';

// ── Q5: the check-in stops asking a question it cannot finish ───────────────
//
// The gate posts hours: 0 for all four outcomes because it never asks how long.
// For 'not_studied' and 'skipped' that is a COMPLETE answer -- the student said
// there was nothing to measure. For 'studied' and 'partial' it leaves the
// question hanging, producing 48 rows across 32 students that no consumer can
// interpret and that weekly-plan-reconcile reads as a literal zero, using it to
// push the student's syllabus finish date out. ~2.2 a day, still accruing.
//
// G6 proposed teaching 30 consumers to interpret those rows. The ruling is
// better: stop creating them.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const GATE = 'src/components/check-in-gate.tsx';
const APP = 'src/components/DailyTracker/DailyTrackerApp.tsx';

describe('which answers the gate can finish by itself', () => {
  it('work outcomes still owe a duration', () => {
    expect(outcomeNeedsDuration('studied')).toBe(true);
    expect(outcomeNeedsDuration('partial')).toBe(true);
  });

  it('an explicit no-work answer is complete — nothing left to measure', () => {
    expect(outcomeNeedsDuration('not_studied')).toBe(false);
    expect(outcomeNeedsDuration('skipped')).toBe(false);
  });

  it('every outcome has a decided answer — no fifth value slips through', () => {
    for (const o of VALID_DAY_OUTCOMES) {
      expect(typeof outcomeNeedsDuration(o)).toBe('boolean');
    }
  });

  it('shares ONE set with dayWasStudied, so the two cannot drift apart', () => {
    // Same constant, different questions. If a fifth outcome is ever added to
    // one and missed in the other, this fails.
    for (const o of VALID_DAY_OUTCOMES) {
      expect(outcomeNeedsDuration(o)).toBe(dayWasStudied({ day_outcome: o, study_duration: 0 }));
    }
  });
});

describe('the row the gate leaves behind is honest, not broken', () => {
  it('a handed-off day reads as UNKNOWN duration, never as zero hours', () => {
    // G13-A stamps it not_collected server-side; Q3 then drops it from
    // averages instead of averaging in a fabricated 0.
    expect(durationIsUnknown({ day_outcome: 'studied', study_duration: 0 })).toBe(true);
  });

  it('a handed-off day still counts as a study day', () => {
    // The student answered. Abandoning the sheet must not cost them the day
    // or the streak -- that is what makes the handoff safe to ship.
    expect(dayWasStudied({ day_outcome: 'studied', study_duration: 0 })).toBe(true);
  });

  it('a completed rest day is still a measured zero', () => {
    expect(durationIsUnknown({ day_outcome: 'not_studied', study_duration: 0 })).toBe(false);
  });
});

describe('the handoff is wired end to end', () => {
  it('the gate hands off exactly the outcomes that owe a duration', () => {
    const s = read(GATE);
    expect(s).toContain('outcomeNeedsDuration');
    expect(s, 'the handoff must be conditional, not unconditional')
      .toMatch(/if \(outcomeNeedsDuration\(finalOutcome\)\)/);
  });

  it('the answer is saved BEFORE the handoff — abandoning the sheet keeps the day', () => {
    const s = read(GATE);
    const save = s.indexOf("fetch('/api/logging/log-daily'");
    const handoff = s.indexOf('outcomeNeedsDuration(finalOutcome)');
    expect(save).toBeGreaterThan(-1);
    expect(handoff, 'the handoff must come after the save').toBeGreaterThan(save);
  });

  it('the handoff carries the DATE the gate asked about', () => {
    // The gate always asks about yesterday. Without the date the sheet would
    // create a second row for today instead of finishing yesterday's.
    const s = read(GATE);
    expect(s).toMatch(/cr-open-log-for-date/);
    expect(s).toMatch(/detail: \{ date: yesterdayStr \}/);
  });

  it('the sheet listens for it and backdates to that date', () => {
    const s = read(APP);
    expect(s).toContain("'cr-open-log-for-date'");
    expect(s, 'must reuse the existing backdating path').toMatch(/setLogDateOverride\(date\)/);
  });

  it('a failed handoff cannot lose the answer', () => {
    const s = read(GATE);
    expect(s, 'the dispatch must be guarded').toMatch(/try \{[\s\S]{0,200}cr-open-log-for-date[\s\S]{0,200}\} catch/);
  });

  it('the handoff is a distinct event from a completed check-in', () => {
    expect(read('src/lib/journey.ts')).toContain("'checkin_handoff_to_log'");
    const s = read(GATE);
    const handoffIdx = s.indexOf("track('checkin_handoff_to_log'");
    const completedIdx = s.indexOf("track('checkin_completed'");
    expect(handoffIdx).toBeGreaterThan(-1);
    expect(completedIdx, 'completed must still fire for the answers the gate DOES finish')
      .toBeGreaterThan(handoffIdx);
  });
});
