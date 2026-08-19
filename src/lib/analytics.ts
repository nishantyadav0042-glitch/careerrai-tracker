import type { DailyReport, AnalyticsSummary } from '@/types';
import { durationIsUnknown } from './check-in';

type Trend = 'up' | 'down' | 'stable';

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * The same mean, but honest about an empty set.
 *
 * `avg([]) === 0` is the exact shape that fired J2's sleep flag at students who
 * had logged nothing, and it is why 24 students are currently reported as
 * studying 0h when the truth is that we never measured them. Nothing to average
 * is not an average of nothing.
 */
function avgOrNull(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function trend(values: number[]): Trend {
  if (values.length < 2) return 'stable';
  const recent = avg(values.slice(-3));
  const earlier = avg(values.slice(0, Math.max(1, values.length - 3)));
  if (recent > earlier + 0.3) return 'up';
  if (recent < earlier - 0.3) return 'down';
  return 'stable';
}

export function computeSummary(reports: DailyReport[], period: number): AnalyticsSummary {
  const mockReports = reports.filter((r) => r.mock_taken && r.total_accuracy != null);
  const mockScores = mockReports.map((r) => r.total_accuracy as number);

  // Q3 — average over the days we could MEASURE. A day whose duration was
  // never collected is dropped from numerator and denominator alike; a real
  // zero stays, because "didn't study" is a measurement. The pair decides
  // (G6), never the source alone: source-only overstates by 29%.
  const measured = reports.filter((r) => !durationIsUnknown(r));
  const avgStudy = avgOrNull(measured.map((r) => r.study_duration));
  const totalStudy = reports.reduce((s, r) => s + r.study_duration, 0);
  const avgConfidence = avg(reports.map((r) => r.confidence));
  const avgStress = avg(reports.map((r) => r.stress));
  const avgSleep = avg(reports.map((r) => r.sleep_quality));
  const avgEnergy = avg(reports.map((r) => r.overall_energy));
  const avgMockScore = avg(mockScores);

  const consistency = (reports.length / period) * 25;
  // G7 ruling 1 — an unmeasured duration takes the NEUTRAL half of its
  // component, not the worst. Scoring 0 punished a student for a question we
  // never finished asking, and it was inconsistent with the line below, where
  // a student with no mock has always been given a neutral 12 rather than a 0.
  //
  // The neutral lives HERE, in the scoring layer, and nowhere else: avgStudy
  // stays null and no hours are written back. J6-A forbids inventing the
  // measurement; it does not forbid declining to punish its absence.
  const STUDY_NEUTRAL = 12.5;
  const studyScore = avgStudy === null ? STUDY_NEUTRAL : Math.min(25, (avgStudy / 6) * 25);
  const mockScore = mockScores.length ? Math.min(25, (avgMockScore / 100) * 25) : 12;

  // G7 ruling 2 — moodScore is OUT of the composite.
  //
  // Measured, not assumed: across 110 real reports in one week, confidence,
  // stress and overall_energy each held exactly ONE distinct value (4, 2, 4),
  // because upsert_log_and_streak hard-codes them on every write. moodScore's
  // minimum and maximum were both 20.0 — a constant offset wearing the costume
  // of a signal, which is the same defect J2 retired the sleep/burnout FLAGS
  // for while the SCORE went on reading the same fabricated fields.
  //
  // The mood DATA is untouched and still returned (avgConfidence, avgStress,
  // avgSleep, avgEnergy). This is a composition decision, not a wellbeing-data
  // retirement — the J2/J3 distinction, kept deliberately.
  //
  // SCALE: dropping a 25-point component leaves 75 scorable points while the
  // admin UI renders "{score}/100". Reporting a score that cannot reach its own
  // stated maximum would be a fresh instance of exactly what this workstream
  // removes — and it would be a de-facto threshold change harsher than any
  // explicit one, since every student would lose ~20 points at once. So the
  // score is expressed as a percentage of what can actually be scored. The
  // 70/50 thresholds are NOT touched here (ruling 3); they are measured and
  // ruled separately.
  const SCORABLE_POINTS = 75; // consistency 25 + study 25 + mock 25
  const overallScore = Math.round(((consistency + studyScore + mockScore) / SCORABLE_POINTS) * 100);

  let band: AnalyticsSummary['band'];
  if (overallScore >= 70) band = 'On track';
  else if (overallScore >= 50) band = 'Needs nudging';
  else band = 'Needs intervention';

  // J2 (18 Aug) — burnout and sleep red flags RETIRED, not re-thresholded.
  //
  // Both depended on evidence CareerRai does not collect: upsert_log_and_streak
  // hard-codes stress=2 and sleep_quality=3 on every write, so neither rule
  // could ever fire from a real measurement. avgStress >= 4 genuinely never
  // fired — 0 notifications, ever, and it is mathematically impossible while
  // stress is pinned below 4.
  //
  // avgSleep < 3 DID fire — 26 times in production — but not from a real
  // signal. `avg([])` returns 0 for a student with zero reports in the
  // window, and 0 < 3. Every one of those 26 firings coincided exactly with
  // "Fewer than 4 reports this week": a student who logged nothing was told
  // their SLEEP was the problem. Retiring the rule loses no real signal — the
  // going-quiet flag already, correctly, covers every one of those weeks —
  // and it removes a second, independent defect (absence of evidence read as
  // a specific, alarming number) along with the fabricated-input one.
  //
  // This is a retirement, not a repair: CareerRai currently has no
  // trustworthy burnout or sleep-quality detection, because these signals are
  // not meaningfully collected from real students. See ENGINEERING-MEMORY.
  // avgStress/avgSleep remain computed above — moodScore still needs them,
  // and that is a separate scoring-scale decision, not this gate.
  const redFlags: string[] = [];
  // Never flag a number we do not have. This is the J2 lesson, third time.
  if (avgStudy !== null && avgStudy < 3) redFlags.push('Avg study below 3 hrs/day — momentum dropping');
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
