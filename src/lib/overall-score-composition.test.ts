import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSummary } from './analytics';
import type { DailyReport } from '@/types';

// ── G7: neutral prior for unknown duration; moodScore out of the composite ──
//
// RULING 1 -- an unmeasured duration takes the NEUTRAL half of its component
// (12.5 of 25), not the worst. Scoring 0 punished a student for a question we
// never finished asking, and contradicted the mock component, which has always
// given a neutral 12 when there is no mock.
//
// RULING 2 -- moodScore is out. Across production, confidence/stress/energy
// each hold one distinct value because the RPC hard-codes them on every write
// (312 of 342 rows carry the manufactured confidence 4), so moodScore's min
// and max were both 20.0. A constant offset is not a signal.
//
// RULING 3 -- thresholds untouched. That is exactly WHY the remainder is
// rescaled: dropping 25 points without rescaling would silently cost every
// student up to 25 points, which is a harsher de-facto threshold change than
// any explicit one.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const day = (o: Partial<DailyReport>): DailyReport => ({
  id: 'r', student_id: 's', report_date: '2026-08-01',
  study_duration: 0, topics_covered: [], mood_emoji: '💪', mock_taken: false,
  notes: null, created_at: '', updated_at: '', confidence: 4, stress: 2,
  overall_energy: 4, sleep_quality: 3, total_accuracy: null,
  ...o,
} as DailyReport);

describe('an unmeasured duration is not punished', () => {
  it('scores the neutral half, not zero', () => {
    // 7 of 7 days logged (consistency 25), all unmeasured, no mocks (12).
    const unmeasured = Array.from({ length: 7 }, () => day({ day_outcome: 'studied', study_duration: 0 }));
    const s = computeSummary(unmeasured, 7);
    expect(s.avgStudy, 'the measurement itself is still unknown').toBeNull();
    // (25 consistency + 12.5 study + 12 mock) / 75 * 100
    expect(s.overallScore).toBe(Math.round(((25 + 12.5 + 12) / 75) * 100));
  });

  it('a measured low average still scores low — the neutral is not a floor', () => {
    const low = Array.from({ length: 7 }, () => day({ day_outcome: 'studied', study_duration: 1 }));
    const s = computeSummary(low, 7);
    expect(s.avgStudy).toBe(1);
    // study = (1/6)*25 ≈ 4.17, which is well below the 12.5 neutral.
    expect(s.overallScore).toBeLessThan(Math.round(((25 + 12.5 + 12) / 75) * 100));
  });

  it('the neutral never writes hours back', () => {
    const s = computeSummary([day({ day_outcome: 'studied', study_duration: 0 })], 7);
    expect(s.avgStudy).toBeNull();
    expect(s.totalStudy).toBe(0);
  });
});

describe('mood is out of the composite but not out of the data', () => {
  it('the wellbeing averages are still computed and returned', () => {
    const s = computeSummary([day({ confidence: 5, stress: 1, overall_energy: 5 })], 7);
    expect(s.avgConfidence).toBe(5);
    expect(s.avgStress).toBe(1);
    expect(s.avgEnergy).toBe(5);
  });

  it('moving mood does NOT move the score', () => {
    const base = Array.from({ length: 5 }, () => day({ day_outcome: 'studied', study_duration: 3 }));
    const happy = base.map((r) => ({ ...r, confidence: 5, stress: 1, overall_energy: 5 }));
    const bleak = base.map((r) => ({ ...r, confidence: 1, stress: 5, overall_energy: 1 }));
    expect(computeSummary(happy, 7).overallScore).toBe(computeSummary(bleak, 7).overallScore);
  });

  it('the composite no longer contains a mood term', () => {
    const s = read('src/lib/analytics.ts');
    expect(s, 'moodScore must not be summed into overallScore')
      .not.toMatch(/overallScore\s*=\s*Math\.round\([^)]*moodScore/);
  });
});

describe('the score can still reach its stated maximum', () => {
  it('a perfect week scores 100, not 79', () => {
    // Without rescaling this would top out at 75 while the UI says "/100".
    const perfect = Array.from({ length: 7 }, () => day({
      day_outcome: 'studied', study_duration: 6, mock_taken: true, total_accuracy: 100,
    }));
    expect(computeSummary(perfect, 7).overallScore).toBe(100);
  });

  it('"On track" is reachable at all — it was not before', () => {
    const strong = Array.from({ length: 7 }, () => day({
      day_outcome: 'studied', study_duration: 6, mock_taken: true, total_accuracy: 100,
    }));
    expect(computeSummary(strong, 7).band).toBe('On track');
  });

  it('the thresholds themselves are untouched (ruling 3)', () => {
    const s = read('src/lib/analytics.ts');
    expect(s).toMatch(/overallScore >= 70/);
    expect(s).toMatch(/overallScore >= 50/);
  });

  it('the scorable total is stated explicitly, not left implicit', () => {
    expect(read('src/lib/analytics.ts')).toMatch(/SCORABLE_POINTS = 75/);
  });
});
