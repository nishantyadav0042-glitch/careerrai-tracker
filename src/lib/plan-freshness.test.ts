import { describe, it, expect } from 'vitest';
import { planStaleReason, type PlanFreshnessInput } from './plan-freshness';

const BUILT = '2026-07-29T10:00:00.000Z';
const base: PlanFreshnessInput = {
  completionCount: 0,
  routineCreatedAt: BUILT,
  generatedHours: 3,
  currentHours: 3,
  yesterdayReportUpdatedAt: null,
};

describe('the completed-work guard', () => {
  it('never rebuilds once anything is ticked, whatever else changed', () => {
    // The most important assertion in this file. Regenerating over completed
    // work erases what the student already did — the 14 July audit's bug.
    const everythingStale = {
      ...base,
      completionCount: 1,
      currentHours: 9,                                   // pace wildly different
      yesterdayReportUpdatedAt: '2026-07-29T18:00:00.000Z',  // reported long after
    };
    expect(planStaleReason(everythingStale)).toBeNull();
  });

  it('holds for many completions too', () => {
    expect(planStaleReason({ ...base, completionCount: 7, currentHours: 9 })).toBeNull();
  });
});

describe('checked in after the plan was built', () => {
  it('rebuilds when the report is newer than the plan', () => {
    expect(planStaleReason({ ...base, yesterdayReportUpdatedAt: '2026-07-29T10:00:01.000Z' }))
      .toBe('checked_in_after_build');
  });

  it('keeps the plan when the report came first', () => {
    // The ordinary path: check in, then the plan is generated with the answer
    // already in hand. Rebuilding here would be pure waste.
    expect(planStaleReason({ ...base, yesterdayReportUpdatedAt: '2026-07-29T09:59:59.000Z' }))
      .toBeNull();
  });

  it('keeps the plan on an identical timestamp', () => {
    // Equal means the report was available to the build. This is also the
    // guard against a rebuild loop: the regenerated row is stamped at write
    // time, so the next request sees plan >= report and stops.
    expect(planStaleReason({ ...base, yesterdayReportUpdatedAt: BUILT })).toBeNull();
  });

  it('does not rebuild a second time once the plan is newer', () => {
    // Simulates the request right after a regeneration: same report, but the
    // plan now carries a fresh created_at. Regression guard for the infinite
    // rebuild this rule would cause if created_at were left to the column
    // default on the upsert's UPDATE path.
    const reportAt = '2026-07-29T10:00:01.000Z';
    const afterRebuild = { ...base, routineCreatedAt: '2026-07-29T10:00:02.000Z', yesterdayReportUpdatedAt: reportAt };
    expect(planStaleReason(afterRebuild)).toBeNull();
  });

  it('keeps the plan when there is no report for yesterday', () => {
    expect(planStaleReason({ ...base, yesterdayReportUpdatedAt: null })).toBeNull();
    expect(planStaleReason({ ...base, yesterdayReportUpdatedAt: undefined })).toBeNull();
  });
});

describe('legacy and unparseable data default to keeping the plan', () => {
  it('keeps the plan when created_at is missing', () => {
    // Rows written before daily_routines.created_at existed. An unknown build
    // time must never be read as "rebuild it".
    expect(planStaleReason({ ...base, routineCreatedAt: null, yesterdayReportUpdatedAt: '2026-07-29T18:00:00.000Z' }))
      .toBeNull();
  });

  it('keeps the plan on garbage timestamps', () => {
    expect(planStaleReason({ ...base, routineCreatedAt: 'not-a-date', yesterdayReportUpdatedAt: '2026-07-29T18:00:00.000Z' })).toBeNull();
    expect(planStaleReason({ ...base, yesterdayReportUpdatedAt: 'not-a-date' })).toBeNull();
  });
});

describe('the student changed their own hours', () => {
  // This rule used to watch a date-derived pace, which moves on its own every
  // morning as the calendar advances — so it could tear down a plan mid-day
  // for a student who changed nothing. It now watches the number the plan is
  // actually built from, and that only moves when the student moves it.
  it('rebuilds when they raise their hours', () => {
    expect(planStaleReason({ ...base, currentHours: 5 })).toBe('hours_changed');
  });

  it('rebuilds on the smallest change the slider can make', () => {
    // Half-hour steps. A student who nudges 3 -> 3.5 asked for a different day
    // and should get one.
    expect(planStaleReason({ ...base, currentHours: 3.5 })).toBe('hours_changed');
    expect(planStaleReason({ ...base, currentHours: 2.5 })).toBe('hours_changed');
  });

  it('ignores float noise', () => {
    // The threshold exists only to absorb rounding, never to tolerate drift.
    expect(planStaleReason({ ...base, currentHours: 3.0000001 })).toBeNull();
  });

  it('needs both numbers to act', () => {
    expect(planStaleReason({ ...base, generatedHours: null, currentHours: 9 })).toBeNull();
    expect(planStaleReason({ ...base, currentHours: null })).toBeNull();
  });

  it('reports the hours change ahead of the check-in reason when both apply', () => {
    // Either answer rebuilds, so the distinction is only for telemetry — but it
    // should be stable rather than incidental.
    const both = { ...base, currentHours: 9, yesterdayReportUpdatedAt: '2026-07-29T18:00:00.000Z' };
    expect(planStaleReason(both)).toBe('hours_changed');
  });
});
