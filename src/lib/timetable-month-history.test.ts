import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { anchorToMonth, summariseMonth, detectShape, PLAN_WINDOW_DAYS } from './timetable-month';
import { DATED_WINDOW_DAYS, DATED_WINDOW_THRESHOLD } from './workbook-text';
import type { TimetableBlock } from './timetable';

const b = (over: Partial<TimetableBlock> = {}): TimetableBlock => ({
  day: null, date: null, dayIndex: null, start: null, end: null, allDay: false,
  section: null, topic: null, label: '', minutes: null, ...over,
} as TimetableBlock);

// Founder, 8 Aug: if a month is all we can do properly, limit it to a month and
// say so — and that month must be aligned with zero errors.

describe('one month, said the same way everywhere', () => {
  it('the ingest window and the plan window agree', () => {
    // Two different files decide "how much of a sheet is a month". If they
    // drift, we ingest 21 days and plan 31, and the last ten days of every
    // month quietly contain nothing.
    expect(DATED_WINDOW_DAYS).toBe(PLAN_WINDOW_DAYS);
    expect(DATED_WINDOW_THRESHOLD).toBeGreaterThan(DATED_WINDOW_DAYS);
  });

  it('the extraction prompt tells the model the same number', () => {
    const prompt = readFileSync('src/lib/timetable-extract.ts', 'utf8');
    expect(prompt).toContain('ONE MONTH AT A TIME');
    expect(prompt).toContain(`through ${DATED_WINDOW_DAYS} days later`);
    expect(prompt).toContain(`MORE than ${DATED_WINDOW_THRESHOLD} dated days`);
  });
});

describe('the month is written to permanent history', () => {
  it('every busy day becomes a coaching_sessions row', () => {
    // The upsert key is (student, date), so re-uploading the same month
    // refines those dates and uploading the next month adds to them. Before
    // this, one row per student meant month 2 erased month 1.
    const apply = readFileSync('src/lib/timetable-apply.ts', 'utf8');
    expect(apply).toContain("from('coaching_sessions')");
    expect(apply).toContain("onConflict: 'student_id,session_date'");
    // A failed history write must not fail the upload — the plan is already
    // aligned, and reporting a failure would be a lie to the student.
    expect(apply).toMatch(/if \(sessErr\) console\.error/);
  });

  it('what gets recorded is exactly what the summary counts', () => {
    const blocks = [
      b({ day: 0, section: 'QA', topic: 'Percentages', label: 'Arithmetic' }),
      b({ day: 3, section: 'VARC', topic: 'Reading Comprehension', label: 'RC' }),
    ];
    const cal = anchorToMonth(blocks, '2026-08-10');
    const busy = cal.filter((d) => d.topics.length > 0 || d.sections.length > 0);
    const summary = summariseMonth(cal, detectShape(blocks));
    // The number we write and the number we show the student are the same
    // number — otherwise the confirmation screen is describing a different
    // month than the one that was saved.
    expect(busy.length).toBe(summary.daysCovered);
  });
});
