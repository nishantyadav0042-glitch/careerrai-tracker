import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  formatMinutes, planSizeLine, firstOpenTask, promiseDue, promiseDay, istHour, type StudyPromise,
} from './first-task';

// IST = UTC+5:30. The study day rolls over at 05:30 IST (00:00 UTC).
const ist = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000);

describe('the plan size is the student’s own, in plain words', () => {
  it('formats minutes without rounding a real plan', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(255)).toBe('4 h 15 min');
  });

  it('sums the plan it is given, whatever its size', () => {
    // Founder, 24 Sep: "don't restrict to 2 hrs daily… it can vary student
    // to student." A 45-minute plan and a five-hour plan both read true.
    expect(planSizeLine([{ estMinutes: 45 }])).toBe('1 task, about 45 min');
    expect(planSizeLine([{ estMinutes: 120 }, { estMinutes: 90 }, { estMinutes: 90 }])).toBe('3 tasks, about 5 h');
    expect(planSizeLine([])).toBeNull();
  });

  it('the first open task is the first one not yet marked, in plan order', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(firstOpenTask(tasks, new Set())?.id).toBe('a');
    expect(firstOpenTask(tasks, new Set(['a']))?.id).toBe('b');
    expect(firstOpenTask(tasks, new Set(['a', 'b', 'c']))).toBeNull();
  });
});

describe('a promised time is asked about only after it arrives, the same study day', () => {
  const p = (slot: StudyPromise['slot'], day = '2026-09-24'): StudyPromise => ({ day, slot, at: 0 });

  it('reads the hour in IST', () => {
    expect(istHour(ist(2026, 9, 24, 17, 5))).toBe(17);
  });

  it('evening opens at 17:00 IST', () => {
    expect(promiseDue(p('evening'), ist(2026, 9, 24, 16, 59))).toBe(false);
    expect(promiseDue(p('evening'), ist(2026, 9, 24, 17, 0))).toBe(true);
  });

  it('night runs past midnight until the 05:30 rollover', () => {
    expect(promiseDue(p('night'), ist(2026, 9, 24, 22))).toBe(true);
    expect(promiseDue(p('night'), ist(2026, 9, 25, 1))).toBe(true);   // still the 24th's study day
  });

  it('05:30 starts a new study day: an evening promise is not due at 05:45', () => {
    expect(promiseDue(p('evening', '2026-09-25'), ist(2026, 9, 25, 5, 45))).toBe(false);
    expect(promiseDue(p('evening', '2026-09-24'), ist(2026, 9, 25, 5, 20))).toBe(true);
  });

  it('picking Evening at 2 AM means the coming evening', () => {
    expect(promiseDay('evening', ist(2026, 9, 25, 2))).toBe('2026-09-25');
    expect(promiseDay('night', ist(2026, 9, 25, 2))).toBe('2026-09-24');
    expect(promiseDay('evening', ist(2026, 9, 24, 10))).toBe('2026-09-24');
  });

  it('a promise from yesterday is not a reason to ask today', () => {
    expect(promiseDue(p('morning', '2026-09-23'), ist(2026, 9, 24, 10))).toBe(false);
    expect(promiseDue(null, ist(2026, 9, 24, 10))).toBe(false);
  });
});

describe('guards on the day-one flow', () => {
  const FLOW = readFileSync('src/components/first-task-flow.tsx', 'utf8');
  const CARD = readFileSync('src/components/DailyTracker/TodaysRoutineCard.tsx', 'utf8');
  const APP = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8');
  const TOUR = readFileSync('src/components/app-tour.tsx', 'utf8');
  const JOURNEY = readFileSync('src/lib/journey.ts', 'utf8');
  const PAGE = readFileSync('src/app/student/tracker/page.tsx', 'utf8');
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('marks through the card’s own completion path, and never re-sends a marked task', () => {
    // complete-task TOGGLES: sending an already-marked task unmarks it.
    expect(CARD).toContain('if (completedIds.has(openTask.id)) return true;');
    expect(CARD).toContain('return toggleTask(openTask, undefined, portion);');
    expect(CARD).toContain('<FirstTaskFlow enabled={firstDay} task={firstTask} onMark={markFirst} />');
    expect(CARD).toContain('<FirstTaskReminder task={firstTask} onMark={markFirst} />');
    // The flow itself has no network call of its own.
    expect(code(FLOW)).not.toMatch(/fetch\(/);
  });

  it('asks for a mark only after the student studied or chose a time', () => {
    // The old prompt opened the log sheet in the first session. It is gone.
    expect(code(APP)).not.toMatch(/track\('first_log_prompt'\)/);
    expect(code(APP)).not.toMatch(/cr_first_log_prompt_v1/);
    // The reminder never fires in the session the promise was made.
    expect(FLOW).toContain('promise.at < now.getTime() - 60_000');
  });

  it('only for a student who has never logged and finished onboarding', () => {
    expect(PAGE).toContain('firstDay={(logs ?? []).length === 0 && profile?.onboarding_completed === true && profile?.post_signup_done === true}');
  });

  it('tells a student who knows nothing that CareerRai does not teach', () => {
    expect(FLOW).toContain('CareerRai doesn’t teach. It tells you what to study.');
    expect(TOUR).toContain('CareerRai doesn’t teach.');
  });

  it('never states a fixed daily load', () => {
    for (const src of [code(FLOW), code(TOUR)]) {
      expect(src).not.toMatch(/\b2\s*(h|hrs?|hours)\b/i);
      expect(src).not.toMatch(/two hours/i);
    }
    expect(CARD).toContain('data-plan-size={planSizeLine(tasks) ?? undefined}');
  });

  it('every event it fires is registered', () => {
    const fired = [...FLOW.matchAll(/track\('([a-z_]+)'/g)].map((m) => m[1]);
    expect(fired.length).toBeGreaterThan(0);
    for (const e of new Set(fired)) expect(JOURNEY, e).toContain(`'${e}'`);
  });
});
