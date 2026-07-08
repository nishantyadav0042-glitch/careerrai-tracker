// Student State V1 — one honest object every screen and Buddy view reads
// from, instead of scattered ad-hoc scores. Deliberately FOUR fields, not
// eight: Knowledge, Consistency, Momentum, and Risk are each traceable to
// real logged behavior already in this codebase. Retention, Testing-as-a-
// dimension, performance-Confidence, and Buddy-Readiness are NOT here —
// building them today would mean guessing at thresholds with zero outcome
// data to validate against, which is exactly the fabricated-number problem
// this app's brand voice has refused everywhere else. Add them later, for
// real, once there's data to earn them.
//
// Simple, explainable rules — no ML, no invented weights. Same discipline
// as every other engine in this codebase (routine-engine, mission-engine,
// prep-memory): a rule fires for a stated, auditable reason or it doesn't
// fire at all.

export type Momentum = 'accelerating' | 'steady' | 'slowing' | 'stalled';

// weeklyMinutes = [3 weeks ago, 2 weeks ago, last week], oldest first.
export function computeMomentum(weeklyMinutes: [number, number, number]): Momentum {
  const [w1, w2, w3] = weeklyMinutes;
  if (w1 === 0 && w2 === 0 && w3 === 0) return 'stalled';
  const d1 = w2 - w1;
  const d2 = w3 - w2;
  if (d2 > 0 && d1 >= 0) return 'accelerating';
  if (d2 < 0 && d1 <= 0) return 'slowing';
  return 'steady';
}

export type RiskLevel = 'low' | 'medium' | 'high';
export interface Risk {
  level: RiskLevel;
  reason: string | null;
}

export function computeRisk(input: {
  daysSinceLastActivity: number | null;
  priorConsistencyDays: number; // days studied in the 30 days before the current gap
  mockLatestPercentile: number | null;
  mockPreviousPercentile: number | null;
  emergencyRatio: number; // 0-1, emergency ("Less time today") days / days studied
}): Risk {
  const { daysSinceLastActivity, priorConsistencyDays, mockLatestPercentile, mockPreviousPercentile, emergencyRatio } = input;

  // The single strongest churn pattern: silence right after a real streak.
  if (daysSinceLastActivity != null && daysSinceLastActivity >= 5 && priorConsistencyDays >= 10) {
    return { level: 'high', reason: `${daysSinceLastActivity} days silent after a consistent stretch — this is the pattern most likely to end in dropping off` };
  }
  if (daysSinceLastActivity != null && daysSinceLastActivity >= 3) {
    return { level: 'medium', reason: `${daysSinceLastActivity} days since the last logged session` };
  }
  if (mockLatestPercentile != null && mockPreviousPercentile != null && mockLatestPercentile < mockPreviousPercentile - 5) {
    return { level: 'medium', reason: 'Last mock dropped more than 5 percentile points' };
  }
  if (emergencyRatio > 0.4) {
    return { level: 'medium', reason: 'Relying on "Less time today" mode most study days' };
  }
  return { level: 'low', reason: null };
}

export interface Signal {
  key: string;
  label: string;
}

// A small, real library — not the "50-100 patterns" wishlist. Each one only
// fires off data that's already logged; nothing here is inferred from a
// single data point.
export function detectSignals(input: {
  sectionGapDays: Partial<Record<'VARC' | 'DILR' | 'QA', number | null>>;
  sectionShare: Partial<Record<'VARC' | 'DILR' | 'QA', number>>; // 0-1 share of last-30-day study time
  emergencyRatio: number;
  revisionDue: number;
  revisionCompletedThisWeek: number;
}): Signal[] {
  const signals: Signal[] = [];

  for (const [section, gap] of Object.entries(input.sectionGapDays)) {
    if (gap != null && gap >= 5) {
      signals.push({ key: `avoid_${section}`, label: `Avoiding ${section} — ${gap} days untouched` });
    }
  }

  const dominant = Object.entries(input.sectionShare).find(([, share]) => (share ?? 0) > 0.7);
  if (dominant) {
    signals.push({ key: 'comfort_zone', label: `${dominant[0]} is over 70% of recent study time — comfort-zone pattern` });
  }

  if (input.emergencyRatio > 0.4) {
    signals.push({ key: 'emergency_overuse', label: '"Less time today" used most days — time management strain' });
  }

  if (input.revisionDue > 5 && input.revisionCompletedThisWeek === 0) {
    signals.push({ key: 'revision_neglect', label: `${input.revisionDue} topics overdue for revision, none revised recently` });
  }

  return signals;
}

export interface StudentState {
  knowledge: number; // 0-100 — % of the 46 exam topics past not_started
  consistency: number; // 0-100 — days studied / days in window
  momentum: Momentum;
  risk: Risk;
}
