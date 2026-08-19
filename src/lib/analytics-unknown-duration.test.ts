import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSummary } from './analytics';
import { durationIsUnknown } from './check-in';
import type { DailyReport } from '@/types';

// ── Q3: no usable duration is UNKNOWN, never 0 hours ────────────────────────
//
// Founder ruling: "No known duration != 0 hours."
//
// FOURTH APPEARANCE OF ONE BUG. J2: avg([]) === 0 fired a sleep flag at
// students who had logged nothing. A3: study_duration > 0 read 65 declared
// study days as non-study days. Q3: avg() over unmeasured durations reports a
// low number and red-flags the student for it. Same disease every time —
// absence of evidence rendered as a confident number.
//
// WHY THIS IS A RE-CUT AND NOT A LIFT. The parked branch detected "unmeasured"
// from `study_duration_source === 'not_collected'` alone. That column is NULL
// in all 342 production rows, so that implementation would have shipped and
// excluded EXACTLY ZERO rows — a fix that looks like a fix and changes
// nothing. Measured: branch rule 0 rows, this rule 65 rows across 40 students.
//
// WHAT THIS DELIBERATELY DOES NOT DECIDE. A bare NULL provenance still means
// "we don't know where this number came from" and does NOT by itself make a
// duration unknown. The held ruling on NULL semantics (G14 item F) is
// untouched. What makes a duration unknown here is POSITIVE evidence: the
// student declared work happened AND the stored duration is zero.

const row = (o: Partial<DailyReport>): DailyReport => ({
  id: 'r', student_id: 's', report_date: '2026-08-01',
  study_duration: 0, topics_covered: [], mood_emoji: '💪', mock_taken: false,
  notes: null, created_at: '', updated_at: '',
  ...o,
} as DailyReport);

describe('what counts as an unmeasured duration', () => {
  it('declared work with zero hours is UNKNOWN — the legacy era, 65 real rows', () => {
    expect(durationIsUnknown({ day_outcome: 'studied', study_duration: 0 })).toBe(true);
    expect(durationIsUnknown({ day_outcome: 'partial', study_duration: 0 })).toBe(true);
  });

  it("an explicit 'not_collected' stamp is UNKNOWN — the provenance era", () => {
    expect(durationIsUnknown({ day_outcome: null, study_duration: 0, study_duration_source: 'not_collected' })).toBe(true);
  });

  it('a declared rest day at zero hours is MEASURED — "I did not study" is a measurement', () => {
    // Excluding these would let a student dodge every flag by honestly
    // reporting bad days. This is the half of the rule that protects the flag.
    expect(durationIsUnknown({ day_outcome: 'not_studied', study_duration: 0 })).toBe(false);
    expect(durationIsUnknown({ day_outcome: 'skipped', study_duration: 0 })).toBe(false);
  });

  it('any positive duration is MEASURED, whatever the outcome says', () => {
    expect(durationIsUnknown({ day_outcome: 'studied', study_duration: 2 })).toBe(false);
    expect(durationIsUnknown({ day_outcome: null, study_duration: 0.5 })).toBe(false);
  });

  it('bare NULL provenance alone does NOT make a duration unknown', () => {
    // The held ruling (G14 item F). All 342 production rows are NULL here; if
    // NULL alone meant unknown, every historical row would be reclassified in
    // one deploy — which J6-A forbids.
    expect(durationIsUnknown({ day_outcome: null, study_duration: 0, study_duration_source: null })).toBe(false);
  });
});

describe('the average is honest about what it could measure', () => {
  it('averages only measured days, so fabricated zeros stop dragging it down', () => {
    const s = computeSummary([
      row({ study_duration: 4, day_outcome: 'studied' }),
      row({ study_duration: 0, day_outcome: 'studied' }),   // worked, never measured
      row({ study_duration: 2, day_outcome: 'partial' }),
    ], 7);
    expect(s.avgStudy).toBe(3); // (4+2)/2 — not (4+0+2)/3 = 2
  });

  it('a real declared zero still counts against the average', () => {
    const s = computeSummary([
      row({ study_duration: 4, day_outcome: 'studied' }),
      row({ study_duration: 0, day_outcome: 'not_studied' }),
    ], 7);
    expect(s.avgStudy).toBe(2);
  });

  it('nothing measurable yields null, never 0', () => {
    const s = computeSummary([
      row({ study_duration: 0, day_outcome: 'studied' }),
      row({ study_duration: 0, day_outcome: 'partial' }),
    ], 7);
    expect(s.avgStudy).toBeNull();
  });

  it('no reports at all yields null — avg([]) === 0 is the original sin', () => {
    expect(computeSummary([], 7).avgStudy).toBeNull();
  });
});

describe('we never flag a number we do not have', () => {
  it('the low-hours red flag cannot fire on an unknown average', () => {
    const s = computeSummary([
      row({ study_duration: 0, day_outcome: 'studied' }),
      row({ study_duration: 0, day_outcome: 'partial' }),
    ], 7);
    expect(s.avgStudy).toBeNull();
    expect(s.redFlags.join(' ')).not.toMatch(/Avg study below/);
  });

  it('it still fires on a genuinely low measured average', () => {
    const s = computeSummary([
      row({ study_duration: 1, day_outcome: 'studied' }),
      row({ study_duration: 1, day_outcome: 'studied' }),
    ], 7);
    expect(s.redFlags.join(' ')).toMatch(/Avg study below/);
  });
});

describe('one average, one place', () => {
  it('the buddy trends page no longer computes its own', () => {
    // A FIFTH duplicate: reps.reduce(...) / reps.length, dividing known hours
    // by EVERY logged day including unmeasured ones. The parked branch found
    // and fixed a fourth; this is the next one along.
    const s = readFileSync(join(process.cwd(), 'src/app/buddy/(dashboard)/trends/page.tsx'), 'utf8');
    expect(s, 'must not re-implement the mean').not.toMatch(/reduce\(\(sum, r\) => sum \+ r\.study_duration, 0\) \/ reps\.length/);
    expect(s, 'must consume the shared authority').toContain('computeSummary');
  });

  it('surfaces render an unknown average as unknown, not as 0.0h', () => {
    const charts = readFileSync(join(process.cwd(), 'src/app/buddy/(dashboard)/trends/trends-charts.tsx'), 'utf8');
    expect(charts, 'a null average must not be printed as a number')
      .toMatch(/avgStudy\s*==\s*null|avgStudy\s*!==\s*null|avgStudy\s*\?\?/);
  });
});
