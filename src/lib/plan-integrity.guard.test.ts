import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { generateRoutine, type RoutineProfile } from './routine-engine';
import { buildTopicChoices, TOPICS_BY_SECTION } from './day-topics';

// ── THE ZERO-ERROR GATE (code side) ─────────────────────────────────────────
//
// Founder, 14 Aug: "ZERO STUDY-PLAN ERRORS. Not 99%. Not 99.9%. One broken
// student's study plan is a production failure."
//
// scripts/plan-integrity-audit.sql audits STORED state — what is in the
// database right now. This file audits the PRODUCERS: the invariants that
// decide whether tomorrow's rows can be wrong. A plan can be perfectly
// self-consistent and still be built by two engines that disagree, or dated by
// two clocks that disagree. Those failures are invisible to any row-level
// check until the day they aren't.
//
// Three structural invariants are pinned here. Each one was violated in
// production and found by the 14 Aug audit.

const STATUSES = ['not_started', 'learning', 'revising', 'exam_ready'];
function rng(seed: number) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

// ── INVARIANT 1: a day never repeats itself ────────────────────────────────
//
// Found in production: Abhishek, 12 Aug, VARC Reading Comprehension scheduled
// TWICE in one day (132m + 132m) — the same work prescribed twice, which a
// student can only read as "the app doesn't know what it already told me".
// Exactly one row in the whole table, and not reproducible on current code, so
// rather than declare it fixed on a guess this fuzz makes it impossible to
// reintroduce: 4,000 real plans across every budget, archetype, phase and
// coverage state the product supports.
describe('INVARIANT 1 — one topic, one slot, one day', () => {
  it('4000 generated plans contain no repeated topic and no repeated task id', () => {
    const r = rng(7);
    const BUDGETS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 11, 12, 14, 16];
    const DATES = ['2026-08-13T06:00:00Z', '2026-08-16T06:00:00Z', '2026-09-17T06:00:00Z', '2026-11-05T06:00:00Z'];
    const fails: string[] = [];

    for (let n = 0; n < 4000; n++) {
      const hours = BUDGETS[Math.floor(r() * BUDGETS.length)];
      const now = new Date(DATES[Math.floor(r() * DATES.length)]);
      const prof = {
        isWorkingProfessional: r() < 0.3, isRepeater: r() < 0.3, targetPercentile: 95,
        weekdayHours: hours, weekendHours: hours,
        weakestSection: (['VARC', 'DILR', 'QA'] as const)[Math.floor(r() * 3)],
        strongestSection: 'QA', weakTopic: null, currentStage: null, attemptYear: 2026,
      } as RoutineProfile;

      const coverage: { topic: string; section: string; status: string; is_priority: boolean }[] = [];
      for (const sec of ['VARC', 'DILR', 'QA'] as const)
        for (const topic of TOPICS_BY_SECTION[sec])
          if (r() < 0.75) coverage.push({ topic, section: sec, status: STATUSES[Math.floor(r() * STATUSES.length)], is_priority: r() < 0.15 });

      const history = {
        recentTopics: [], daysSinceLastPracticedByTopic: {}, daysSincePlannedByTopic: {},
        timesPracticedByTopic: {}, postponedTopics: [], yesterday: null,
        yesterdayUnfinishedTopics: [], completedTasks: 0, plannedTasks: 0, planDays: 0,
        daysSinceLastPracticed: { VARC: null, DILR: null, QA: null },
      } as unknown as Parameters<typeof buildTopicChoices>[2];

      // A coaching class topic is included ~30% of the time: the `claimed`
      // branch of chooseSectionDay is the one push that does not consult the
      // taken-set, so it must be exercised.
      const classTopics = r() < 0.3
        ? [TOPICS_BY_SECTION[(['VARC', 'DILR', 'QA'] as const)[Math.floor(r() * 3)]][0]]
        : [];
      const daysToTarget = r() < 0.2 ? null : 1 + Math.floor(r() * 150);

      const tc = buildTopicChoices(coverage, prof, history, null, classTopics, daysToTarget, now);
      const routine = generateRoutine(prof, now, history as unknown as Parameters<typeof generateRoutine>[2], tc.choices, tc.extras);

      const keys = routine.tasks.filter((t) => t.topic).map((t) => `${t.section}|${t.topic}`);
      const dupTopic = keys.filter((k, i) => keys.indexOf(k) !== i);
      const ids = routine.tasks.map((t) => t.id);
      const dupId = ids.filter((k, i) => ids.indexOf(k) !== i);

      if (dupTopic.length && fails.length < 5) fails.push(`repeated topic (h=${hours}, weak=${prof.weakestSection}): ${JSON.stringify(keys)}`);
      if (dupId.length && fails.length < 8) fails.push(`repeated task id (h=${hours}): ${JSON.stringify(ids)}`);
    }
    expect(fails).toEqual([]);
  });
});

// ── INVARIANT 2: ONE plan-date authority ───────────────────────────────────
//
// The study day rolls at 03:00 IST (lib/study-day). Raw UTC midnight is 05:30
// IST, so between 03:00 and 05:29 the two name different days — and two files were
// using raw UTC to pick which plan row to DELETE. A student changing their
// hours at 4 AM deleted YESTERDAY's plan, left today's sized to the old
// number, and got told planRebuilt: true.
describe('INVARIANT 2 — one clock decides which plan row is touched', () => {
  const PLAN_ROW_FILES = [
    'src/lib/timetable-apply.ts',
    'src/app/api/student/daily-hours/route.ts',
    'src/app/api/routine/today/route.ts',
    'src/lib/routine-plan.ts',
    'src/app/api/routine/complete-task/route.ts',
    'src/app/api/routine/add-block/route.ts',
    'src/app/api/routine/busy-day/route.ts',
  ];

  for (const f of PLAN_ROW_FILES) {
    it(`${f.split('/').slice(-2).join('/')} dates plan rows by the study day`, () => {
      const s = readFileSync(f, 'utf8');
      expect(s, 'must use the study-day authority').toContain('getLogDateString');
      // Raw UTC date derivation must not be used to key a plan row. The
      // daily_reports lookback window in today/route.ts is a genuine
      // duration, not a plan key, so only same-line date-keying is banned.
      const rawUtcDateLines = s.split('\n').filter((l) =>
        /const\s+today\s*=\s*new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(l));
      expect(rawUtcDateLines, `raw UTC "today" in ${f}`).toEqual([]);
    });
  }
});

// ── INVARIANT 3: the writers agree ─────────────────────────────────────────
//
// daily_routines has exactly two writers. They must resolve the same inputs
// the same way, or the same student gets a different day depending on which
// one ran first — two authoritative plans for one student and one date, which
// is the founder's explicit FAIL condition.
describe('INVARIANT 3 — both plan writers agree on how a day is built', () => {
  const ROUTE = 'src/app/api/routine/today/route.ts';
  const CRON = 'src/lib/routine-plan.ts';

  it('there are still exactly two writers of daily_routines', () => {
    // A third writer is not automatically wrong, but it must be a decision,
    // not an accident — and it must be added to these guards.
    const files = ['src/app/api/routine/today/route.ts', 'src/lib/routine-plan.ts'];
    for (const f of files) expect(readFileSync(f, 'utf8')).toContain("from('daily_routines')");
  });

  it('both assemble the day through the ONE shared builder', () => {
    // Sharing the individual helpers was not enough. Two functions calling the
    // same five helpers in the same order today will drift the first time
    // someone edits one of them — which is precisely how the cron ended up
    // without a mock branch while every part it called was already "shared".
    for (const f of [ROUTE, CRON]) {
      expect(readFileSync(f, 'utf8'), f).toContain('buildDayPlan({');
    }
  });

  it('neither writer decides any part of the day for itself', () => {
    // If a writer can call the engine or the selector directly, it can build a
    // different day. The only permitted caller of these is lib/plan-day.
    for (const f of [ROUTE, CRON]) {
      const s = readFileSync(f, 'utf8');
      for (const forbidden of ['generateRoutine(', 'buildTopicChoices(', 'resolveFocusSections(', 'timetableDayTasks({']) {
        expect(s.includes(forbidden), `${f} must not call ${forbidden} directly`).toBe(false);
      }
    }
  });

  it('the builder is the only place the engine is called from', () => {
    const s = readFileSync('src/lib/plan-day.ts', 'utf8');
    expect(s).toContain('generateRoutine(');
    expect(s).toContain('buildTopicChoices(');
    expect(s).toContain('resolveFocusSections(');
    expect(s).toContain('timetableDayTasks({');
  });

  it('both read the mock evidence the focus chain depends on', () => {
    // The cron used to skip this read entirely, which is exactly why its
    // chain silently lacked the mock branch.
    for (const f of [ROUTE, CRON]) {
      expect(readFileSync(f, 'utf8'), f).toContain("from('mock_debriefs')");
    }
  });

  it('both write through the same conflict target, so a race cannot duplicate', () => {
    for (const f of [ROUTE, CRON]) {
      expect(readFileSync(f, 'utf8'), f).toContain("onConflict: 'student_id,routine_date'");
    }
  });
});

// ── INVARIANT 4: the constraint that makes the upsert an upsert ────────────
//
// Both writers rely on onConflict (student_id, routine_date). That target is
// backed by a UNIQUE index in production — verified 14 Aug — but the table was
// created outside version control, so no migration in this repo declares it.
// A rebuilt environment would have no constraint, both upserts would silently
// become inserts, and duplicate same-day plans become possible with no code
// change at all.
describe('INVARIANT 4 — the uniqueness the whole system rests on is in version control', () => {
  it('a migration declares UNIQUE (student_id, routine_date) on daily_routines', () => {
    const dir = 'supabase/migrations';
    const all = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
    expect(
      /daily_routines[\s\S]{0,400}unique[\s\S]{0,80}student_id[\s\S]{0,40}routine_date/i.test(all)
      || /unique[\s\S]{0,120}daily_routines[\s\S]{0,120}student_id[\s\S]{0,40}routine_date/i.test(all),
      'no migration declares the unique constraint on daily_routines(student_id, routine_date)'
    ).toBe(true);
  });
});

// ── INVARIANT 5: ONE way to build a study plan ─────────────────────────────
//
// Founder, 14 Aug: "delete — there should be only one way for building study
// plan, unless a student uploads their coaching or self timetable. Otherwise
// one study table for all. Zero compromise for anyone."
//
// /student/plan/[section] and /api/mastery/[section] were a SECOND planner:
// their own per-section day, their own budget split, their own topic ranking,
// reachable from the Home "what now" card behind a <section>_model_enabled
// flag. A student could read "do Geometry" there and "do Percentages" on Home.
// Both were defensible; together they were two answers from one app.
//
// Deleted. The only permitted fork is an uploaded timetable, and that one
// REPLACES the generated day rather than competing with it (lib/timetable-day).
describe('INVARIANT 5 — one planner, with exactly one permitted fork', () => {
  it('the per-section mastery planner is gone and cannot be re-imported', () => {
    for (const f of [
      'src/lib/mastery-engine.ts', 'src/lib/mastery-state.ts', 'src/lib/mastery-sections.ts',
      'src/lib/qa-mastery-engine.ts', 'src/lib/dilr-mastery-engine.ts', 'src/lib/varc-mastery-engine.ts',
    ]) {
      expect(existsSync(f), `${f} must stay deleted`).toBe(false);
    }
    expect(existsSync('src/app/api/mastery'), 'the mastery API must stay deleted').toBe(false);
    expect(existsSync('src/app/student/plan/[section]'), 'the per-section plan page must stay deleted').toBe(false);
  });

  it('nothing routes a student into a per-section planner any more', () => {
    const s = readFileSync('src/app/api/next-action/route.ts', 'utf8');
    expect(s).not.toContain('/student/plan/${sec}');
    expect(s).not.toMatch(/_model_enabled/);
  });

  it('the only fork from the generated day is an uploaded timetable', () => {
    // Exactly one branch, in exactly one file.
    const s = readFileSync('src/lib/plan-day.ts', 'utf8');
    expect((s.match(/timetableDayTasks\(\{/g) ?? []).length, 'one timetable fork').toBe(1);
    expect((s.match(/generateRoutine\(/g) ?? []).length, 'one engine call').toBe(1);
  });
});

// ── INVARIANT 6: every surface that names a weak section uses ONE chain ─────
//
// The two-writer bug was fixed for the two daily_routines writers, and the
// guards above pinned exactly those two. The 14 Aug sweep found the same bug
// still alive one surface out: /api/plan/full derived weakestSection from a
// three-link chain with NO mock and NO baseline branch, under a comment
// claiming it matched the daily plan. A student whose latest mock said VARC
// got a VARC-led Home and a DILR-led Whole Plan in the same session.
//
// Guarding "the two writers" was too narrow. The rule is: any surface that
// tells a student what their weakest section is must resolve it through
// lib/focus-sections.
describe('INVARIANT 6 — no surface re-derives the weak section by hand', () => {
  const SURFACES = [
    'src/app/api/plan/full/route.ts',
    'src/app/api/cron/study-companion/route.ts',
    'src/app/api/routine/today/route.ts',
    'src/lib/routine-plan.ts',
  ];

  it('every student-facing surface goes through the shared resolver', () => {
    for (const f of SURFACES) {
      const s = readFileSync(f, 'utf8');
      const shared = s.includes('resolveFocusSections(') || s.includes('buildDayPlan({');
      expect(shared, `${f} must resolve focus through lib/focus-sections`).toBe(true);
    }
  });

  it('none of them calls the coverage rule directly', () => {
    // Calling weakestFromCoverage outside focus-sections is the signature of
    // a copied chain: it is the LAST link, so anyone invoking it here is
    // rebuilding the ladder above it — which is precisely how /api/plan/full
    // ended up without a mock branch. (A bare `?? 'DILR'` is fine and is not
    // the tell: routineProfile.weakestSection is already resolved, and the
    // coalesce there only narrows a nullable type.)
    for (const f of SURFACES) {
      const s = readFileSync(f, 'utf8');
      expect(s.includes('weakestFromCoverage('), `${f} re-implements the chain`).toBe(false);
    }
  });

  it('the notification copy names the plan it links to', () => {
    // The cron derived weakest and hours by hand for its copy, ten lines
    // before computing the real plan — so it could say "DILR, 3h" above a
    // plan that led VARC at 8h. The plan is the authority once it exists.
    const s = readFileSync('src/app/api/cron/study-companion/route.ts', 'utf8');
    expect(s).toContain('weakest = plan.weakestSection');
    expect(s).toContain('hoursToday = plan.hoursToday');
  });
});

// ── INVARIANT 7: ONE answer to "how long is today?" ────────────────────────
//
// plan-day computed hoursToday from the study day and persisted it as
// generated_hours; generateRoutine independently recomputed weekend and hours
// from `now.getDay()` — the HOST's local weekday — and sized the tasks with
// its own value. They agreed only because Vercel runs UTC, and the hours a
// plan was judged stale against were not necessarily the hours it was built
// to.
describe('INVARIANT 7 — the hours that size the day are the hours we persist', () => {
  it('there is exactly one implementation of the weekday/weekend fallback', () => {
    const engine = readFileSync('src/lib/routine-engine.ts', 'utf8');
    const planDay = readFileSync('src/lib/plan-day.ts', 'utf8');
    // The archetype fallback table appears once, in the engine.
    expect((engine.match(/isWorkingProfessional \? 4 : 3/g) ?? []).length).toBe(1);
    expect(planDay).not.toContain('isWorkingProfessional ? 4 : 3');
    // ...and plan-day delegates rather than re-deriving.
    expect(planDay).toContain('hoursForDayOf(');
  });

  it('weekend is decided from the study day, never the host clock', () => {
    const engine = readFileSync('src/lib/routine-engine.ts', 'utf8');
    const fn = engine.slice(engine.indexOf('function isWeekend'), engine.indexOf('export function hoursForDayOf'));
    expect(fn).toContain('studyDayString(');
    expect(fn, 'host-local getDay() is timezone-dependent').not.toMatch(/d\.getDay\(\)/);
  });
});

// ── INVARIANT 8: a day cannot prescribe the same topic twice ───────────────
//
// Founder, 14 Aug: "test + structural invariant, not fuzz alone." The 4,000-
// plan fuzz in INVARIANT 1 proves it does not happen; these two guards make
// it impossible to happen, at both levels where it could.
describe('INVARIANT 8 — duplicate topics are structurally impossible', () => {
  it('the selector refuses a duplicate on every push, including the claimed one', () => {
    // The claimed branch (postponed / today's coaching class) was the one
    // push that did not consult the taken-set.
    const s = readFileSync('src/lib/topic-selector.ts', 'utf8');
    const claimed = s.slice(s.indexOf('const claimed = candidates.filter'), s.indexOf('const remaining = ()'));
    expect(claimed).toContain('taken.has(');
  });

  it('the generator de-duplicates again at the boundary where choices become tasks', () => {
    // Slicing whatever the selector returned is the step that turned a
    // duplicated CHOICE into two real tasks on a student's screen.
    const s = readFileSync('src/lib/routine-engine.ts', 'utf8');
    expect(s).toContain('function distinctByTopic(');
    expect(s).toContain('distinctByTopic(extraChoices?.[weak]');
    expect(s).toContain('distinctByTopic(extraChoices?.[section]');
    // The raw slice must not come back.
    expect(s).not.toMatch(/extraChoices\?\.\[weak\]\?\.slice\(/);
    expect(s).not.toMatch(/extraChoices\?\.\[section\]\?\.slice\(/);
  });
});
