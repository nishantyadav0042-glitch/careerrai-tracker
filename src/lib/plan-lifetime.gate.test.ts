import { describe, it, expect } from 'vitest';
import { buildDayPlan, type DayPlanInput } from './plan-day';
import { TOPICS_BY_SECTION } from './day-topics';
import { applyConfidenceSignal } from './topic-selector';
import { catExamDate } from './exam-calendar';
import { studyDayString } from './study-day';
import { isCovered, type CoverageStatus } from './coverage-status';
import type { Stage } from './routine-engine';

// ── THE LIFETIME GATE ───────────────────────────────────────────────────────
//
// Founder, 14 Aug, on his way to bed: if he picks ANY profile at random, builds
// its full study plan and follows it, will he hit no problem all the way to CAT
// day? He wants one word back. The only honest way to earn that word is to
// actually run every profile for every day of its life.
//
// WHY THE EXISTING TESTS WERE NOT ENOUGH. plan-integrity pins invariants on a
// SINGLE day. topic-reachability proves every topic can be picked. The
// equivalence test proves both writers agree. None of them answers the
// question actually asked, which is about a JOURNEY: does the plan hold on day
// 1, day 47, and day 107, for a repeater on 2 hours who logs everything, as
// the calendar crosses foundation → intensive → revision underneath them?
//
// A defect that needs 60 days of accumulated state to appear is invisible to
// every single-day test in this repo, and it is exactly the defect a student
// hits — because a student IS the accumulated state.
//
// WHAT THIS RUNS. The real production assembly (buildDayPlan — the one both
// daily_routines writers call), day by day, from signup to CAT day, with
// coverage advancing exactly as the app advances it when a student ticks a
// task. Not a model of the planner. The planner.

const SECTIONS = ['VARC', 'DILR', 'QA'] as const;
const ALL_TOPICS = SECTIONS.flatMap((s) => TOPICS_BY_SECTION[s]);
const EXAM = catExamDate(2026);                        // last Sunday of November
const EXAM_ISO = studyDayString(EXAM);

/** Every day from `startIso` to CAT day, inclusive. */
function daysTo(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let t = Date.parse(startIso + 'T00:00:00Z');
  const end = Date.parse(endIso + 'T00:00:00Z');
  while (t <= end) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86_400_000; }
  return out;
}

interface Profile {
  name: string;
  wp?: boolean;
  repeater?: boolean;
  weekday: number;
  weekend?: number;
  weakest?: string | null;
  stage?: Stage | null;
  targetDate?: string | null;
  planSource?: string;
  startIso?: string;
  /** How diligently they log: 1 = every task, 0.5 = half, 0 = never. */
  diligence?: number;
}

/**
 * The profile matrix. Deliberately includes the ugly corners rather than a
 * tidy sample: the 0.5h floor and the 16h ceiling (both real slider bounds),
 * a student with NO finish date, one whose date has already passed, a
 * never-logs student, and every archetype crossed with every stage.
 */
const PROFILES: Profile[] = [
  { name: 'first-attempt 8h', weekday: 8 },
  { name: 'first-attempt 2h', weekday: 2 },
  { name: 'first-attempt floor 0.5h', weekday: 0.5, weekend: 0.5 },
  { name: 'first-attempt ceiling 16h', weekday: 16, weekend: 16 },
  { name: 'repeater 6h', repeater: true, weekday: 6 },
  { name: 'repeater 1.5h', repeater: true, weekday: 1.5 },
  { name: 'working professional 3h', wp: true, weekday: 3, weekend: 8 },
  { name: 'working professional 6h+', wp: true, weekday: 6, weekend: 10 },
  { name: 'WP repeater 2h', wp: true, repeater: true, weekday: 2, weekend: 6 },
  { name: 'stage=not_started 4h', weekday: 4, stage: 'not_started' },
  { name: 'stage=concepts 4h', weekday: 4, stage: 'concepts' },
  { name: 'stage=questions 5h', weekday: 5, stage: 'questions' },
  { name: 'stage=sectionals 5h', weekday: 5, stage: 'sectionals' },
  { name: 'stage=mocks 5h', weekday: 5, stage: 'mocks' },
  { name: 'weakest=VARC 7h', weekday: 7, weakest: 'VARC' },
  { name: 'weakest=QA 7h', weekday: 7, weakest: 'QA' },
  { name: 'weakest unknown (null) 7h', weekday: 7, weakest: null },
  { name: 'no finish date 6h', weekday: 6, targetDate: null },
  { name: 'finish date already past 6h', weekday: 6, targetDate: '2026-07-01' },
  { name: 'finish date after CAT 6h', weekday: 6, targetDate: '2027-03-01' },
  { name: 'asymmetric 1h weekday / 12h weekend', weekday: 1, weekend: 12 },
  { name: 'never logs anything 5h', weekday: 5, diligence: 0 },
  { name: 'logs half 5h', weekday: 5, diligence: 0.5 },
  { name: 'starts in October 4h', weekday: 4, startIso: '2026-10-01' },
  { name: 'starts in November 4h', weekday: 4, startIso: '2026-11-05' },
  { name: 'coaching plan_source, no sheet 6h', weekday: 6, planSource: 'coaching' },
];

interface DayReport {
  date: string;
  tasks: { id: string; section: string; topic: string | null; estMinutes: number }[];
  estMinutes: number;
  hoursToday: number;
  phase: string;
}

interface Violation { profile: string; date: string; rule: string; detail: string }

/**
 * Run one profile from its start date to CAT day.
 *
 * Coverage advances through applyConfidenceSignal — the same function the
 * complete-task route calls — so the state the planner sees on day N is the
 * state the database would actually hold on day N.
 */
function live(p: Profile): { days: DayReport[]; violations: Violation[]; touched: Set<string>; finalCoverage: Map<string, CoverageStatus> } {
  const startIso = p.startIso ?? '2026-08-14';
  const coverage = new Map<string, CoverageStatus>();
  const lastPracticedDay = new Map<string, number>();
  const lastPlannedDay = new Map<string, number>();
  const touched = new Set<string>();
  const days: DayReport[] = [];
  const violations: Violation[] = [];
  const diligence = p.diligence ?? 1;
  const dates = daysTo(startIso, EXAM_ISO);

  for (let i = 0; i < dates.length; i++) {
    const today = dates[i];
    const now = new Date(`${today}T09:00:00Z`);

    const coverageRows = SECTIONS.flatMap((s) =>
      TOPICS_BY_SECTION[s].map((topic) => ({
        section: s, topic, status: coverage.get(topic) ?? 'not_started', is_priority: false,
      })));

    const daysSinceLastPracticedByTopic: Record<string, number | null> = {};
    const daysSincePlannedByTopic: Record<string, number | null> = {};
    for (const topic of ALL_TOPICS) {
      const lp = lastPracticedDay.get(topic);
      const pl = lastPlannedDay.get(topic);
      daysSinceLastPracticedByTopic[topic] = lp == null ? null : i - lp;
      daysSincePlannedByTopic[topic] = pl == null ? null : i - pl;
    }

    const input: DayPlanInput = {
      profile: {
        is_working_professional: !!p.wp,
        is_repeater: !!p.repeater,
        target_percentile: 95,
        hours_available: p.weekday,
        study_target_hours: String(p.weekday),
        weekend_hours_available: p.weekend ?? p.weekday,
        syllabus_target_date: p.targetDate === undefined ? '2026-10-15' : p.targetDate,
        self_reported_weakest_section: p.weakest === undefined ? 'DILR' : p.weakest,
        self_reported_strongest_section: 'QA',
        self_reported_weak_topic: null,
        baseline_varc: null, baseline_dilr: null, baseline_qa: null,
        attempt_year: 2026,
        current_stage: p.stage ?? null,
        start_with: null,
        plan_source: p.planSource ?? 'careerrai',
      },
      coverageRows,
      debriefRows: [],
      timetableRow: null,
      history: {
        recentTopics: [], daysSinceLastPracticedByTopic, daysSincePlannedByTopic,
        timesPracticedByTopic: {}, postponedTopics: [], yesterday: null,
        yesterdayUnfinishedTopics: [], completedTasks: 0, plannedTasks: 0, planDays: i,
        daysSinceLastPracticed: { VARC: null, DILR: null, QA: null },
      } as unknown as DayPlanInput['history'],
      today,
      now,
    };

    let plan;
    try {
      plan = buildDayPlan(input);
    } catch (e) {
      violations.push({ profile: p.name, date: today, rule: 'THREW', detail: String(e) });
      continue;
    }

    const committed = Math.round(plan.hoursToday * 60);

    // ── INVARIANTS, EVERY SINGLE DAY ──────────────────────────────────────
    if (plan.tasks.length === 0) {
      violations.push({ profile: p.name, date: today, rule: 'EMPTY_DAY', detail: 'no tasks' });
    }
    if (!Number.isFinite(plan.estMinutes) || plan.estMinutes <= 0) {
      violations.push({ profile: p.name, date: today, rule: 'BAD_MINUTES', detail: `estMinutes=${plan.estMinutes}` });
    }
    if (plan.estMinutes !== committed) {
      violations.push({ profile: p.name, date: today, rule: 'BUDGET_MISMATCH', detail: `planned ${plan.estMinutes} vs committed ${committed}` });
    }
    const sum = plan.tasks.reduce((s, t) => s + t.estMinutes, 0);
    if (sum !== plan.estMinutes) {
      violations.push({ profile: p.name, date: today, rule: 'SUM_MISMATCH', detail: `tasks sum ${sum} vs estMinutes ${plan.estMinutes}` });
    }
    const ids = plan.tasks.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      violations.push({ profile: p.name, date: today, rule: 'DUP_TASK_ID', detail: ids.join(',') });
    }
    const topics = plan.tasks.map((t) => t.topic).filter(Boolean) as string[];
    if (new Set(topics).size !== topics.length) {
      violations.push({ profile: p.name, date: today, rule: 'DUP_TOPIC', detail: topics.join(',') });
    }
    for (const t of plan.tasks) {
      if (!Number.isFinite(t.estMinutes) || t.estMinutes <= 0) {
        violations.push({ profile: p.name, date: today, rule: 'BAD_TASK_MINUTES', detail: `${t.label}=${t.estMinutes}` });
      }
      if (t.topic && !ALL_TOPICS.includes(t.topic) && t.section !== 'General') {
        violations.push({ profile: p.name, date: today, rule: 'UNKNOWN_TOPIC', detail: `${t.topic} (${t.section})` });
      }
      if (typeof t.label !== 'string' || t.label.trim() === '') {
        violations.push({ profile: p.name, date: today, rule: 'EMPTY_LABEL', detail: JSON.stringify(t) });
      }
    }
    if (!['foundation', 'intensive', 'revision'].includes(plan.phase)) {
      violations.push({ profile: p.name, date: today, rule: 'BAD_PHASE', detail: String(plan.phase) });
    }

    days.push({
      date: today,
      tasks: plan.tasks.map((t) => ({ id: t.id, section: String(t.section), topic: t.topic ?? null, estMinutes: t.estMinutes })),
      estMinutes: plan.estMinutes, hoursToday: plan.hoursToday, phase: plan.phase,
    });

    // The student follows the plan.
    for (let k = 0; k < plan.tasks.length; k++) {
      const t = plan.tasks[k];
      if (!t.topic) continue;
      lastPlannedDay.set(t.topic, i);
      // Deterministic partial diligence — no RNG, so a failure reproduces.
      if (diligence < 1 && (i + k) % Math.max(2, Math.round(1 / Math.max(diligence, 0.01))) !== 0) continue;
      touched.add(t.topic);
      lastPracticedDay.set(t.topic, i);
      coverage.set(t.topic, applyConfidenceSignal(coverage.get(t.topic) ?? null, 'green'));
    }
  }

  return { days, violations, touched, finalCoverage: coverage };
}

// Run every profile ONCE and share the result across assertions — the full
// matrix is ~26 profiles x ~108 days x the real planner.
const RESULTS = new Map<string, ReturnType<typeof live>>();
for (const p of PROFILES) RESULTS.set(p.name, live(p));

describe('THE LIFETIME GATE: any profile, every day, to CAT day', () => {
  it('no profile produces a single broken day between signup and the exam', () => {
    const all: Violation[] = [];
    for (const [, r] of RESULTS) all.push(...r.violations);
    const summary = all.slice(0, 40).map((v) => `${v.profile} @ ${v.date}: ${v.rule} — ${v.detail}`).join('\n');
    expect(all, `${all.length} broken days:\n${summary}`).toEqual([]);
  });

  it('every profile gets a plan on every single day — no silent blank days', () => {
    for (const p of PROFILES) {
      const r = RESULTS.get(p.name)!;
      const expected = daysTo(p.startIso ?? '2026-08-14', EXAM_ISO).length;
      expect(r.days.length, `${p.name}: planned ${r.days.length} of ${expected} days`).toBe(expected);
      expect(r.days.every((d) => d.tasks.length > 0), `${p.name} had a blank day`).toBe(true);
    }
  });

  it('the day a student is handed always equals the hours they committed', () => {
    for (const p of PROFILES) {
      for (const d of RESULTS.get(p.name)!.days) {
        expect(d.estMinutes, `${p.name} @ ${d.date}`).toBe(Math.round(d.hoursToday * 60));
      }
    }
  });
});

describe('THE LIFETIME GATE: the plan actually teaches the syllabus', () => {
  it('a diligent student reaches every topic before CAT day', () => {
    // Only for profiles that start with real runway and log their work. A
    // student who signs up in November or never logs cannot be held to this,
    // and pretending otherwise would be the test lying to us.
    const fair = PROFILES.filter((p) => (p.diligence ?? 1) === 1 && !p.startIso && p.weekday >= 2);
    for (const p of fair) {
      const r = RESULTS.get(p.name)!;
      const missed = ALL_TOPICS.filter((t) => !r.touched.has(t));
      expect(missed, `${p.name} never reached ${missed.length} topics: ${missed.slice(0, 8).join(', ')}`).toEqual([]);
    }
  });

  it('no section is starved — every section is worked in every month', () => {
    const fair = PROFILES.filter((p) => (p.diligence ?? 1) === 1 && !p.startIso && p.weekday >= 3);
    for (const p of fair) {
      const r = RESULTS.get(p.name)!;
      const byMonth = new Map<string, Set<string>>();
      for (const d of r.days) {
        const m = d.date.slice(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, new Set());
        for (const t of d.tasks) if (t.topic) byMonth.get(m)!.add(t.section);
      }
      for (const [month, secs] of byMonth) {
        // November is revision and legitimately narrows; the build months
        // must not.
        if (month === '2026-11') continue;
        expect(secs.size, `${p.name}: only ${[...secs].join('/')} in ${month}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('a diligent student ends with most of the syllabus covered, not opened', () => {
    const fair = PROFILES.filter((p) => (p.diligence ?? 1) === 1 && !p.startIso && p.weekday >= 4);
    for (const p of fair) {
      const r = RESULTS.get(p.name)!;
      const covered = [...r.finalCoverage.values()].filter((s) => isCovered(s)).length;
      expect(covered / ALL_TOPICS.length, `${p.name} covered only ${covered}/${ALL_TOPICS.length}`)
        .toBeGreaterThan(0.9);
    }
  });
});

describe('THE LIFETIME GATE: the calendar is obeyed as it turns', () => {
  it('every profile is in revision phase by CAT day', () => {
    for (const p of PROFILES) {
      const r = RESULTS.get(p.name)!;
      const last = r.days[r.days.length - 1];
      expect(last.date, `${p.name} last planned day`).toBe(EXAM_ISO);
      expect(last.phase, `${p.name} on exam day`).toBe('revision');
    }
  });

  it('phase never goes backwards over a student lifetime', () => {
    const RANK: Record<string, number> = { foundation: 0, intensive: 1, revision: 2 };
    for (const p of PROFILES) {
      const r = RESULTS.get(p.name)!;
      let seen = -1;
      for (const d of r.days) {
        const rank = RANK[d.phase];
        expect(rank, `${p.name} @ ${d.date}: phase went back to ${d.phase}`).toBeGreaterThanOrEqual(seen);
        seen = rank;
      }
    }
  });
});
