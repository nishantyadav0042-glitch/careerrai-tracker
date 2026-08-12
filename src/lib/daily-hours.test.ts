import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  dailyHours, hoursForDay, normaliseHours, setDailyHours, needsHoursConfirmation,
  MIN_DAILY_HOURS, MAX_DAILY_HOURS, hourOptions,
} from './daily-hours';
import { generateRoutine, type RoutineProfile, type Section } from './routine-engine';
import type { TopicChoice } from './topic-selector';

// One number, one owner, one place it can change.
//
// "Bhaiya 11 hr ka plan bnwayi hu aur sirf 4 hr ka task milta hai?" — a real
// student, 6 Aug. She set 11 hours and was handed a four-hour plan, because
// five separate pieces of code each held an opinion about how big her day
// should be. Every one of them was individually defensible. Together they meant
// no two screens showed the same number and none showed hers.
//
// These tests pin the rule that replaced all of it: the number is the student's,
// and the only thing that changes it is the student.

describe('normaliseHours — the only transformation ever applied', () => {
  it('rounds to the half hour the slider actually steps in', () => {
    expect(normaliseHours(4.2)).toBe(4);
    expect(normaliseHours(4.3)).toBe(4.5);
    expect(normaliseHours(5)).toBe(5);
  });

  it('holds inside a sane range without touching real stored values', () => {
    expect(normaliseHours(0.1)).toBe(MIN_DAILY_HOURS);
    expect(normaliseHours(99)).toBe(MAX_DAILY_HOURS);
    // Nine live accounts sit on 12 and one on 15 — legacies of the old
    // date-derived write. Confirming "yes, that's mine" must return the SAME
    // number, not the nearest one we would have offered.
    expect(normaliseHours(12)).toBe(12);
    expect(normaliseHours(15)).toBe(15);
  });

  it('refuses everything that is not a usable number', () => {
    for (const bad of [null, undefined, 0, -3, 'five', NaN, Infinity, {}]) {
      expect(normaliseHours(bad)).toBeNull();
    }
  });
});

describe('dailyHours — one read, one answer', () => {
  it('prefers the canonical column over the legacy mirror', () => {
    // The mirror goes stale: it used to be written by a different set of
    // callers than the canonical column, which is how the buddy dossier and
    // the student's own screen could show different numbers on the same day.
    expect(dailyHours({ study_target_hours: 5, hours_available: 3 }).weekday).toBe(5);
  });

  it('still reads accounts that only ever had the legacy column', () => {
    expect(dailyHours({ hours_available: 3 }).weekday).toBe(3);
  });

  it('uses the weekday number at the weekend when no weekend one was set', () => {
    const h = dailyHours({ study_target_hours: 6 });
    expect(h.weekend).toBe(6);
    expect(hoursForDay({ study_target_hours: 6 }, true)).toBe(6);
  });

  it('respects a genuinely different weekend commitment', () => {
    expect(hoursForDay({ study_target_hours: 2, weekend_hours_available: 7 }, true)).toBe(7);
    expect(hoursForDay({ study_target_hours: 2, weekend_hours_available: 7 }, false)).toBe(2);
  });

  it('returns null rather than inventing a number for a new account', () => {
    // The routine engine has stated archetype fallbacks for this. Anything else
    // guessing its own default here is how the numbers diverged last time.
    expect(dailyHours({}).weekday).toBeNull();
    expect(dailyHours(null).weekday).toBeNull();
    expect(dailyHours({ study_target_hours: 0 }).weekday).toBeNull();
  });
});

describe('setDailyHours — the one writer', () => {
  it('writes the canonical column, the mirror, and the provenance together', () => {
    const patch = setDailyHours(6.5, 'student');
    expect(patch.study_target_hours).toBe(6.5);
    expect(patch.hours_available).toBe(7);       // smallint column, whole hours
    expect(patch.study_hours_source).toBe('student');
    expect(patch.study_hours_set_at).toBeTypeOf('string');
  });

  it('leaves the weekend figure alone unless one was collected', () => {
    // A student who set 3h weekdays and 8h weekends must not lose the 8 just
    // because they nudged the weekday slider.
    expect('weekend_hours_available' in setDailyHours(5, 'student')).toBe(false);
    expect(setDailyHours(5, 'student', 8).weekend_hours_available).toBe(8);
  });

  it('produces nothing at all for an unusable number', () => {
    // An empty patch is safe to spread into an update object; a patch with
    // undefined values would blank the student's real hours.
    expect(setDailyHours(0, 'student')).toEqual({});
    expect(setDailyHours(NaN, 'student')).toEqual({});
  });
});

describe('the options a student is offered', () => {
  it('offers the whole range — a 15-hour day is a choice, not an anomaly', () => {
    // Founder, 6 Aug: "I used to study 15 hours... let them build that. They
    // might be the sincere students." A number a student can hold but cannot
    // pick would be the app having an opinion about it again.
    expect(hourOptions(5)).toContain(15);
    expect(hourOptions(5)).toContain(MAX_DAILY_HOURS);
  });

  it('includes a half-hour value no button represents', () => {
    expect(hourOptions(10.5)).toContain(10.5);
  });

  it('stays sorted so the picker reads left to right', () => {
    const opts = hourOptions(15);
    expect([...opts].sort((a, b) => a - b)).toEqual(opts);
  });
});

describe('the confirmation prompt', () => {
  // Until 6 Aug a date change silently rewrote the hours in place, leaving no
  // trace. For accounts that existed before then we genuinely cannot tell a
  // number the student chose from one we imposed — so we ask, once.
  it('asks students whose number we cannot prove is theirs', () => {
    expect(needsHoursConfirmation({ study_target_hours: 11, study_hours_source: 'derived_legacy' })).toBe(true);
  });

  it('never asks again once they have answered', () => {
    expect(needsHoursConfirmation({ study_target_hours: 11, study_hours_source: 'student' })).toBe(false);
  });

  it('does not ask a student who has no hours to confirm', () => {
    expect(needsHoursConfirmation({ study_hours_source: 'derived_legacy' })).toBe(false);
    expect(needsHoursConfirmation(null)).toBe(false);
  });
});

// ── The plan is built from the number, and only the number ──────────────────

const CHOICE = (topic: string): TopicChoice => ({
  topic, coverageStatus: null, reasons: [], score: 0,
} as unknown as TopicChoice);
const CHOICES = {
  VARC: CHOICE('Reading Comprehension'),
  DILR: CHOICE('Bar Graphs'),
  QA: CHOICE('Percentages'),
} as Record<Section, TopicChoice>;
const HISTORY = { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } };
const PROFILE = (hours: number): RoutineProfile => ({
  isWorkingProfessional: false,
  isRepeater: false,
  targetPercentile: 99,
  weekdayHours: hours,
  weekendHours: hours,
  weakestSection: 'QA',
  strongestSection: 'VARC',
  weakTopic: null,
  currentStage: null,
 
  attemptYear: 2026,
});
// A Wednesday, so the weekday number is the one in play.
const WED = new Date('2026-08-05T06:00:00.000Z');

describe('the same hours always produce the same day', () => {
  it('is deterministic — no behavioural factor scales the volume any more', () => {
    // volumeFactor used to multiply task counts by 0.6–1.3 based on recent
    // completion rates, so two students on 5 hours got different amounts of
    // work and the same student got a different amount on different days.
    // Founder: "they should be on fixed hours throughout the preparation."
    const a = generateRoutine(PROFILE(5), WED, HISTORY, CHOICES);
    const b = generateRoutine(PROFILE(5), WED, HISTORY, CHOICES);
    expect(a.tasks.map((t) => t.target)).toEqual(b.tasks.map((t) => t.target));
    expect(a.estMinutes).toBe(b.estMinutes);
  });

  it('sizes an 11-hour day to eleven hours, not to what we think they can take', () => {
    // The exact complaint. 11 in, a plan meaningfully larger than the 4-hour
    // one out — and never silently capped at some "human maximum" we chose.
    const eleven = generateRoutine(PROFILE(11), WED, HISTORY, CHOICES);
    const four = generateRoutine(PROFILE(4), WED, HISTORY, CHOICES);
    expect(eleven.estMinutes).toBeGreaterThan(four.estMinutes * 2);
    expect(eleven.estMinutes).toBeGreaterThanOrEqual(11 * 60);
  });

  it('a bigger number is always a bigger day, right across the range', () => {
    let previous = 0;
    for (let h = 1; h <= MAX_DAILY_HOURS; h += 1) {
      const mins = generateRoutine(PROFILE(h), WED, HISTORY, CHOICES).estMinutes;
      expect(mins).toBeGreaterThan(previous);
      previous = mins;
    }
  });
});

// ── The guard that keeps this true ──────────────────────────────────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('nothing writes the number except the one writer', () => {
  it('has no other site putting study_target_hours into an update', () => {
    // THE regression guard for this whole change set. The bug was never one bad
    // line — it was five well-meaning ones in five files, each deriving the
    // student's hours from something else. If this test fails, someone has
    // started doing it again and "sometimes 4 hours, sometimes 6" is back.
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      if (file.endsWith('daily-hours.ts')) continue;   // the writer itself
      const text = readFileSync(file, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        // An assignment or object-literal key, not a `.select(...)` list, not a
        // type declaration, and not prose in a comment.
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/\bstudy_target_hours\s*[:=]\s*(?!.*\bnumber\b)/.test(line) && !/select\(/.test(line)) {
          offenders.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no site re-deriving hours from a finish date', () => {
    // The specific write that caused this: rescheduling recomputed
    // requiredPerDay and stored it as the student's commitment.
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      // computeRequiredPace feeding straight into an hours write, on one line
      // or across a short window, is the shape to refuse.
      if (/(study_target_hours|hours_available)\s*[:=][^;\n]*requiredPerDay/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── Stage A: the bad-day floor (founder, 8 Aug) ─────────────────────────────




describe('small days are small, few-task, and exactly the size promised', () => {
  // The engine's small-day shaping is unchanged and still worth pinning — it
  // just triggers on a small NORMAL DAY now, not on the floor. Three tasks in
  // thirty minutes is three ways to feel behind; one finishable task is a won
  // day, and that is true however the day got to thirty minutes.
  const NO_HIST = { daysSinceLastPracticed: { VARC: null, DILR: null, QA: null } as Record<Section, number | null> };
  const CHOICES: Record<Section, TopicChoice> = {
    VARC: { topic: 'Reading Comprehension', score: 1, reasons: [], coverageStatus: null },
    DILR: { topic: 'Arrangements', score: 1, reasons: [], coverageStatus: null },
    QA: { topic: 'Percentages', score: 1, reasons: [], coverageStatus: null },
  };
  // Sized by HOURS, the way a real profile now is.
  const P = (minutes: number, over: Partial<RoutineProfile> = {}): RoutineProfile => ({
    isWorkingProfessional: false, isRepeater: false, targetPercentile: 95,
    weekdayHours: minutes / 60, weekendHours: minutes / 60,
    weakestSection: 'QA', strongestSection: 'VARC', weakTopic: null,
    currentStage: 'not_started', attemptYear: 2026, ...over,
  });
  // A CALENDAR-FREE day on purpose: 10 Aug was the analysis day after
  // Sunday's mock, and once Home learned the exam calendar (lib/exam-calendar)
  // a 2h Monday rightly became the analysis block. These tests assert the
  // size law of TOPIC days, so they run on a Tuesday the calendar leaves alone.
  const MON = new Date('2026-08-11T06:00:00');

  it('a 30-minute day is ONE task of exactly 30 minutes', () => {
    const r = generateRoutine(P(30), MON, NO_HIST, CHOICES);
    expect(r.tasks).toHaveLength(1);
    expect(r.estMinutes).toBe(30);
    expect(r.tasks[0].section).toBe('QA'); // the weak section still leads
  });

  it('30 min = one task; 60 min = two; 120 min = three — all exact', () => {
    for (const [minutes, count] of [[30, 1], [60, 2], [120, 3]] as const) {
      const r = generateRoutine(P(minutes), MON, NO_HIST, CHOICES);
      expect(r.tasks.length).toBe(count);
      expect(r.estMinutes).toBe(minutes);
    }
  });

  it('small days never get a closing task, even for repeaters in mocks stage', () => {
    const r = generateRoutine(P(30, { isRepeater: true, currentStage: 'mocks' }), MON, NO_HIST, CHOICES);
    expect(r.tasks).toHaveLength(1);
    expect(r.estMinutes).toBe(30);
  });

  it('THE REVERSAL: 6 chosen hours build a 6-hour day, not a 30-minute one', () => {
    // The measured contradiction that forced this change: floor 30, hours 6,
    // plan 30 — 330 minutes the student was never given anything to do with.
    const r = generateRoutine(P(360), MON, NO_HIST, CHOICES);
    expect(r.estMinutes).toBe(360);
    expect(r.tasks.length).toBeGreaterThan(1);
  });

  it('no hours at all falls to the archetype default, not to zero', () => {
    const r = generateRoutine(
      P(0, { weekdayHours: null, weekendHours: null }),
      MON, NO_HIST, CHOICES);
    expect(r.estMinutes).toBe(150); // 2.5h, the stated non-working default
  });
});
