// Constraint Engine (LIS Layer 2) — the ranked bottleneck profile.
//
// The layer every EdTech skips. We do NOT ask "hours available?" and allocate
// topics against it. We ask **"what is actually preventing 99?"** and rank the
// bottlenecks, so Planning becomes constraint-optimisation instead of topic
// division. A student whose real bottleneck is consistency does not need a
// denser plan — a denser plan makes it worse.
//
// Deterministic and explainable, like every engine in this stack: each
// constraint's severity is computed from behaviour we already log (or, cold, the
// one onboarding tap about what's blocking them), and carries the evidence that
// produced it. A constraint with no signal is OMITTED, never shown as a
// misleading zero.
//
// This is a v1 across the constraints we have honest signals for today —
// consistency, time, knowledge, revision, speed, mock-anxiety, discipline,
// accuracy. Confidence/energy accrue once their signals (per-question accuracy,
// energy logs) are wired; the architecture ranks whatever is present.

import type { Blocker } from '@/lib/mission-engine';
import { HEAVY_COMPLETION_RATIO } from '@/lib/adaptation-engine';

export type ConstraintKey =
  | 'consistency' | 'time' | 'knowledge' | 'revision'
  | 'speed' | 'mock_anxiety' | 'discipline' | 'accuracy';

export interface Constraint {
  key: ConstraintKey;
  label: string;
  severity: number;                       // 0-100, higher = more blocking
  source: 'behaviour' | 'onboarding' | 'blend';
  note: string;                           // the evidence, human-readable
}

export interface ConstraintProfile {
  ranked: Constraint[];                   // severity desc, only real signals
  top: Constraint | null;                 // the single biggest bottleneck
}

export interface ConstraintInput {
  windowDays: number;
  loggedDays: number;                     // days with any report in the window
  activeDays: number;                     // days they actually studied (>0h)
  capacityTrust: 'input' | 'behaviour';   // Capacity Engine verdict
  capacityGapHours: number;               // claimed − sustainable (>0 = squeezed)
  completionRatio: number | null;         // Adaptation Engine: plan finished ÷ planned
  tooMuchRatio: number;                   // share of plan-fit taps that were "too much"
  coverageNotStartedRatio: number | null; // 0-1 of syllabus never begun
  maxDaysSincePracticed: number | null;   // worst section's revision recency
  daysSincePendingMock: number | null;    // a mock logged but never analysed
  weakestBaseline: number | null;         // lowest section %ile (accuracy proxy)
  blocker: Blocker | null;                // the onboarding self-report
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

const LABEL: Record<ConstraintKey, string> = {
  consistency: 'Consistency',
  time: 'Time',
  knowledge: 'Syllabus coverage',
  revision: 'Revision',
  speed: 'Speed',
  mock_anxiety: 'Mock anxiety',
  discipline: 'Focus / discipline',
  accuracy: 'Accuracy',
};

// The onboarding blocker maps to a constraint so the profile is never empty on
// day one — a modest seed that real behaviour overtakes as it accrues.
const BLOCKER_TO_CONSTRAINT: Record<Blocker, ConstraintKey> = {
  inconsistency: 'consistency',
  dont_know_what: 'knowledge',
  mock_anxiety: 'mock_anxiety',
  time_wasting: 'discipline',
};

export function computeConstraints(inp: ConstraintInput): ConstraintProfile {
  const out: Constraint[] = [];
  const push = (key: ConstraintKey, severity: number, source: Constraint['source'], note: string) => {
    if (severity <= 0) return;
    out.push({ key, label: LABEL[key], severity: clamp(severity), source, note });
  };

  const enoughBehaviour = inp.loggedDays >= 5;

  // Consistency — the master constraint. Target ~70% of days active; the
  // shortfall is the severity. Only a behavioural read once we have the days.
  if (enoughBehaviour) {
    const target = inp.windowDays * 0.7;
    const sev = (1 - Math.min(1, inp.activeDays / target)) * 100;
    if (sev >= 20) push('consistency', sev, 'behaviour', `Studied ${inp.activeDays} of the last ${inp.loggedDays} logged days`);
  }

  // Time — real only when behaviour proves the claimed hours don't exist.
  if (inp.capacityTrust === 'behaviour' && inp.capacityGapHours > 0) {
    push('time', 40 + inp.capacityGapHours * 15, 'behaviour', `Logs ${inp.capacityGapHours}h/day below what was entered — time is genuinely scarce`);
  }

  // Speed — can't clear the priced volume in the hours available, or repeatedly
  // says the day was too much. Read straight off the completion ratio now: the
  // plan is no longer trimmed to hide this, so the shortfall is visible here
  // instead of being quietly absorbed.
  if (inp.completionRatio != null && inp.completionRatio < HEAVY_COMPLETION_RATIO) {
    push('speed', 35 + (1 - inp.completionRatio) * 120, inp.tooMuchRatio > 0 ? 'blend' : 'behaviour',
      `Only ~${Math.round(inp.completionRatio * 100)}% of the plan is getting finished — solving pace is the limiter, not effort`);
  } else if (inp.tooMuchRatio >= 0.5) {
    push('speed', 30 + inp.tooMuchRatio * 40, 'behaviour', `Logged "too much" on ${Math.round(inp.tooMuchRatio * 100)}% of recent days`);
  }

  // Knowledge — how much syllabus is still untouched.
  if (inp.coverageNotStartedRatio != null && inp.coverageNotStartedRatio > 0.2) {
    push('knowledge', inp.coverageNotStartedRatio * 90, 'behaviour', `${Math.round(inp.coverageNotStartedRatio * 100)}% of the syllabus not started yet`);
  }

  // Revision — a section going stale (relative to a ~5-day healthy cadence).
  if (inp.maxDaysSincePracticed != null && inp.maxDaysSincePracticed > 5) {
    push('revision', 30 + Math.min(inp.maxDaysSincePracticed - 5, 10) * 6, 'behaviour', `A section hasn't been touched in ${inp.maxDaysSincePracticed} days`);
  }

  // Mock anxiety — a mock sitting unanalysed is the behavioural tell; the
  // onboarding tap seeds it before any mock exists.
  if (inp.daysSincePendingMock != null && inp.daysSincePendingMock >= 2) {
    push('mock_anxiety', 30 + Math.min(inp.daysSincePendingMock, 6) * 6, 'behaviour', `A mock has sat unanalysed for ${inp.daysSincePendingMock} days — avoidance, not oversight`);
  }

  // Accuracy — lowest baseline as a coarse proxy until per-question data lands.
  if (inp.weakestBaseline != null && inp.weakestBaseline < 60) {
    push('accuracy', (60 - inp.weakestBaseline) * 1.4, 'behaviour', `Weakest section baseline sits at ${inp.weakestBaseline} — accuracy needs work`);
  }

  // Cold-start / reinforcement from the onboarding self-report.
  if (inp.blocker) {
    const key = BLOCKER_TO_CONSTRAINT[inp.blocker];
    const existing = out.find((c) => c.key === key);
    if (existing) {
      existing.severity = clamp(existing.severity + 12);
      existing.source = 'blend';
      existing.note += ' · they flagged this at signup too';
    } else if (!enoughBehaviour) {
      // Only lead with the self-report while behaviour is thin.
      push(key, 45, 'onboarding', 'What they told us was blocking them at signup');
    } else {
      push(key, 25, 'onboarding', 'Flagged at signup; behaviour hasn’t confirmed it yet');
    }
  }

  out.sort((a, b) => b.severity - a.severity);
  return { ranked: out, top: out[0] ?? null };
}
