import type { StudentDna, Factor, Confidence } from '@/lib/student-dna';

// The Product Brain.
//
// NOT a tree of if/else. Every possible action is a scored CANDIDATE: it says
// whether it applies to this student's state, and what its expected value is
// right now. We evaluate all candidates and surface the single highest-value
// one (plus alternatives). "Do NOT message this student" is itself a candidate
// (`hold`) that simply out-scores a low-value push for a happy user — so the
// founder's "→ do not send a notification" emerges from the math, never a
// hardcoded rule. Adding a new action = adding a candidate, not editing a branch.
//
// EXPLAINABLE BY CONSTRUCTION (founder, 24 Jul): every candidate quotes the
// SAME factors that drove the underlying DNA score it's reacting to — the "why"
// is never a separate free-text guess, it's a pointer into student-dna.ts's own
// explanation for that metric, so it can never drift from the number.

export type Channel = 'in_app' | 'push' | 'ai' | 'human' | 'suppress';

export interface Action {
  id: string;
  label: string;
  channel: Channel;
  impact: number;          // 0-100 expected value for THIS student, right now
  confidence: Confidence;
  why: string;              // plain-language justification
  factors: Factor[];        // the exact contributing factors (from the DNA explanation)
  expectedImpact: string;   // business-impact statement if this action is taken
}

export interface NextBestAction {
  top: Action;
  ranked: Action[];
}

function sig(d: StudentDna): { currentStreak: number; daysSinceActivity: number; ageDays: number; logDays30: number } {
  const s = (d.signals ?? {}) as Record<string, number>;
  return {
    currentStreak: s.currentStreak ?? 0,
    daysSinceActivity: s.daysSinceActivity ?? 0,
    ageDays: s.ageDays ?? 0,
    logDays30: s.logDays30 ?? 0,
  };
}

interface Candidate {
  id: string;
  label: string;
  channel: Channel;
  applies: (d: StudentDna) => boolean;
  build: (d: StudentDna) => Omit<Action, 'id' | 'label' | 'channel'>;
}

const CANDIDATES: Candidate[] = [
  {
    id: 'convert_now',
    label: 'Convert now — high buying intent',
    channel: 'in_app',
    applies: (d) => d.purchase_intent != null && d.purchase_intent >= 40,
    build: (d) => {
      const e = d.explanations.purchase_intent;
      return {
        impact: d.purchase_intent ?? 0, confidence: e.confidence,
        why: `Purchase intent ${d.purchase_intent}: ${e.summary}`,
        factors: e.positives, expectedImpact: e.impactHint,
      };
    },
  },
  {
    id: 'winback_human',
    label: 'Win back — personal outreach',
    channel: 'human',
    applies: (d) => d.churn_risk >= 70 && d.consistency > 0,
    build: (d) => {
      const e = d.explanations.churn_risk;
      return {
        impact: d.churn_risk, confidence: e.confidence,
        why: `Churn risk ${d.churn_risk} after real engagement: ${e.summary}`,
        factors: e.positives, expectedImpact: e.impactHint,
      };
    },
  },
  {
    id: 'activate_first_value',
    label: 'Activation nudge — never reached value',
    channel: 'in_app',
    applies: (d) => d.activation < 75 && d.journey_stage !== 'dormant',
    build: (d) => {
      const e = d.explanations.activation;
      return {
        impact: clamp(60 + (75 - d.activation) / 2), confidence: e.confidence,
        why: `Activation ${d.activation}: ${e.summary}`,
        factors: e.negatives, expectedImpact: e.impactHint,
      };
    },
  },
  {
    id: 'reengage_dormant',
    label: 'Reactivation — dormant',
    channel: 'human',
    applies: (d) => d.journey_stage === 'dormant',
    build: (d) => {
      const e = d.explanations.churn_risk;
      return {
        impact: 40, confidence: e.confidence,
        why: `Dormant ${sig(d).daysSinceActivity}d. One well-timed, DIFFERENT message — never the same reminder that already failed.`,
        factors: e.positives, expectedImpact: 'Reactivation odds drop fast after 14+ quiet days — this is close to the last realistic window',
      };
    },
  },
  {
    id: 'celebrate',
    label: 'Positive reinforcement',
    channel: 'push',
    applies: (d) => d.momentum >= 70 || sig(d).currentStreak >= 3,
    build: (d) => {
      const e = d.explanations.momentum;
      return {
        impact: clamp(30 + d.momentum / 5), confidence: e.confidence,
        why: `Momentum ${d.momentum}: ${e.summary}`,
        factors: e.positives, expectedImpact: e.impactHint,
      };
    },
  },
  {
    id: 'hold',
    label: 'Hold — do not message',
    channel: 'suppress',
    applies: () => true, // the always-available "do nothing" baseline
    build: (d) => {
      const habitualOrPremium = d.journey_stage === 'habitual' || d.journey_stage === 'premium';
      return {
        impact: habitualOrPremium ? 38 : 12,
        confidence: 'medium',
        why: habitualOrPremium
          ? `Doing well on their own (${d.journey_stage}, consistency ${d.consistency}) — over-messaging a consistent user only causes fatigue.`
          : 'No high-value action right now — don\'t spend a message. Re-evaluate on their next event.',
        factors: [{ label: `Journey stage: ${d.journey_stage}`, weight: 0, evidence: `consistency ${d.consistency}, churn risk ${d.churn_risk}` }],
        expectedImpact: habitualOrPremium ? 'Silence here protects long-term notification responsiveness' : 'Neutral — nothing to gain by messaging now',
      };
    },
  },
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Closed-loop learning (founder, 24 Jul): "last 200 times I recommended X, N
// purchased, M ignored — my confidence just changed." This is that mechanic.
// ActionPerformance is computed by the reconcile-decisions cron from REAL
// resolved outcomes (decision_log.business_impact), never invented — a rule
// with too few resolved outcomes (n < MIN_TRACK_RECORD) is left untouched, so
// a new/rare action's rule-based confidence isn't drowned out by noise.
export interface ActionPerformance { n: number; successRate: number }
const MIN_TRACK_RECORD = 20;

function applyTrackRecord(a: Action, perf?: ActionPerformance): Action {
  if (!perf || perf.n < MIN_TRACK_RECORD) return a;
  const pct = Math.round(perf.successRate * 100);
  const empirical: Confidence = perf.successRate >= 0.5 ? 'high' : perf.successRate >= 0.25 ? 'medium' : 'low';
  // The track record can only ever LOWER confidence below what the rule
  // claimed, never inflate it — a rule still has to justify itself on its own
  // logic; empirical evidence is a brake, not an amplifier.
  const rank: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
  const confidence = rank[empirical] < rank[a.confidence] ? empirical : a.confidence;
  return {
    ...a, confidence,
    why: `${a.why} Track record: this recommendation worked ${pct}% of the time over the last ${perf.n} tries.`,
  };
}

export function computeNextBestAction(d: StudentDna, performance?: Record<string, ActionPerformance>): NextBestAction {
  const ranked = CANDIDATES
    .filter((c) => c.applies(d))
    .map((c) => applyTrackRecord({ id: c.id, label: c.label, channel: c.channel, ...c.build(d) }, performance?.[c.id]))
    .sort((a, b) => b.impact - a.impact);
  return { top: ranked[0], ranked: ranked.slice(0, 4) };
}

// ── Semantic milestone events ──
// Emitted ONLY on a real state transition (prev → next), so downstream systems
// react to meaningful change, not raw taps.
export interface PrevDna {
  churn_risk: number | null;
  purchase_intent: number | null;
  consistency: number | null;
  journey_stage: string | null;
  signals: Record<string, number> | null;
}

export interface Milestone { milestone: string; meta: Record<string, unknown> }

export function detectMilestones(prev: PrevDna | null, next: StudentDna): Milestone[] {
  const out: Milestone[] = [];
  const ps = (prev?.signals ?? {}) as Record<string, number>;
  const ns = sig(next);
  const meta = { churn_risk: next.churn_risk, stage: next.journey_stage, consistency: next.consistency, purchase_intent: next.purchase_intent };
  const add = (m: string) => out.push({ milestone: m, meta });

  if ((prev?.churn_risk ?? 0) < 70 && next.churn_risk >= 70) add('student_became_at_risk');
  if ((prev?.churn_risk ?? 100) >= 70 && next.churn_risk < 40) add('student_recovered_from_churn');
  if (prev?.journey_stage && prev.journey_stage !== 'dormant' && next.journey_stage === 'dormant') add('student_went_dormant');
  if (prev?.journey_stage && prev.journey_stage !== 'habitual' && prev.journey_stage !== 'premium' && next.journey_stage === 'habitual') add('student_became_engaged');
  if (prev?.journey_stage && prev.journey_stage !== 'premium' && next.journey_stage === 'premium') add('student_became_premium');
  if ((prev?.purchase_intent ?? 0) < 40 && (next.purchase_intent ?? 0) >= 40) add('student_crossed_purchase_threshold');
  if ((ps.currentStreak ?? 0) < 7 && ns.currentStreak >= 7) add('student_completed_7_day_streak');
  if ((ps.ageDays ?? 0) < 7 && ns.ageDays >= 7 && ns.logDays30 > 0) add('student_completed_first_week');
  if ((prev?.consistency ?? 0) < 80 && next.consistency >= 80 && ns.logDays30 >= 18) add('student_became_power_user');

  return out;
}
