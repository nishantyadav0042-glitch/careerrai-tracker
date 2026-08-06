// Coaching Decision Engine (LIS Layer 5) — the mentor's one call for today.
//
// This sits ABOVE the plan. Before "what topics," a real coach makes a single
// higher-altitude decision: *given everything I know about this student right
// now, what is the highest-leverage thing for them to do today?* The plan is the
// IMPLEMENTATION of that decision, not the decision itself.
//
//   "A mock's been sitting unanalysed — don't study new, mine it first."
//   "You're forgetting faster than you're learning — revise, no new concepts."
//   "You're running on empty — one light block, protect the streak, come back."
//   "The fight for you is just showing up — one honest task beats a perfect plan."
//   "You're ahead — pull revision forward, add a stretch set."
//
// Distinct from `decision-engine.ts`, which decides which NOTIFICATION to send
// (the notification-layer primitive the LIS spine calls a seed). This is the
// in-app coaching call the student reads at the top of the plan.
//
// It does NOT rewrite the task list here (that stays the deterministic routine
// engine's job, already sized by Capacity + Adaptation). It sets the FRAME the
// student reads first and the Mission picks within — one clear call, never a
// wall of equally-weighted advice. Deterministic priority ladder: the most
// leverage-critical true condition wins, so the output is always exactly one
// decision with its evidence.
//
// Consumes the other engines' outputs (Constraint top, Performance direction,
// Capacity, Adaptation) rather than re-deriving raw signals — this is the layer
// where they compose.

import type { Phase } from '@/lib/routine-engine';
import type { ConstraintProfile } from '@/lib/constraint-engine';
import type { Performance } from '@/lib/performance-engine';

export type DecisionType =
  | 'analyze_mock' | 'revise_dont_learn' | 'take_a_mock'
  | 'recover' | 'rebuild_consistency' | 'push_ahead' | 'follow_plan';

export interface Decision {
  type: DecisionType;
  headline: string;                 // the call, in the student's ear
  why: string;                      // the evidence behind it
  microAction: string;              // the one concrete thing to do first
  tone: 'urgent' | 'firm' | 'gentle' | 'proud' | 'neutral';
}

export interface DecisionInput {
  phase: Phase;
  constraints: ConstraintProfile;
  performance: Performance;
  daysSincePendingMock: number | null;
  maxDaysSincePracticed: number | null;
  mocksTaken: number;               // recent window
  activeDays: number;               // productive days in window
  loggedDays: number;
  completionRatio: number | null;   // Adaptation: plan finished ÷ planned
  tooMuchRatio: number;             // Adaptation
  gapDays: number | null;           // days since last full completion (catch-up)
}

// Priority ladder — first true rung wins. Ordered by leverage: fix what's
// actively bleeding percentile before optimising what's already working.
export function decideToday(inp: DecisionInput): Decision {
  // 1. A logged mock nobody has analysed is the single most wasted asset in CAT
  //    prep — the learning is already paid for, just not collected.
  if (inp.daysSincePendingMock != null && inp.daysSincePendingMock >= 1) {
    return {
      type: 'analyze_mock',
      headline: 'Mine your last mock before anything new.',
      why: `You have a mock from ${inp.daysSincePendingMock === 1 ? 'yesterday' : `${inp.daysSincePendingMock} days ago`} that was never analysed. Every unread mock is percentile you already earned and left on the table.`,
      microAction: 'Open it, log your 3 costliest mistakes, then start the plan.',
      tone: 'firm',
    };
  }

  // 2. Burnout guard — chronic over-load. Protect the habit over the syllabus;
  //    a broken streak costs more than a light day.
  if (inp.completionRatio != null && inp.completionRatio <= 0.5 && inp.tooMuchRatio >= 0.5) {
    return {
      type: 'recover',
      headline: 'Go light today — on purpose.',
      why: 'The last several days have run heavier than you can sustain. Pushing again risks the one thing that actually predicts your score: still being here in November.',
      microAction: 'One 20-minute revision block on a topic you already know. That’s a full win today.',
      tone: 'gentle',
    };
  }

  // 3. Consistency is the top bottleneck — the fight is showing up, not intensity.
  if (inp.constraints.top?.key === 'consistency' || (inp.loggedDays >= 5 && inp.activeDays <= inp.loggedDays * 0.4)) {
    return {
      type: 'rebuild_consistency',
      headline: 'One honest task. That’s the whole job today.',
      why: 'Your data says the real fight right now is showing up, not how hard each day is. A perfect plan you skip loses to a small plan you finish — every time.',
      microAction: 'Do just the priority task. Tick it. Come back tomorrow.',
      tone: 'gentle',
    };
  }

  // 4. Forgetting faster than learning — a section has gone cold. Revise before
  //    stacking new concepts on a decaying base.
  if (inp.maxDaysSincePracticed != null && inp.maxDaysSincePracticed >= 8) {
    return {
      type: 'revise_dont_learn',
      headline: 'Revise today — no new concepts.',
      why: `A section has sat untouched for ${inp.maxDaysSincePracticed} days. Learning new material on top of what you're already forgetting is pouring water into a leaking bucket.`,
      microAction: 'Redo problems you once solved in the stalest section — retrieval, not re-reading.',
      tone: 'firm',
    };
  }

  // 5. Mock season with no recent mock — the #1 signal in the back half.
  if ((inp.phase === 'intensive' || inp.phase === 'revision') && inp.mocksTaken === 0) {
    return {
      type: 'take_a_mock',
      headline: 'Take a timed mock today — skip the drills.',
      why: 'This close to the exam, a mock teaches more than a day of topic practice: it trains stamina, selection and nerves at once. You haven’t taken one recently.',
      microAction: 'Block one timed sectional under exam conditions. Analyse it tomorrow.',
      tone: 'firm',
    };
  }

  // 6. Ahead and strong — reward it, pull work forward instead of coasting.
  if (inp.performance.learningVelocity >= 70 && inp.performance.direction === 'accelerating' && inp.gapDays != null && inp.gapDays <= 1) {
    return {
      type: 'push_ahead',
      headline: 'You’re ahead. Let’s bank it.',
      why: `Learning Velocity ${inp.performance.learningVelocity}/100 and rising, and you’re current on the plan. This is the moment to build a buffer, not to cruise.`,
      microAction: 'Finish the plan, then pull one revision topic forward from tomorrow.',
      tone: 'proud',
    };
  }

  // 7. Default — the plan is the right call; nothing is bleeding.
  return {
    type: 'follow_plan',
    headline: 'Today’s plan is the right move.',
    why: inp.constraints.top
      ? `Nothing’s on fire — your plan already leans into your biggest gap (${inp.constraints.top.label.toLowerCase()}).`
      : 'Nothing’s on fire — steady, deliberate reps are exactly what today calls for.',
    microAction: 'Start with the priority task while your focus is freshest.',
    tone: 'neutral',
  };
}
