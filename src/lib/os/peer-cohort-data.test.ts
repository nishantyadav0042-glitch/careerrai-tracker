import { describe, it, expect } from 'vitest';
import { buildPeerRows, daysToExamFrom } from './peer-cohort-data';

// The reshaping layer has exactly two ways to lie, and both are quiet:
// counting log ROWS instead of log DAYS (inflates everyone's consistency), and
// averaging zero-hour rest days into "hours studied" (deflates everyone's
// effort). Both would produce plausible-looking peer numbers that are wrong.

const NOW = new Date('2026-08-12T12:00:00Z');

const profile = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  attempt_year: 2026,
  study_target_hours: 5,
  self_reported_weakest_section: 'DILR',
  syllabus_target_date: null,
  ...over,
}) as never;

describe('log rows become peer rows without inventing anything', () => {
  it('counts distinct DAYS, not rows — a double-logged day is one day', () => {
    const rows = buildPeerRows(
      [profile('a')],
      [
        { student_id: 'a', report_date: '2026-08-11', study_duration: 3, topics_covered: ['QA'] },
        { student_id: 'a', report_date: '2026-08-11', study_duration: 2, topics_covered: ['QA'] },
        { student_id: 'a', report_date: '2026-08-10', study_duration: 4, topics_covered: null },
      ],
      NOW,
    );
    expect(rows[0].loggedDaysLast7).toBe(2);
  });

  it('excludes zero-hour rest days from the hours average', () => {
    const rows = buildPeerRows(
      [profile('a')],
      [
        { student_id: 'a', report_date: '2026-08-11', study_duration: 4, topics_covered: [] },
        { student_id: 'a', report_date: '2026-08-10', study_duration: 0, topics_covered: [] },
      ],
      NOW,
    );
    // 4, not 2 — an honest rest day is a real log but not evidence about duration.
    expect(rows[0].observedAvgHours).toBe(4);
  });

  it('reports null hours rather than 0 for a student who never logged', () => {
    const rows = buildPeerRows([profile('a')], [], NOW);
    expect(rows[0].observedAvgHours).toBeNull();
    expect(rows[0].loggedToday).toBe(false);
    expect(rows[0].loggedDaysLast7).toBe(0);
  });

  it("dedupes today's sections and keeps them per-student", () => {
    const today = new Date(NOW.getTime());
    const key = new Date(today.getTime() + 5.5 * 3600_000 - 3 * 3600_000).toISOString().slice(0, 10);
    const rows = buildPeerRows(
      [profile('a'), profile('b')],
      [
        { student_id: 'a', report_date: key, study_duration: 2, topics_covered: ['QA', 'QA', 'VARC'] },
        { student_id: 'b', report_date: key, study_duration: 2, topics_covered: ['DILR'] },
      ],
      NOW,
    );
    expect(rows[0].sectionsToday.sort()).toEqual(['QA', 'VARC']);
    expect(rows[1].sectionsToday).toEqual(['DILR']);
    expect(rows[0].loggedToday).toBe(true);
  });

  it('never attributes one student_s logs to another', () => {
    const rows = buildPeerRows(
      [profile('a'), profile('b')],
      [{ student_id: 'a', report_date: '2026-08-11', study_duration: 9, topics_covered: ['QA'] }],
      NOW,
    );
    expect(rows[1].observedAvgHours).toBeNull();
    expect(rows[1].loggedDaysLast7).toBe(0);
  });
});

describe('days to exam is derived, never defaulted to "this November"', () => {
  it('is null when the student has not chosen a target', () => {
    expect(daysToExamFrom(null, NOW)).toBeNull();
  });

  it('counts to the CAT of the cycle the target implies', () => {
    // A 2026 syllabus target maps to CAT 2026 (last Sunday of November).
    const d = daysToExamFrom('2026-11-08', NOW);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('maps a 2027 target to the 2027 exam, not the next November', () => {
    const d = daysToExamFrom('2027-11-07', NOW);
    expect(d).toBeGreaterThan(400);
  });

  it('returns null rather than a negative countdown for a past cycle', () => {
    expect(daysToExamFrom('2020-11-08', NOW)).toBeNull();
  });

  it('ignores an unparseable date instead of throwing', () => {
    expect(daysToExamFrom('not-a-date', NOW)).toBeNull();
  });
});
