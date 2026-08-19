import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSummary } from './analytics';
import type { DailyReport } from '@/types';

// ── G7 — what UNKNOWN contributes to a composite score ──────────────────────
//
// Founder rulings (18 Aug), implemented here and ONLY these:
//   1. Unknown duration -> NEUTRAL study component (12.5 of 25). Not 0, and not
//      a fabricated hours value — the neutral lives in the SCORE layer only,
//      avgStudy stays null in the evidence layer (J6-A).
//   2. moodScore is removed from the composite. The underlying mood DATA and
//      its averages stay — this is a score-composition decision, not a
//      wellbeing-data retirement (the J2/J3 distinction).
//   3. The 70 / 50 thresholds are NOT touched. Measure first, rule separately.
//   4. momentum.ts is not touched at all.
//
// WHY moodScore GOES: measured, not inferred. Across 110 real reports in the
// last 7 days, confidence / stress / overall_energy each had EXACTLY ONE
// distinct value (4, 2, 4) — upsert_log_and_streak hard-codes them — so
// moodScore's min and max were both 20.0. A constant is an offset, not a signal.
//
// SCALE DECISION I MADE AND AM FLAGGING: removing a 25-point component leaves a
// 75-point maximum, while the admin UI renders "{score}/100". Shipping a score
// that cannot reach its own stated maximum is the exact class of defect this
// workstream exists to remove, and it would ALSO be a de-facto threshold change
// far harsher than any explicit one — every student would drop ~20 points at
// once. So the remaining components are expressed as a percentage of what can
// actually be scored. The 70/50 numbers are untouched; both distributions are
// reported for the threshold ruling.

const row = (over: Partial<DailyReport>): DailyReport => ({
  id: 'x', student_id: 's', report_date: '2026-08-10', study_duration: 0,
  topics_covered: [], mock_taken: false, notes: null, mood_emoji: '💪',
  confidence: 4, stress: 2, sleep_quality: 3, overall_energy: 4,
  ...over,
} as DailyReport);

const unknownDay = (d: string) => row({
  report_date: d, study_duration: 0, day_outcome: 'studied', study_duration_source: 'not_collected',
} as Partial<DailyReport>);

const realZeroDay = (d: string) => row({
  report_date: d, study_duration: 0, day_outcome: 'not_studied', study_duration_source: 'not_collected',
} as Partial<DailyReport>);

const studiedDay = (d: string, h: number) => row({
  report_date: d, study_duration: h, day_outcome: 'studied', study_duration_source: 'credited',
} as Partial<DailyReport>);

const week = (mk: (d: string) => DailyReport) =>
  ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16'].map(mk);

describe('ruling 1 — unknown duration takes the NEUTRAL study component', () => {
  it('scores strictly better than a measured zero, and strictly worse than measured hours', () => {
    const unknown = computeSummary(week(unknownDay), 7).overallScore;
    const zero = computeSummary(week(realZeroDay), 7).overallScore;
    const full = computeSummary(week((d) => studiedDay(d, 6)), 7).overallScore;
    expect(unknown, 'never measured must beat measured-nothing').toBeGreaterThan(zero);
    expect(unknown, 'and must not beat actually studying').toBeLessThan(full);
  });

  it('the neutral is exactly half the component — the same shape mockScore already uses', () => {
    // Full consistency both times, so the only difference is the study term:
    // 12.5 (neutral) vs 25 (a measured 6h). The gap is 12.5 of 75 scored points.
    const unknown = computeSummary(week(unknownDay), 7).overallScore;
    const full = computeSummary(week((d) => studiedDay(d, 6)), 7).overallScore;
    expect(full - unknown).toBe(Math.round((12.5 / 75) * 100));
  });

  it('a REAL zero is still scored as zero — measuring nothing is not the same as not measuring', () => {
    const zero = computeSummary(week(realZeroDay), 7);
    const unknown = computeSummary(week(unknownDay), 7);
    expect(zero.avgStudy).toBe(0);
    expect(unknown.avgStudy).toBeNull();
    expect(zero.overallScore).toBeLessThan(unknown.overallScore);
  });

  it('NO fabricated hours reach the evidence layer — avgStudy stays null', () => {
    // The neutral is a SCORING device. J6-A forbids inventing the measurement.
    const s = computeSummary(week(unknownDay), 7);
    expect(s.avgStudy).toBeNull();
    expect(s.totalStudy).toBe(0);
  });
});

describe('ruling 2 — moodScore leaves the composite, the mood data stays', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/analytics.ts'), 'utf8');

  it('the composite no longer adds moodScore', () => {
    expect(src).not.toMatch(/overallScore\s*=[^;]*moodScore/);
  });

  it('the underlying averages are still computed and still returned', () => {
    // Ruling: a score-composition decision, NOT a wellbeing-data retirement.
    const s = computeSummary(week((d) => studiedDay(d, 4)), 7);
    for (const k of ['avgConfidence', 'avgStress', 'avgSleep', 'avgEnergy'] as const) {
      expect(typeof s[k], k).toBe('number');
    }
  });

  it('a constant component cannot move anyone — proven by construction', () => {
    // Every real row carries the RPC's hard-coded 4/2/4, so moodScore was 20.0
    // for everyone. Varying those fields must now change nothing.
    const normal = computeSummary(week((d) => studiedDay(d, 4)), 7).overallScore;
    const odd = computeSummary(
      week((d) => row({ ...studiedDay(d, 4), confidence: 1, stress: 5, overall_energy: 1 } as Partial<DailyReport>)),
      7,
    ).overallScore;
    expect(odd).toBe(normal);
  });
});

describe('ruling 3 — the thresholds are NOT touched in this gate', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/analytics.ts'), 'utf8');

  it('70 and 50 are unchanged', () => {
    expect(src).toMatch(/overallScore >= 70[\s\S]*?'On track'/);
    expect(src).toMatch(/overallScore >= 50[\s\S]*?'Needs nudging'/);
  });

  it('the score still spans 0-100 so "/100" in the admin UI stays true', () => {
    const best = computeSummary(week((d) => ({ ...studiedDay(d, 8), mock_taken: true, total_accuracy: 100 } as DailyReport)), 7);
    expect(best.overallScore).toBeLessThanOrEqual(100);
    const worst = computeSummary([realZeroDay('2026-08-10')], 7);
    expect(worst.overallScore).toBeGreaterThanOrEqual(0);
  });
});

describe('ruling 4 — momentum.ts is untouched', () => {
  it('still takes no duration input and counts distinct log days', () => {
    const m = readFileSync(join(process.cwd(), 'src/lib/momentum.ts'), 'utf8');
    expect(m, 'momentum must never learn about duration').not.toContain('study_duration');
    expect(m).toContain('activeDays14');
    expect(m, 'and it must not import the duration authority either')
      .not.toContain('durationIsUnknown');
  });
});
