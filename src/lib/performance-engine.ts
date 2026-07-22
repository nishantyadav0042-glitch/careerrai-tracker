// Performance Engine (LIS Layer 10) — the heartbeat.
//
// Not "hours" or "questions done." The question this layer answers is the only
// one that matters: **is this student moving toward their target percentile,
// and how fast?** That is Learning Velocity. Everything else on a dashboard is
// vanity if this number is flat.
//
// We do not yet have a calibrated percentile model (that needs mock-score
// history we're still accumulating), so v1 computes an honest *proxy*: a blend
// of the behaviours that provably precede percentile gains — consistent effort,
// syllabus coverage advancing, revision kept healthy, mocks being taken and
// analysed. Each sub-metric is 0-100 and explainable; Learning Velocity is their
// weighted blend, with a direction (accelerating / steady / stalling) read from
// whether recent effort is above or below the student's own prior baseline.
//
// Labelled a proxy on purpose — when real percentile tracking lands it replaces
// the blend without changing the interface the dashboards read.

export interface PerfMetric { key: string; label: string; value: number; note: string }

export interface Performance {
  learningVelocity: number;               // 0-100 composite (proxy)
  direction: 'accelerating' | 'steady' | 'stalling';
  metrics: PerfMetric[];                  // the components, for the heartbeat view
  projectedConfidence: 'high' | 'medium' | 'low'; // trust in "on track for target"
  note: string;
}

export interface PerformanceInput {
  windowDays: number;
  activeDays: number;                     // productive days in the window
  activeDaysPrior: number;                // productive days in the PRIOR window (for direction)
  momentumScore: number;                  // 0-100 from momentum.ts
  coverageStartedRatio: number | null;    // 0-1 of syllabus begun
  coverageConfidentRatio: number | null;  // 0-1 of syllabus at confident/mastered
  maxDaysSincePracticed: number | null;   // worst section revision recency
  mocksTaken: number;                     // in a recent window
  daysSincePendingMock: number | null;    // unanalysed mock overhang
  targetPercentile: number | null;
  weeksToExam: number | null;
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export function computePerformance(inp: PerformanceInput): Performance {
  const metrics: PerfMetric[] = [];

  // Consistency (the strongest leading indicator of eventual percentile).
  const consistency = clamp((inp.activeDays / (inp.windowDays * 0.7)) * 100);
  metrics.push({ key: 'consistency', label: 'Consistency', value: consistency, note: `${inp.activeDays} active days in ${inp.windowDays}` });

  // Coverage — how much of the exam is actually in hand.
  const coverage = inp.coverageStartedRatio != null
    ? clamp(inp.coverageStartedRatio * 60 + (inp.coverageConfidentRatio ?? 0) * 40)
    : 0;
  if (inp.coverageStartedRatio != null) {
    metrics.push({ key: 'coverage', label: 'Coverage', value: coverage, note: `${Math.round(inp.coverageStartedRatio * 100)}% started, ${Math.round((inp.coverageConfidentRatio ?? 0) * 100)}% confident` });
  }

  // Revision health — retention protects gains; staleness erodes them.
  const revisionHealth = inp.maxDaysSincePracticed == null
    ? 70
    : clamp(100 - Math.max(0, inp.maxDaysSincePracticed - 3) * 12);
  metrics.push({ key: 'revision', label: 'Revision health', value: revisionHealth, note: inp.maxDaysSincePracticed == null ? 'No stale sections' : `Worst section ${inp.maxDaysSincePracticed}d cold` });

  // Mock readiness — mocks taken, minus a penalty for letting one go unanalysed.
  const mockBase = Math.min(inp.mocksTaken, 4) * 22;
  const mockPenalty = inp.daysSincePendingMock != null ? Math.min(inp.daysSincePendingMock, 5) * 6 : 0;
  const mockReadiness = clamp(mockBase - mockPenalty);
  metrics.push({ key: 'mock', label: 'Mock readiness', value: mockReadiness, note: `${inp.mocksTaken} recent mock${inp.mocksTaken === 1 ? '' : 's'}${inp.daysSincePendingMock != null ? `, 1 unanalysed` : ''}` });

  // Learning Velocity — weighted blend. Consistency and coverage carry the most
  // weight because they most directly precede a percentile move.
  const learningVelocity = clamp(
    consistency * 0.35 +
    coverage * 0.25 +
    revisionHealth * 0.20 +
    mockReadiness * 0.10 +
    inp.momentumScore * 0.10
  );

  // Direction — this student vs their OWN recent past, not an absolute bar.
  let direction: Performance['direction'] = 'steady';
  if (inp.activeDays > inp.activeDaysPrior + 1) direction = 'accelerating';
  else if (inp.activeDays < inp.activeDaysPrior - 1) direction = 'stalling';

  // Projected confidence — how much to trust "on track for target." Low when
  // the runway is short and velocity is weak; the honest hedge, not a promise.
  let projectedConfidence: Performance['projectedConfidence'] = 'medium';
  if (learningVelocity >= 65 && direction !== 'stalling') projectedConfidence = 'high';
  else if (learningVelocity < 40 || (inp.weeksToExam != null && inp.weeksToExam < 8 && learningVelocity < 55)) projectedConfidence = 'low';

  const dirWord = direction === 'accelerating' ? 'accelerating' : direction === 'stalling' ? 'losing pace' : 'holding steady';
  const targetBit = inp.targetPercentile ? ` toward ${inp.targetPercentile}%ile` : '';
  const note = `Learning Velocity ${learningVelocity}/100 and ${dirWord}${targetBit}. Consistency and coverage move this the most — protect them first.`;

  return { learningVelocity, direction, metrics, projectedConfidence, note };
}
