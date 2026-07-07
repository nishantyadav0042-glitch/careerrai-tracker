// Deterministic, explainable "Today's Mission" scoring — same additive-score
// pattern as buddy-match.ts's rankBuddies(), not a nested rule tree. Every
// signal that fires is visible in the winning mission's reasons; nothing is
// hidden behind an opaque "decision." Add a new signal later by adding one
// more contributor function and one more candidate — never by branching
// existing ones, so growth stays linear instead of combinatorial.

export interface MissionSignal {
  active: boolean;
  points: number;
  // Shown to both student and buddy only when active — the reason IS the
  // evidence, never a separate "why" layered on top of an opaque score.
  reason: string | null;
}

export interface MissionCandidate {
  id: string;
  label: string;
  signals: MissionSignal[];
}

export interface ScoredMission {
  id: string;
  label: string;
  score: number;
  reasons: string[];
}

export function scoreMission(candidate: MissionCandidate): ScoredMission {
  const active = candidate.signals.filter((s) => s.active);
  return {
    id: candidate.id,
    label: candidate.label,
    score: active.reduce((sum, s) => sum + s.points, 0),
    reasons: active.map((s) => s.reason).filter((r): r is string => r != null),
  };
}

// First candidate wins ties — callers should order candidates by their own
// priority preference for equal scores (mock analysis first, in practice).
export function pickMission(candidates: MissionCandidate[]): ScoredMission {
  const scored = candidates.map(scoreMission);
  return scored.reduce((best, next) => (next.score > best.score ? next : best));
}

// --- Signal builders — each is a small, independently testable pure function ---

// A mock was logged (daily_reports.mock_taken) but no matching mock_debriefs
// row exists yet for that date. Score rises the longer it sits unanalyzed —
// this is the concrete "mock plateau" case: the data is there, nobody has
// looked at it yet.
export function mockPendingAnalysisSignal(daysSincePendingMock: number | null): MissionSignal {
  if (daysSincePendingMock == null) return { active: false, points: 0, reason: null };
  const points = 40 + Math.min(Math.max(daysSincePendingMock - 1, 0), 3) * 10;
  const dayLabel = daysSincePendingMock === 0 ? 'today' : daysSincePendingMock === 1 ? 'yesterday' : `${daysSincePendingMock} days ago`;
  return { active: true, points, reason: `Mock from ${dayLabel} — unanalyzed` };
}

// The weakest section's revision — this is the existing default the routine
// engine already leads with. Always eligible (mirrors current behavior); the
// mock-analysis signal above is what can now outrank it when it's overdue.
// revisionFrequencyDays defaults to 3 (the prior flat constant) for callers
// that don't have topic metadata to hand; today/route.ts passes the actual
// weak topic's TOPIC_METADATA.revisionFrequencyDays so a topic that decays
// fast (e.g. Reading Comprehension, 4 days) is flagged overdue sooner than
// one that doesn't (e.g. Vocabulary, 10 days) — not one threshold for all.
export function revisionOverdueSignal(section: string, daysSinceLastPracticed: number | null, revisionFrequencyDays = 3): MissionSignal {
  const base = 25;
  if (daysSinceLastPracticed == null) {
    return { active: true, points: base, reason: `${section} — never practiced` };
  }
  if (daysSinceLastPracticed === 0) {
    return { active: true, points: base, reason: `${section} — keep momentum` };
  }
  const overdueBonus = Math.min(Math.max(daysSinceLastPracticed - revisionFrequencyDays, 0), 4) * 5;
  return {
    active: true,
    points: base + overdueBonus,
    reason: `${section} — ignored ${daysSinceLastPracticed} day${daysSinceLastPracticed === 1 ? '' : 's'}`,
  };
}

// Always-present floor so there's never a tie-breaking gap — a quiet day
// with no overdue signal should still resolve to "stick to the plan," not
// an empty mission.
export function baselineRoutineSignal(): MissionSignal {
  return { active: true, points: 15, reason: null };
}

export type Blocker = 'inconsistency' | 'dont_know_what' | 'mock_anxiety' | 'time_wasting';
export type MissionCandidateId = 'mock-analysis' | 'weak-revision' | 'routine-baseline';

// The cold-start prior: before any real behavioral signal exists (no mock
// history, no revision recency), the one onboarding tap about what's
// actually blocking a student is the only evidence available. Modest and
// additive on purpose — this never outweighs a strong real signal (a mock
// sitting unanalyzed for 3 days still wins), it only breaks early ties in a
// direction the student told us mattered. mock_anxiety is the one negative
// case: it doesn't add pressure toward more mock work, it makes that
// candidate need a stronger real signal to win, and (deliberately) carries
// no reason bullet — a bias against something isn't evidence for something.
const BLOCKER_BIAS: Record<Blocker, Partial<Record<MissionCandidateId, { points: number; reason: string | null }>>> = {
  inconsistency: {
    'routine-baseline': { points: 15, reason: "You said staying consistent is the real fight — showing up today counts more than intensity" },
  },
  dont_know_what: {
    'weak-revision': { points: 10, reason: "You said not knowing what to study is the blocker — this is the one thing to focus on" },
  },
  mock_anxiety: {
    'mock-analysis': { points: -10, reason: null },
  },
  time_wasting: {
    'mock-analysis': { points: 10, reason: "You said time management is the issue — analysis builds strategy faster than raw practice volume" },
  },
};

export function blockerBiasSignal(blocker: Blocker | null, candidateId: MissionCandidateId): MissionSignal {
  const bump = blocker ? BLOCKER_BIAS[blocker]?.[candidateId] : undefined;
  if (!bump) return { active: false, points: 0, reason: null };
  return { active: true, points: bump.points, reason: bump.reason };
}
