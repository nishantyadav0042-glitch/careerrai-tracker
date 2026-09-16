import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

// ── THE STUDENT'S NUMBER STAYS THE STUDENT'S ────────────────────────────────
//
// The right-size card exists because the plan is sized to a number the student
// set once and was never shown again: median claimed 5h/day against a median
// 0.6h actually studied, with 83.7% of routines never receiving a tick.
//
// It is one line away from becoming the thing daily-hours.ts forbids. These
// tests hold that line. The card may show evidence and offer a choice; it may
// not write, may not default, and may not decide.

const read = (p: string) => codeOnly(readFileSync(join(process.cwd(), p), 'utf8'));
const CARD = 'src/components/home/right-size-hours-card.tsx';
const TRACKER = 'src/app/student/tracker/page.tsx';
const ENGINE = 'src/lib/capacity-engine.ts';

describe('the card proposes, the student disposes', () => {
  const card = read(CARD);

  it('writes only through the one endpoint the student owns', () => {
    expect(card).toContain('/api/student/daily-hours');
    // Any other write path would bypass setDailyHours and its provenance stamp.
    const fetches = [...card.matchAll(/fetch\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(fetches).toEqual(['/api/student/daily-hours']);
  });

  it('never applies the suggestion by itself', () => {
    // Every commit() call must originate in an onClick. A useEffect that
    // committed would be the app changing the student's number for them.
    expect(card).not.toMatch(/useEffect\([^)]*commit\(/);
    const clicks = (card.match(/onClick=\{\(\) => commit\(/g) ?? []).length;
    expect(clicks, 'the only way the number moves is a tap').toBeGreaterThanOrEqual(2);
  });

  it('offers keeping the current number as a real, equal choice', () => {
    // "Keep" is an answer, not a dismissal — it writes the same value through
    // the same writer, which is what stamps study_hours_set_at and silences
    // the card honestly instead of via a separate dismissal state.
    expect(card).toMatch(/commit\(claimedHours\)/);
    expect(card).toMatch(/right_size_kept/);
  });

  it('carries no shame, no streak and no encouragement', () => {
    // A student told they are failing closes the app. This card states two
    // numbers they produced and offers two buttons.
    expect(card).not.toMatch(/streak|badge|congrat|well done|you can do it|don't give up|failing|behind schedule/i);
  });
});

describe('instrumentation', () => {
  const card = read(CARD);

  it('records all three outcomes, including keeping', () => {
    for (const e of ['right_size_shown', 'right_size_changed', 'right_size_kept']) {
      expect(card, `${e} must be emitted`).toContain(e);
    }
  });

  it('counts one impression per mount, not one per render', () => {
    // React's development double-invoke reports two impressions for one
    // sighting, which halves every rate computed below it.
    expect(card).toMatch(/announced\.current/);
  });

  it('records the decision only after the write succeeded', () => {
    // An event for a save that failed reports a decision the student never
    // made. The track() call must sit below the response check.
    const okIdx = card.indexOf('if (!res.ok) throw new Error()');
    const trackIdx = card.indexOf("track(kept ? 'right_size_kept'");
    expect(okIdx).toBeGreaterThan(-1);
    expect(trackIdx).toBeGreaterThan(okIdx);
  });

  it('every event it emits is declared in the journey union', () => {
    const journey = read('src/lib/journey.ts');
    for (const e of ['right_size_shown', 'right_size_changed', 'right_size_kept']) {
      expect(journey, `${e} must be a declared EventName, not an ad-hoc string`).toContain(`'${e}'`);
    }
  });
});

describe('the tracker reads capacity through the shared derivation', () => {
  const tracker = read(TRACKER);

  it('uses capacityFromReports rather than re-deriving a day count', () => {
    expect(tracker).toMatch(/capacityFromReports\s*\(/);
    expect(tracker, 'a second derivation here would drift from the plan\'s')
      .not.toMatch(/computeCapacity\s*\(/);
  });

  it('selects the columns the measured-day rule reads', () => {
    // Without these, durationIsUnknown treats every zero-hour day as evidence,
    // the behaviour threshold is crossed on days nobody measured, and this
    // page disagrees with the plan about the same student. The Q4 defect.
    expect(tracker).toMatch(/day_outcome/);
    expect(tracker).toMatch(/study_duration_source/);
  });

  it('asks the ownership question before the revision question', () => {
    // A student who cannot prove the number is theirs should not be asked to
    // revise it first.
    expect(tracker).toMatch(/confirmHours == null && shouldOfferHoursCorrection/);
  });

  it('renders nothing when any of the three numbers is missing', () => {
    expect(tracker).toMatch(/hoursReality\.suggestedHours != null/);
  });
});

describe('the engine still may not size the plan', () => {
  it('capBudget remains unwired — the student\'s number sizes the day', () => {
    const engine = read(ENGINE);
    const callers = engine.split('\n')
      .filter((l) => /\bcapBudget\s*\(/.test(l) && !/export function capBudget\(/.test(l));
    expect(callers).toEqual([]);
  });

  it('nothing in this feature writes study_target_hours directly', () => {
    for (const p of [CARD, TRACKER, ENGINE]) {
      expect(read(p), `${p} must go through setDailyHours`).not.toMatch(/study_target_hours\s*:/);
    }
  });
});
