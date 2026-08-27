import { describe, it, expect } from 'vitest';
import { computeWeeklyInsight, lastCompleteWeek, MIN_REAL_SECTIONS } from './weekly-insight';
import { studyDayString } from './study-day';

// ── A weekly review may not fill itself in ─────────────────────────────────
//
// The founder asked for eleven sections. The live cohort could not supply
// them: measured 27 Aug, the best-served student in production could fill
// SEVEN of eight measurable dimensions, and 825 of 876 could fill one or
// none. A fixed eleven-section report is therefore a machine for writing
// sentences nobody earned.
//
// These tests exist to keep that impossible. The load-bearing ones are the
// gates: given thin rows, sections must be ABSENT, not softened.

type Row = Record<string, unknown>;

/** A fake that answers per table and records which tables were read at all. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const touched: string[] = [];
  const admin = {
    from(table: string) {
      touched.push(table);
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, gte: () => q, lt: () => q,
        then: (r: (v: unknown) => unknown) =>
          Promise.resolve({ data: tables[table] ?? [], error: null }).then(r),
      };
      return q;
    },
  };
  return { admin, touched };
}

/** Monday of the last complete week, as the engine computes it. */
const WIN = lastCompleteWeek(new Date('2026-08-27T09:00:00Z'));
const day = (n: number) => {
  const d = new Date(`${WIN.start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const NOW = new Date('2026-08-27T09:00:00Z');

/** A week with enough of everything — the shape the gates must let through. */
function fullWeek() {
  const tasks = (ids: string[], section: string, topic: string) =>
    ids.map((id) => ({ id, section, topic }));
  return {
    daily_reports: [0, 1, 2, 3].map((n) => ({ report_date: day(n) })),
    daily_routines: [0, 1, 2, 3].map((n) => ({
      routine_date: day(n),
      tasks: [...tasks([`q${n}`], 'QA', 'Algebra'), ...tasks([`d${n}`], 'DILR', 'Arrangements')],
    })),
    routine_task_completions: [0, 1, 2, 3].flatMap((n) => [
      { routine_date: day(n), task_id: `q${n}`, confidence: 'green', completed_at: `${day(n)}T04:00:00Z` },
      { routine_date: day(n), task_id: `d${n}`, confidence: n < 2 ? 'red' : 'green', completed_at: `${day(n)}T05:00:00Z` },
    ]),
    video_sessions: [],
  } as Record<string, Row[]>;
}

describe('the week under review is finished, not in progress', () => {
  it('is seven days, Monday to Sunday', () => {
    const w = lastCompleteWeek(NOW);
    expect(new Date(`${w.start}T12:00:00Z`).getUTCDay()).toBe(1); // Monday
    expect(new Date(`${w.end}T12:00:00Z`).getUTCDay()).toBe(0);   // Sunday
    const span = (Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / 86_400_000;
    expect(span).toBe(6);
  });

  it('has already ENDED — a review that changes while you live it teaches distrust', () => {
    const w = lastCompleteWeek(NOW);
    expect(w.end < studyDayString(NOW)).toBe(true);
  });

  it('waits for the STUDY day to end, not the calendar day', () => {
    // The study day rolls at 05:30 IST. At 02:00 IST on Monday a student is
    // still finishing Sunday — the last day of the week the calendar has just
    // ended. Reviewing it then would present an unfinished week as finished,
    // every Monday, for five and a half hours.
    const mondayLate = new Date('2026-08-23T20:30:00Z');  // 02:00 IST Mon 24th
    const mondayMorning = new Date('2026-08-24T01:00:00Z'); // 06:30 IST Mon 24th
    const before = lastCompleteWeek(mondayLate);
    const after = lastCompleteWeek(mondayMorning);
    expect(
      before.end < after.end,
      'The window advanced at IST midnight instead of at the 05:30 study-day rollover, so Sunday was reviewed while it was still being lived.',
    ).toBe(true);
    expect(after.end).toBe('2026-08-23'); // the Sunday that has now finished
    expect(before.end).toBe('2026-08-16');
  });

  it('is the same window all week — Tuesday and Friday get the same answer', () => {
    const tue = lastCompleteWeek(new Date('2026-08-25T04:00:00Z'));
    const fri = lastCompleteWeek(new Date('2026-08-28T19:00:00Z'));
    expect(tue).toEqual(fri);
  });

  it('rolls over on Monday, not mid-week', () => {
    // Sunday night and Monday morning must land on DIFFERENT weeks.
    const sun = lastCompleteWeek(new Date('2026-08-23T18:00:00Z'));
    const mon = lastCompleteWeek(new Date('2026-08-24T02:00:00Z'));
    expect(mon.start > sun.start).toBe(true);
  });
});

describe('a thin week produces NO review, not a padded one', () => {
  it('a student with nothing gets the honest empty state', async () => {
    const { admin } = fakeAdmin({});
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    expect(out.status).toBe('not_enough_data');
    if (out.status !== 'not_enough_data') throw new Error('unreachable');
    expect(out.sectionsFound).toBe(0);
  });

  it('the empty state makes no claim ABOUT THE STUDENT', async () => {
    // This is the "top marks" lesson applied to absence: when we know nothing,
    // the failure mode is inventing a characterisation ("you had a slow week",
    // "you lost momentum"). We know their rows are empty. We do not know that.
    const { admin } = fakeAdmin({});
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'not_enough_data') throw new Error('unreachable');
    expect(out.oneThingThatWouldHelp).not.toMatch(/you (didn't|did not|failed|missed|lost|slipped)/i);
    expect(out.oneThingThatWouldHelp).toMatch(/log one day/i);
  });

  it('two real sections is still not a review', async () => {
    // consistency + comparison only: no plan, no completions.
    const { admin } = fakeAdmin({
      daily_reports: [{ report_date: day(0) }, { report_date: day(1) }],
    });
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    expect(out.status).toBe('not_enough_data');
    if (out.status !== 'not_enough_data') throw new Error('unreachable');
    expect(out.sectionsFound).toBeLessThan(MIN_REAL_SECTIONS);
  });

  it('ONE logged day never becomes a consistency observation', async () => {
    // The first version of this test was VACUOUS and a mutation caught it:
    // with a single report and nothing else, the review never reaches `ready`,
    // so an assertion hidden behind `if (out.status === 'ready')` never ran and
    // the test passed with the gate removed. The fixture now supplies enough
    // OTHER evidence to reach `ready`, so the only thing being measured is
    // whether one logged day is allowed to become a claim about consistency.
    const t = fullWeek();
    t.daily_reports = [{ report_date: day(0) }];
    const { admin } = fakeAdmin(t);
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('fixture no longer reaches ready — the test would be vacuous again');
    expect(
      out.sections.map((s) => s.id),
      'One logged day is not a pattern. Calling it one is the review filling itself in.',
    ).not.toContain('consistency');
  });

  it('two confidence marks never become "your strongest area"', async () => {
    const t = fullWeek();
    t.routine_task_completions = t.routine_task_completions.slice(0, 2);
    const { admin } = fakeAdmin(t);
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status === 'ready') {
      expect(out.sections.map((s) => s.id)).not.toContain('strongest');
      expect(out.sections.map((s) => s.id)).not.toContain('slipping');
    }
  });

  it('a mentor section appears only when a session actually happened', async () => {
    const t = fullWeek();
    t.video_sessions = [{ session_status: 'cancelled', scheduled_at: `${day(2)}T10:00:00Z` }];
    const { admin } = fakeAdmin(t);
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('expected ready');
    expect(out.sections.map((s) => s.id)).not.toContain('buddy');
  });
});

describe('a real week produces a review made of the student\'s own numbers', () => {
  it('renders, with a headline and at least the minimum', async () => {
    const { admin } = fakeAdmin(fullWeek());
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') throw new Error('unreachable');
    expect(out.sections.length).toBeGreaterThanOrEqual(MIN_REAL_SECTIONS);
    expect(out.headline.length).toBeGreaterThan(0);
  });

  it('the numbers are the rows — 4 logged days, 8 planned, 8 done', async () => {
    const { admin } = fakeAdmin(fullWeek());
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('unreachable');
    const text = (id: string) => out.sections.find((s) => s.id === id)?.text ?? '';
    expect(text('consistency')).toContain("4 of the week's 7 days");
    expect(text('planned_vs_actual')).toContain('8 tasks');
    expect(text('planned_vs_actual')).toContain('finished 8');
  });

  it('every section can be traced back to the rows that produced it', async () => {
    const { admin } = fakeAdmin(fullWeek());
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('unreachable');
    for (const s of out.sections) {
      expect(s.evidence, `section ${s.id} has no evidence`).toBeTruthy();
    }
  });

  it('names the section that fought back, and pairs it with a smaller next step', async () => {
    const { admin } = fakeAdmin(fullWeek());
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('unreachable');
    const slip = out.sections.find((s) => s.id === 'slipping');
    expect(slip?.text).toContain('DILR');
    const next = out.sections.find((s) => s.id === 'next_week');
    expect(next?.text).toContain('DILR');
    // Never "do more" — the confidence doctrine.
    expect(next?.text).not.toMatch(/more hours|work harder|do more/i);
  });

  it('the recommendation is DERIVED — it never appears with nothing behind it', async () => {
    const { admin } = fakeAdmin(fullWeek());
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('unreachable');
    const next = out.sections.find((s) => s.id === 'next_week');
    expect(next?.evidence).toMatch(/derived from the \w+ section/);
  });

  it('no sentence runs past a readable length', async () => {
    const { admin } = fakeAdmin(fullWeek());
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status !== 'ready') throw new Error('unreachable');
    for (const s of out.sections) expect(s.text.length).toBeLessThanOrEqual(150);
  });
});

describe('the measurement trap that cost 315 false positives', () => {
  it('topic movement NEVER reads topic_coverage', async () => {
    // 315 of 423 active students looked like they had "moved topics" by
    // topic_coverage.updated_at. The timestamps showed ~50 rows per student
    // inside one minute: onboarding writing the syllabus, not a week of work.
    const { admin, touched } = fakeAdmin(fullWeek());
    await computeWeeklyInsight(admin, 'stu-1', NOW);
    expect(
      touched,
      'The engine read topic_coverage. Its updated_at is an onboarding artifact, and using it as weekly movement congratulates students for work they did not do.',
    ).not.toContain('topic_coverage');
  });

  it('movement is counted from completed tasks, and needs more than one', async () => {
    const t = fullWeek();
    t.routine_task_completions = [
      { routine_date: day(0), task_id: 'q0', confidence: 'green', completed_at: `${day(0)}T04:00:00Z` },
    ];
    const { admin } = fakeAdmin(t);
    const out = await computeWeeklyInsight(admin, 'stu-1', NOW);
    if (out.status === 'ready') expect(out.sections.map((s) => s.id)).not.toContain('topic_movement');
  });
});
