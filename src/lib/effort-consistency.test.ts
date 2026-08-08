import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { remainingSyllabusHours, studentEffortMultiplier, totalSyllabusHours } from './study-pace';
import { remainingPrepHours, EXAM_UNIT_COUNT } from './blueprint-builder';
import { buildWeekPlan } from './study-forecast';
import { topicsInSection, SECTIONS } from './prep-model';

const ALL = SECTIONS.flatMap((s) => topicsInSection(s));

// Founder, 8 Aug: is a change we make at point A actually reaching point Z?
// The whole app has to stay aligned. Zero inconsistencies.
//
// The effort multiplier is set in ONE place and read by every surface that
// prices the syllabus in hours or converts it to a date. This file is the
// audit made permanent. It caught a real one: the finish-date chooser used
// blueprint-builder's count-based model, which had no effort scaling, so a
// repeater picked a date computed from 397 hours and woke up to a Home screen
// pricing the same syllabus at 258.
//
// THE RULE, stated once so future work can be judged against it:
//   CONTENT is the same for every student — the 46 topics, the coverage
//   percentage, the preparation index. Never scaled.
//   TIME is not — hours remaining, required pace, finish dates. Always scaled.
// A repeater does not study fewer topics. They spend fewer hours per topic.

describe('the two hours models agree, at every effort', () => {
  const untouched = ALL.map((topic) => ({ topic, status: 'not_started' }));

  it('per-topic and count-based produce the same total for a first-timer', () => {
    const perTopic = remainingSyllabusHours(untouched, 1);
    const countBased = remainingPrepHours({ coverage_total: EXAM_UNIT_COUNT, is_repeater: false });
    expect(Math.round(countBased)).toBe(perTopic);
    expect(perTopic).toBe(totalSyllabusHours());
  });

  it('and still agree once the student is a repeater', () => {
    // This assertion failed before the fix: countBased stayed at 397.
    const effort = studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 88 });
    const perTopic = remainingSyllabusHours(untouched, effort);
    const countBased = remainingPrepHours({
      coverage_total: EXAM_UNIT_COUNT, is_repeater: true, last_year_percentile: 88,
    });
    expect(Math.round(countBased)).toBe(perTopic);
    expect(perTopic).toBeLessThan(totalSyllabusHours());
  });

  it('agree across every band, so no percentile has its own drift', () => {
    for (const pct of [null, 95, 88, 75, 40]) {
      const effort = studentEffortMultiplier({ isRepeater: true, lastYearPercentile: pct });
      const perTopic = remainingSyllabusHours(untouched, effort);
      const countBased = remainingPrepHours({
        coverage_total: EXAM_UNIT_COUNT, is_repeater: true, last_year_percentile: pct,
      });
      expect(Math.abs(Math.round(countBased) - perTopic)).toBeLessThanOrEqual(1);
    }
  });

  it('a first attempt is never scaled, whatever percentile is on the row', () => {
    // last_year_percentile can be non-null on a non-repeater row (they toggled
    // the answer). is_repeater is the gate; the percentile only picks the band.
    const countBased = remainingPrepHours({
      coverage_total: EXAM_UNIT_COUNT, is_repeater: false, last_year_percentile: 95,
    });
    expect(Math.round(countBased)).toBe(totalSyllabusHours());
  });
});

describe('the multiplier reaches every surface that prices time', () => {
  // Any file that turns the syllabus into hours or a date must consult the
  // multiplier. Enumerated by grep rather than by memory, because the whole
  // point is that a NEW surface built next month must not be able to skip it
  // quietly — this fails the moment one does.
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
    }
    return out;
  }

  it('no surface computes remaining syllabus hours without an effort value', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      if (file.endsWith('study-pace.ts') || file.endsWith('blueprint-builder.ts')) continue;
      const text = readFileSync(file, 'utf8');
      // Single-argument calls are the failure mode: the value silently
      // defaults to "full effort" for a student who does not need it.
      if (/remainingSyllabusHours\(\s*[^,)]+\s*\)/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the finish-date chooser is fed the repeater signals, not just coverage', () => {
    // The exact regression this file exists for. The screen builds its own
    // BlueprintPreviewInput, so it can go stale independently of the modal.
    const screen = readFileSync('src/app/student/onboarding/screens/screen-finish-date.tsx', 'utf8');
    expect(screen).toMatch(/is_repeater:\s*isRepeater/);
    expect(screen).toMatch(/last_year_percentile:\s*lastYearPercentile/);

    const modal = readFileSync('src/app/student/onboarding/onboarding-modal.tsx', 'utf8');
    expect(modal).toMatch(/isRepeater:\s*\(onboardingData\.is_repeater/);
    expect(modal).toMatch(/lastYearPercentile:\s*\(onboardingData\.last_year_percentile/);
    // The live blueprint preview above it must price identically, or the badge
    // and the date options disagree on the same screen.
    expect(modal).toMatch(/last_year_percentile:\s*onboardingData\.last_year_percentile/);
  });
});

describe('the 7-day schedule spends the same hours but clears more topics', () => {
  it('capacity fills the week; effort decides how far it gets', () => {
    // Worth pinning because the naive expectation is wrong. A repeater does
    // not study fewer hours this week — they study the same 4h/day. What
    // changes is how much syllabus those hours clear, because each topic
    // costs them less. If a future edit made the week SHORTER for a repeater,
    // it would be quietly stealing study time from them.
    const rows = ALL.map((topic) => ({ topic, status: 'not_started' }));
    const today = new Date('2026-08-08T06:00:00');
    const fresher = buildWeekPlan(rows, 6, today, 1, 7, 4);
    const repeater = buildWeekPlan(rows, 6, today, studentEffortMultiplier({ isRepeater: true, lastYearPercentile: 88 }), 7, 4);

    const hours = (p: { totalHours: number }[]) => p.reduce((s, d) => s + d.totalHours, 0);
    const topics = (p: { items: { topic: string }[] }[]) => new Set(p.flatMap((d) => d.items.map((i) => i.topic))).size;

    expect(hours(repeater)).toBe(hours(fresher));       // same time on the desk
    expect(topics(repeater)).toBeGreaterThan(topics(fresher)); // more ground covered
  });
});

describe('content is never scaled — only time is', () => {
  it('the topic count is identical for everyone', () => {
    // A repeater revises the same 46 topics. If effort ever started removing
    // topics, the coverage grid and the plan would describe different syllabi.
    expect(ALL.length).toBe(EXAM_UNIT_COUNT);
  });

  it('the preparation index denominator stays unscaled', () => {
    // evidence.ts divides earned hours by totalSyllabusHours(). That is a
    // "how much of CAT have you evidenced" percentage, not a time estimate —
    // scaling it would show a repeater 100% while topics remain untouched.
    const evidence = readFileSync('src/lib/evidence.ts', 'utf8');
    expect(evidence).toContain('const total = totalSyllabusHours();');
    expect(evidence).not.toMatch(/totalSyllabusHours\(\)\s*\*/);
  });
});
