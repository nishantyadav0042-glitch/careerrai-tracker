import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { studentEffortMultiplier, remainingSyllabusHours, REMAINING_FRACTION } from './study-pace';
import { totalSyllabusHours, topicsInSection, SECTIONS } from './prep-model';

const ALL_EXAM_TOPICS = SECTIONS.flatMap((s) => topicsInSection(s));

// Founder, 8 Aug: the information we collect during onboarding is not being
// used anywhere. Make sure that whatever we ask a student at onboarding, we
// actually use somewhere.
//
// He was right — an audit found coaching_enrolled handed to the routine engine
// and never read, and last_year_percentile collected since 23 July and used
// nowhere at all. These tests hold the line: a signal we ask a student for has
// to change something, and the place it changes has to keep working.

describe('the repeater signal actually changes the syllabus', () => {
  it('a first attempt faces the full curated estimate', () => {
    expect(studentEffortMultiplier({ isRepeater: false })).toBe(1.0);
    expect(studentEffortMultiplier({ isRepeater: false, lastYearPercentile: 95 })).toBe(1.0);
    expect(studentEffortMultiplier(null)).toBe(1.0);
  });

  it('last year\'s percentile — collected since 23 July, used nowhere until now', () => {
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 95 })).toBe(0.55);
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 90 })).toBe(0.55);
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 85 })).toBe(0.65);
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 75 })).toBe(0.80);
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 40 })).toBe(0.90);
  });

  it('a repeater who never told us their score gets the middle band, not the best', () => {
    // Guessing generously would quietly promise a date they cannot hit.
    expect(studentEffortMultiplier({ isRepeater: true })).toBe(0.80);
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: null })).toBe(0.80);
    expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: NaN })).toBe(0.80);
  });

  it('never exceeds 1.0 — the curated hours are already a full-effort estimate', () => {
    for (const pct of [0, 10, 50, 69, 70, 79, 80, 89, 90, 99.99]) {
      expect(studentEffortMultiplier({ isRepeater: true, lastYearPercentile: pct })).toBeLessThanOrEqual(1.0);
    }
  });

  it('the same untouched syllabus costs a strong repeater far fewer hours', () => {
    const untouched = ALL_EXAM_TOPICS.map((topic) => ({ topic, status: 'not_started' }));
    const fresher = remainingSyllabusHours(untouched, studentEffortMultiplier({ isRepeater: false }));
    const repeater = remainingSyllabusHours(untouched, studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 88 }));

    expect(fresher).toBe(totalSyllabusHours()); // the full curated model
    expect(repeater).toBe(Math.round(totalSyllabusHours() * 0.65));
    expect(fresher - repeater).toBeGreaterThan(100); // hours, not a rounding difference
  });

  it('effort stacks ON TOP of coverage, because they answer different questions', () => {
    // "How far into this topic is the student" (coverage) and "how fast does
    // this student move" (effort) are independent. A repeater who has not
    // started a topic still relearns it faster than a fresher does.
    const rows = ALL_EXAM_TOPICS.map((topic) => ({ topic, status: 'learning' }));
    const withEffort = remainingSyllabusHours(rows, 0.65);
    const expected = Math.round(totalSyllabusHours() * REMAINING_FRACTION.learning * 0.65);
    expect(withEffort).toBe(expected);
  });
});

describe('every onboarding answer reaches something', () => {
  const screen = readFileSync('src/app/start/screens/screen-quick-facts.tsx', 'utf8');

  it('self-study hours are asked, and asked as SELF-study', () => {
    // The number the finish date is computed from. Without it the weekly
    // reconcile skips the student entirely (`if (!weekdayHours) continue`),
    // so their date never moves and never warns — a plan with no arithmetic.
    expect(screen).toMatch(/self_study_hours:\s*selfStudyHours/);
    // For a coaching student the question must exclude class time, or six
    // hours means two different days and we plan the wrong one.
    expect(screen).toContain('not counting your coaching hours');

    const otp = readFileSync('src/app/api/auth/verify-phone-otp/route.ts', 'utf8');
    expect(otp).toMatch(/setDailyHours\(\s*onboarding\.self_study_hours\s*,\s*'signup'\s*\)/);
  });

  it('the screen does not lie about how many taps it takes', () => {
    // "Three taps" survived weeks of asking four questions. Pin it.
    // Anchored on the whole copy line, not the bare words: the comment above
    // it quotes the old wrong value, and a loose match reads that instead.
    const stated = screen.match(/(Three|Four|Five|Six|Seven) taps — this is what shapes your daily plan/)?.[1];
    const words: Record<string, number> = { Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7 };
    expect(stated).toBeDefined();

    // Counted from canContinue, not from headings: the honest definition of
    // "a tap" is an answer the student cannot proceed without. The repeater
    // sub-questions are conditional and correctly excluded by that rule.
    const gate = screen.match(/const canContinue =([\s\S]*?);\n/)?.[1] ?? '';
    const required = (gate.match(/!=+ null/g) ?? []).length;
    expect(required).toBeGreaterThan(0);
    expect(words[stated!]).toBe(required);
  });

  it('coaching_enrolled is no longer handed to the planner unread', () => {
    // It was declared on RoutineProfile, populated by both plan callers, and
    // never read by the engine. Either the engine uses it or it does not
    // travel — a field that arrives and is ignored is how a signal dies.
    const engine = readFileSync('src/lib/routine-engine.ts', 'utf8');
    const declared = /coachingEnrolled[?]?:\s*boolean/.test(engine);
    const read = /profile\.coachingEnrolled/.test(engine);
    expect(declared && !read).toBe(false);
  });
});
