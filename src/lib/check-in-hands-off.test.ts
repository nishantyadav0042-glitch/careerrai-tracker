import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUTCOME_OPTIONS, outcomeNeedsDuration, type DayOutcome } from './check-in';

// ── Q5 — the check-in stops asking a question it cannot finish ───────────────
//
// Founder ruling, 18 Aug: "don't keep that button like that — redirect the
// student to fill the complete log. Don't keep a single button which is
// creating so much complications. Counting zero hours is also a blunder which
// you have done in past."
//
// The defect: the check-in gate posts `hours: 0` for ALL FOUR outcomes, because
// it never asks how long. For 'not_studied' and 'skipped' that is complete —
// the student has said there was nothing to measure. For 'studied' and
// 'partial' it is a question left hanging: they told us they studied and we
// recorded no duration, producing 62 rows across 38 students that no consumer
// can interpret, and which weekly-plan-reconcile reads as ZERO and uses to push
// their syllabus finish date out.
//
// G6 proposed interpreting those rows. The founder's ruling is better: stop
// creating them. The gate keeps the two answers it can fully record and hands
// the other two to the log sheet, which now has somewhere truthful to put them
// (off-plan sections shipped in 9a66322).
//
// THE ORDER MATTERS AND IS DELIBERATE. The outcome is recorded FIRST, then the
// log opens. A student who abandons the log still keeps the day and the streak,
// honestly stamped `not_collected` — strictly better than today, where they get
// the same row with no invitation to complete it. The ambiguous state becomes
// TRANSIENT rather than terminal: finishing the log upserts the same
// (student_id, report_date) row to real hours and `credited`.

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => src(p).split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const GATE = 'src/components/check-in-gate.tsx';
const APP = 'src/components/DailyTracker/DailyTrackerApp.tsx';

describe('outcomeNeedsDuration — which answers the check-in cannot finish', () => {
  it('studied and partial need a duration the gate never asks for', () => {
    expect(outcomeNeedsDuration('studied')).toBe(true);
    expect(outcomeNeedsDuration('partial')).toBe(true);
  });

  it('not-studied and rest are complete answers on their own', () => {
    // The outcome already answers "how long": nothing. This is the same pair
    // rule G6 established for reading the data, applied at the writing end.
    expect(outcomeNeedsDuration('not_studied')).toBe(false);
    expect(outcomeNeedsDuration('skipped')).toBe(false);
  });

  it('covers every outcome in the vocabulary — no silent fallthrough', () => {
    for (const o of OUTCOME_OPTIONS) {
      expect(typeof outcomeNeedsDuration(o.id as DayOutcome), o.id).toBe('boolean');
    }
    expect(OUTCOME_OPTIONS.filter((o) => outcomeNeedsDuration(o.id as DayOutcome))).toHaveLength(2);
  });
});

describe('the gate hands the unfinished answers to the log sheet', () => {
  it('records the outcome BEFORE handing off — an abandoned log must not cost the day', () => {
    const g = code(GATE);
    const fetchIdx = g.indexOf("fetch('/api/logging/log-daily'");
    const handoffIdx = g.indexOf("'cr-open-log'");
    expect(fetchIdx, 'the gate must still save').toBeGreaterThan(-1);
    expect(handoffIdx, 'the gate must hand off').toBeGreaterThan(-1);
    expect(handoffIdx, 'the save has to come first, or a dropped log loses the streak day')
      .toBeGreaterThan(fetchIdx);
  });

  it('only the two duration-needing answers hand off', () => {
    const g = code(GATE);
    expect(g).toMatch(/outcomeNeedsDuration\(/);
  });

  it('the handoff carries the date being logged, not today', () => {
    // The gate is always about YESTERDAY. Opening the sheet without the date
    // would silently log the wrong day.
    const g = code(GATE);
    expect(g).toMatch(/cr-open-log'[\s\S]{0,220}yesterdayStr/);
  });

  it('the app answers the handoff by opening the sheet on that date', () => {
    const a = code(APP);
    expect(a).toMatch(/addEventListener\('cr-open-log'/);
    expect(a).toMatch(/setLogDateOverride\([\s\S]{0,120}setIsLogOpen\(true\)/);
  });

  it('the rest / didn\'t-study path still ends in the payoff, unchanged', () => {
    const g = code(GATE);
    expect(g).toContain('setRebuilding(true)');
    expect(g).toContain('PlanRebuildPayoff');
  });
});

describe('what this gate must NOT do', () => {
  it('no duration is invented for a check-in — the rejected Q5 option', () => {
    const g = code(GATE);
    // The founder considered "assume they studied their usual amount" and it
    // was withdrawn: it makes NOT logging strictly better than logging
    // honestly, and J6-A forbids manufacturing evidence.
    expect(g).toMatch(/hours:\s*0/);
    expect(g).not.toMatch(/study_target_hours|usual|assume/i);
  });

  it('the check-in still stamps its zero as not_collected, never as a real zero', () => {
    expect(code(GATE)).toMatch(/hours_source:\s*'not_collected'/);
  });

  it('no historical row is rewritten', () => {
    // Was `git status --porcelain supabase/migrations`. That guard is correct on
    // the day a gate ships and WRONG as a standing invariant — it asserts the
    // repo never gains a migration, so an unrelated later gate breaks it. (Third
    // time this pattern has needed correcting; the durable form is below.)
    // What this gate actually promised: no migration rewrites stored evidence.
    // Function bodies are excised — an RPC updating a row on a future write is
    // the function doing its job, not a migration touching history.
    const dir = join(process.cwd(), 'supabase/migrations');
    const offenders = readdirSync(dir).filter((f) => {
      const sql = readFileSync(join(dir, f), 'utf8')
        .replace(/--[^\n]*/g, '')
        .replace(/AS \$function\$[\s\S]*?\$function\$;/gi, '')
        .replace(/AS \$\$[\s\S]*?\$\$;/gi, '');
      return /\b(update|delete\s+from)\s+(public\.)?(daily_reports|routine_task_completions)\b/i.test(sql);
    });
    expect(offenders, 'no migration may rewrite stored evidence').toEqual([]);
  });
});
