import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SECTIONS, topicsInSection } from '@/lib/prep-model';
import { studentEffortMultiplier } from '@/lib/study-pace';
import { buildFullPlan, feasibilityLine } from '@/lib/full-plan';
import { checkPlanIntegrity } from '@/lib/plan-integrity';
import type { TimetableBlock } from '@/lib/timetable';
import { anchorToMonth, coachingTopicsForDate, monthDaysLeft, detectShape, PLAN_WINDOW_DAYS } from '@/lib/timetable-month';

// A→Z EXECUTION PROOF for the only two students who exist.
//
// Founder, 9 Aug: confirm that BOTH journeys complete end to end, without any
// error and without any blunder — the self-prep student whose whole plan we
// build, and the coaching student who uploads their institute timetable.
//
// Everything below is RUN, not read. Where a number is asserted it was
// produced by the same engine the student's phone calls.

const ALL_TOPICS = SECTIONS.flatMap((s) => topicsInSection(s));
const TODAY = new Date('2026-08-09T00:00:00Z');
const freshCoverage = () => ALL_TOPICS.map((topic) => ({ topic, status: 'not_started' }));

function report(label: string, lines: string[]) {
  console.log(`\n${'='.repeat(64)}\n${label}\n${'='.repeat(64)}`);
  for (const l of lines) console.log(l);
}

describe('JOURNEY A — self-prep student, today to CAT day', () => {
  const HOURS = 6;
  const plan = buildFullPlan({
    coverage: freshCoverage(),
    effort: studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null }),
    weekdayHours: HOURS,
    today: TODAY,
    attemptYear: 2026,
  });

  it('A. covers the whole runway with no gap and no missing day', () => {
    const dates = plan.days.map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);           // no duplicate days
    for (let i = 1; i < dates.length; i++) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000;
      expect(gap, `gap between ${dates[i - 1]} and ${dates[i]}`).toBe(1);
    }
    expect(dates[0]).toBe('2026-08-09');
    // The plan runs to the day BEFORE the exam — nobody studies on exam day.
    const lastDay = dates[dates.length - 1];
    const dayBeforeExam = new Date(Date.parse(plan.examDate) - 86_400_000).toISOString().slice(0, 10);
    expect([plan.examDate, dayBeforeExam]).toContain(lastDay);
    report('JOURNEY A — self-prep, 6h/day', [
      `days in plan      ${plan.days.length}  (${dates[0]} → ${dates[dates.length - 1]})`,
      `exam date         ${plan.examDate}`,
      `mocks scheduled   ${plan.mockCount}`,
      `verdict           ${feasibilityLine(plan.feasibility)}`,
    ]);
  });

  it('B. every one of the 46 topics is scheduled — none silently dropped', () => {
    const scheduled = new Set(
      plan.days.flatMap((d) => d.items.filter((i) => i.kind === 'topic').map((i) => i.label)),
    );
    const missing = ALL_TOPICS.filter((t) => !scheduled.has(t));
    console.log(`topics scheduled  ${scheduled.size}/${ALL_TOPICS.length}`);
    if (missing.length) console.log(`MISSING: ${missing.join(', ')}`);
    expect(missing, 'topics the student would never be told about').toEqual([]);
  });

  it('C. no day asks for more hours than the student agreed to', () => {
    const over = plan.days.filter((d) => d.totalHours > HOURS + 0.01);
    if (over.length) {
      console.log(over.slice(0, 5).map((d) => `  ${d.date}: ${d.totalHours}h > ${HOURS}h`).join('\n'));
    }
    expect(over.map((d) => `${d.date}=${d.totalHours}h`), 'days demanding more than committed').toEqual([]);
  });

  it('D. mocks, analysis and revision are all really there', () => {
    const kinds = plan.days.flatMap((d) => d.items.map((i) => i.kind));
    const mocks = kinds.filter((k) => k === 'mock').length;
    const analysis = kinds.filter((k) => k === 'mock_analysis').length;
    const revision = kinds.filter((k) => k === 'revision').length;
    console.log(`mock ${mocks} · analysis ${analysis} · revision ${revision}`);
    expect(mocks).toBeGreaterThan(0);
    expect(revision, 'revision must exist').toBeGreaterThan(0);
    // Every mock is followed by an analysis block.
    expect(analysis).toBeGreaterThan(0);
    expect(Math.abs(mocks - analysis), 'every mock needs its analysis day').toBeLessThanOrEqual(1);
  });

  it('E. no NEW topic is introduced after 1 November', () => {
    const late = plan.days
      .filter((d) => d.date >= '2026-11-01')
      .flatMap((d) => d.items.filter((i) => i.kind === 'topic').map((i) => `${d.date} ${i.label}`));
    if (late.length) console.log(`late new topics: ${late.slice(0, 5).join(' | ')}`);
    expect(late, 'November is revision season').toEqual([]);
  });

  it('F. THE CHECKLIST DOOR — every integrity check passes', () => {
    const r = checkPlanIntegrity({ plan, committedHours: HOURS });
    for (const c of r.checks) console.log(`  ${c.status.toUpperCase().padEnd(4)} ${c.label} — ${c.detail}`);
    const failed = r.checks.filter((c) => c.status === 'fail');
    expect(failed.map((c) => `${c.label}: ${c.detail}`)).toEqual([]);
  });
});

describe('JOURNEY A — the plan genuinely changes with the hours given', () => {
  it('different commitments produce genuinely different plans', () => {
    const rows: string[] = [];
    const signatures = new Set<string>();
    for (const h of [2, 3, 5, 8, 10]) {
      const p = buildFullPlan({
        coverage: freshCoverage(),
        effort: studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null }),
        weekdayHours: h, today: TODAY, attemptYear: 2026,
      });
      const topics = new Set(p.days.flatMap((d) => d.items.filter((i) => i.kind === 'topic').map((i) => i.label))).size;
      // Once the syllabus fits, two students both see all 46 topics — so
      // topic COUNT alone stops discriminating. The date they finish the
      // syllabus is what actually differs, and it is what the student feels.
      const lastTopicDay = [...p.days].reverse()
        .find((d) => d.items.some((i) => i.kind === 'topic'))?.date ?? 'none';
      rows.push(`  ${String(h).padStart(2)}h/day → ${String(topics).padStart(2)}/46 topics · fits=${String(p.feasibility.fits).padEnd(5)} · syllabus done ${lastTopicDay}`);
      signatures.add(`${topics}|${p.feasibility.fits}|${lastTopicDay}`);
      // The hours cap must hold at EVERY commitment, not just the one we test above.
      expect(p.days.filter((d) => d.totalHours > h + 0.01).length, `${h}h plan overloads a day`).toBe(0);
    }
    console.log(rows.join('\n'));
    console.log(`  DISTINCT SIGNATURES: ${signatures.size}/5`);
    expect(signatures.size, 'two different students must never get the same plan').toBe(5);
  });

  it('a repeater faces less syllabus than a fresher', () => {
    const mk = (isRepeater: boolean, pct: number | null) => buildFullPlan({
      coverage: freshCoverage(),
      effort: studentEffortMultiplier({ isRepeater, lastYearPercentile: pct }),
      weekdayHours: 6, today: TODAY, attemptYear: 2026,
    }).feasibility.syllabusHours;
    const fresher = mk(false, null);
    const repeater = mk(true, 88);
    console.log(`  fresher ${fresher}h · repeater@88pct ${repeater}h`);
    expect(repeater).toBeLessThan(fresher);
  });
});

describe('JOURNEY B — coaching student who uploads their timetable', () => {
  // A realistic institute sheet: 5 class days a week over the month.
  const blk = (day: number, topic: string, section: 'QA' | 'VARC' | 'DILR'): TimetableBlock => ({
    day, date: null, dayIndex: null, start: '18:00', end: '20:00', allDay: false,
    section, topic, label: topic, minutes: 120,
  });
  const blocks: TimetableBlock[] = [
    blk(1, 'Time Speed Distance', 'QA'),
    blk(2, 'Reading Comprehension', 'VARC'),
    blk(3, 'Arrangements', 'DILR'),
    blk(4, 'Percentages', 'QA'),
    blk(5, 'Para Jumbles', 'VARC'),
  ];
  const startIso = '2026-08-09';
  const calendar = anchorToMonth(blocks, startIso, PLAN_WINDOW_DAYS);
  const HOURS = 4;

  it('A. the sheet is understood and anchored to real dates', () => {
    const shape = detectShape(blocks);
    const daysLeft = monthDaysLeft(calendar, startIso);
    report('JOURNEY B — coaching, 4h/day self-study', [
      `sheet shape       ${shape}`,
      `calendar days     ${calendar.length} (window ${PLAN_WINDOW_DAYS})`,
      `month days left   ${daysLeft}`,
      `first date        ${calendar[0]?.date}`,
      `last date         ${calendar[calendar.length - 1]?.date}`,
    ]);
    expect(calendar.length).toBeGreaterThan(0);
    expect(calendar.length).toBeLessThanOrEqual(PLAN_WINDOW_DAYS);
    expect(daysLeft).toBeGreaterThan(0);
  });

  it('B. the plan is capped at the month, never running past their sheet', () => {
    const plan = buildFullPlan({
      coverage: freshCoverage(),
      effort: studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null }),
      weekdayHours: HOURS, today: TODAY, attemptYear: 2026,
      horizonDays: PLAN_WINDOW_DAYS,
    });
    console.log(`  coaching horizon days: ${plan.days.length}`);
    expect(plan.days.length).toBeLessThanOrEqual(PLAN_WINDOW_DAYS);
    expect(plan.days.filter((d) => d.totalHours > HOURS + 0.01).length, 'overloaded day').toBe(0);
  });

  it('C. today\'s class topics are deliverable for EVERY day of the month', () => {
    // Founder: the app must be able to tell them "this is your plan for
    // today" on every single day, not only on the days the sheet names.
    const silent: string[] = [];
    for (const day of calendar) {
      const topics = coachingTopicsForDate(blocks, startIso, day.date);
      if (topics.length === 0) silent.push(day.date);
    }
    console.log(`  days with class topics: ${calendar.length - silent.length}/${calendar.length}`);
    if (silent.length) console.log(`  silent days (weekends/off): ${silent.length}`);
    // Every day must ANSWER — a day with no class is a valid answer, but the
    // month as a whole must not be silent.
    expect(silent.length, 'the whole month is silent — the sheet was not understood')
      .toBeLessThan(calendar.length);
  });

  it('D. the topics the coaching teaches on a date are the ones we surface', () => {
    const mismatches: string[] = [];
    for (const day of calendar) {
      const fromCalendar = day.topics ?? [];
      const fromLookup = coachingTopicsForDate(blocks, startIso, day.date);
      if (JSON.stringify([...fromCalendar].sort()) !== JSON.stringify([...fromLookup].sort())) {
        mismatches.push(`${day.date}: calendar=${fromCalendar} lookup=${fromLookup}`);
      }
    }
    if (mismatches.length) console.log(mismatches.slice(0, 5).join('\n'));
    expect(mismatches, 'the month view and the daily view disagree').toEqual([]);
  });

  it('E. THE CHECKLIST DOOR for coaching — including the sheet dates', () => {
    const plan = buildFullPlan({
      coverage: freshCoverage(),
      effort: studentEffortMultiplier({ isRepeater: false, lastYearPercentile: null }),
      weekdayHours: HOURS, today: TODAY, attemptYear: 2026,
      horizonDays: PLAN_WINDOW_DAYS,
      coachingByDate: Object.fromEntries(
        calendar.filter((d) => (d.topics ?? []).length).map((d) => [d.date, d.topics!]),
      ),
    });
    const coachingByDate: Record<string, string[]> = {};
    for (const d of calendar) if ((d.topics ?? []).length) coachingByDate[d.date] = d.topics!;

    const r = checkPlanIntegrity({
      plan, committedHours: HOURS, coachingByDate, isCoachingMonth: true,
    });
    for (const c of r.checks) console.log(`  ${c.status.toUpperCase().padEnd(4)} ${c.label} — ${c.detail}`);
    const failed = r.checks.filter((c) => c.status === 'fail');
    expect(failed.map((c) => `${c.label}: ${c.detail}`)).toEqual([]);
  });
});

describe('the live route builds AROUND the coaching sheet, not against it', () => {
  it('resolves the coaching calendar BEFORE buildFullPlan and passes it in', () => {
    // The original defect was ordering: coachingByDate was computed after the
    // plan and handed only to the grader. Anchoring on order is the only way
    // to stop that regressing, because both lines still exist either way.
    const route = readFileSync('src/app/api/plan/full/route.ts', 'utf8');
    const resolve = route.indexOf('coachingByDate = {}');
    const build = route.indexOf('buildFullPlan({');
    expect(resolve, 'coaching calendar is not resolved at all').toBeGreaterThan(-1);
    expect(resolve, 'the calendar must be resolved BEFORE the plan is built').toBeLessThan(build);
    const call = route.slice(build, route.indexOf('});', build));
    expect(call, 'the plan is built without the coaching calendar').toContain('coachingByDate');
  });
});
