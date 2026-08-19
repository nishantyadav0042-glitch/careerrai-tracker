import type { DailyReport, AnalyticsSummary } from '@/types';
import { durationIsUnknown } from './check-in';

type Trend = 'up' | 'down' | 'stable';

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function trend(values: number[]): Trend {
  if (values.length < 2) return 'stable';
  const recent = avg(values.slice(-3));
  const earlier = avg(values.slice(0, Math.max(1, values.length - 3)));
  if (recent > earlier + 0.3) return 'up';
  if (recent < earlier - 0.3) return 'down';
  return 'stable';
}

/**
 * The same mean, but honest about an empty set.
 *
 * `avg([]) === 0` is the exact shape that fired J2's sleep flag at students who
 * had logged nothing. Nothing to average is not an average of nothing.
 */
function avgOrNull(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

export function computeSummary(reports: DailyReport[], period: number): AnalyticsSummary {
  const mockReports = reports.filter((r) => r.mock_taken && r.total_accuracy != null);
  const mockScores = mockReports.map((r) => r.total_accuracy as number);

  // Q3 -- average over the days we could MEASURE. A day whose duration was
  // never captured leaves numerator and denominator alike; a declared zero
  // stays, because "I didn't study" is a measurement and dropping it would let
  // a student dodge every flag by reporting their bad days honestly.
  // Measured against production: excludes 65 rows across 40 students and moves
  // the average from 2.13 to 2.84 h/day.
  const measured = reports.filter((r) => !durationIsUnknown(r));
  const avgStudy = avgOrNull(measured.map((r) => r.study_duration));
  const totalStudy = reports.reduce((s, r) => s + r.study_duration, 0);
  const avgConfidence = avg(reports.map((r) => r.confidence));
  const avgStress = avg(reports.map((r) => r.stress));
  const avgSleep = avg(reports.map((r) => r.sleep_quality));
  const avgEnergy = avg(reports.map((r) => r.overall_energy));
  const avgMockScore = avg(mockScores);

  const consistency = (reports.length / period) * 25;
  // UNRULED GAP, recorded rather than invented: with avgStudy unknown there is
  // no decided answer for what this 0-25 component should contribute, so it
  // keeps its existing arithmetic and scores 0. G7 owns that ruling; Q3 must
  // not pre-empt it. overallScore is admin/founder-facing, so no student sees
  // a fabricated number as a result of this line.
  const studyScore = Math.min(25, ((avgStudy ?? 0) / 6) * 25);
  const mockScore = mockScores.length ? Math.min(25, (avgMockScore / 100) * 25) : 12;
  const moodScore = Math.min(25, ((avgConfidence + (6 - avgStress) + avgEnergy) / 15) * 25);
  const overallScore = Math.round(consistency + studyScore + mockScore + moodScore);

  let band: AnalyticsSummary['band'];
  if (overallScore >= 70) band = 'On track';
  else if (overallScore >= 50) band = 'Needs nudging';
  else band = 'Needs intervention';

  const redFlags: string[] = [];
  if (avgStress >= 4) redFlags.push(`Avg stress ${avgStress.toFixed(1)}/5 — burnout risk`);
  // Never flag a number we do not have. The J2 lesson, fourth appearance: this
  // flag feeds check-red-flags, which reaches the student as an intervention,
  // so a fabricated average becomes a real message.
  if (avgStudy !== null && avgStudy < 3) redFlags.push('Avg study below 3 hrs/day — momentum dropping');
  if (avgSleep < 3) redFlags.push('Sleep quality below 3/5 — affects retention');
  if (reports.length < 4 && period === 7) redFlags.push('Fewer than 4 reports this week — going quiet');
  if (mockScores.length >= 2 && mockScores[mockScores.length - 1] < mockScores[0]) {
    redFlags.push('Mock accuracy declining');
  }

  return {
    avgStudy,
    totalStudy,
    totalMocks: mockReports.length,
    avgMockScore,
    avgConfidence,
    avgStress,
    avgSleep,
    avgEnergy,
    daysSubmitted: reports.length,
    period,
    studyTrend: trend(measured.map((r) => r.study_duration)),
    confidenceTrend: trend(reports.map((r) => r.confidence)),
    stressTrend: trend(reports.map((r) => r.stress)),
    overallScore,
    band,
    redFlags,
  };
}
