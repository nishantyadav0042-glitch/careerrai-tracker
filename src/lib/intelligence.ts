// Intelligence composition (LIS layers 2 + 5 + 10 assembled).
//
// The Constraint, Coaching-Decision and Performance engines are pure and
// independent, but the ORDER they compose in — Performance and Constraints feed
// the Decision — is itself a design choice we don't want drifting between the
// two callers that need it (the student plan API and the admin Student 360). So
// the composition lives here once; each caller gathers its own rows, normalises
// them into scalar inputs, and hands them in.

import { computeConstraints, type ConstraintProfile } from '@/lib/constraint-engine';
import { computePerformance, type Performance } from '@/lib/performance-engine';
import { decideToday, type Decision } from '@/lib/coach-decision';
import type { Blocker } from '@/lib/mission-engine';
import type { Phase } from '@/lib/routine-engine';

export interface StudentIntelligence {
  constraints: ConstraintProfile;
  performance: Performance;
  decision: Decision;
}

export interface IntelligenceInput {
  phase: Phase;
  // Consistency / constraint window (21 days).
  loggedDays: number;
  activeDays21: number;
  // Direction window (comparable 10-day halves).
  recentActive10: number;
  priorActive10: number;
  // Engine outputs already computed upstream.
  capacityTrust: 'input' | 'behaviour';
  capacityGapHours: number;
  completionRatio: number | null;
  tooMuchRatio: number;
  momentumScore: number;
  // Coverage snapshot (null when the student has declared nothing).
  coverage: { total: number; notStarted: number; confident: number } | null;
  // Shared behavioural signals.
  maxDaysSincePracticed: number | null;
  daysSincePendingMock: number | null;
  mocksTaken: number;
  weakestBaseline: number | null;
  blocker: Blocker | null;
  targetPercentile: number | null;
  weeksToExam: number | null;
  gapDays: number | null;
}

const CONSTRAINT_WINDOW = 21;
const DIRECTION_WINDOW = 10;

export function assembleIntelligence(inp: IntelligenceInput): StudentIntelligence {
  const notStartedRatio = inp.coverage && inp.coverage.total > 0 ? inp.coverage.notStarted / inp.coverage.total : null;
  const startedRatio = inp.coverage && inp.coverage.total > 0 ? (inp.coverage.total - inp.coverage.notStarted) / inp.coverage.total : null;
  const confidentRatio = inp.coverage && inp.coverage.total > 0 ? inp.coverage.confident / inp.coverage.total : null;

  const constraints = computeConstraints({
    windowDays: CONSTRAINT_WINDOW,
    loggedDays: inp.loggedDays,
    activeDays: inp.activeDays21,
    capacityTrust: inp.capacityTrust,
    capacityGapHours: inp.capacityGapHours,
    completionRatio: inp.completionRatio,
    tooMuchRatio: inp.tooMuchRatio,
    coverageNotStartedRatio: notStartedRatio,
    maxDaysSincePracticed: inp.maxDaysSincePracticed,
    daysSincePendingMock: inp.daysSincePendingMock,
    weakestBaseline: inp.weakestBaseline,
    blocker: inp.blocker,
  });

  const performance = computePerformance({
    windowDays: DIRECTION_WINDOW,
    activeDays: inp.recentActive10,
    activeDaysPrior: inp.priorActive10,
    momentumScore: inp.momentumScore,
    coverageStartedRatio: startedRatio,
    coverageConfidentRatio: confidentRatio,
    maxDaysSincePracticed: inp.maxDaysSincePracticed,
    mocksTaken: inp.mocksTaken,
    daysSincePendingMock: inp.daysSincePendingMock,
    targetPercentile: inp.targetPercentile,
    weeksToExam: inp.weeksToExam,
  });

  const decision = decideToday({
    phase: inp.phase,
    constraints,
    performance,
    daysSincePendingMock: inp.daysSincePendingMock,
    maxDaysSincePracticed: inp.maxDaysSincePracticed,
    mocksTaken: inp.mocksTaken,
    activeDays: inp.activeDays21,
    loggedDays: inp.loggedDays,
    completionRatio: inp.completionRatio,
    tooMuchRatio: inp.tooMuchRatio,
    gapDays: inp.gapDays,
  });

  return { constraints, performance, decision };
}

// A cheap momentum proxy from the two strongest signals (recency + consistency)
// so callers that don't already hold a full momentum score don't have to run
// the roster-wide loader just to feed Performance's 10% momentum weight.
export function momentumProxy(gapDays: number | null, activeDays21: number): number {
  const recency = gapDays == null ? 0
    : gapDays === 0 ? 40 : gapDays === 1 ? 33 : gapDays === 2 ? 26 : gapDays === 3 ? 18
    : gapDays <= 6 ? 10 : gapDays <= 13 ? 4 : 0;
  const consistency = Math.round((Math.min(activeDays21, 14) / 14) * 30);
  return Math.max(0, Math.min(100, Math.round(((recency + consistency) / 70) * 100)));
}
