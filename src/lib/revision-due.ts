import { TOPIC_METADATA } from './topics-constants';
import { COVERED_STATUSES, isCovered } from './coverage-status';

// ── IS THIS TOPIC DUE FOR REVISION? ONE ANSWER ──────────────────────────────
//
// Founder, 14 Aug: "One canonical rule, consumed everywhere."
//
// The 14 Aug sweep found SIX implementations of this question, with three
// different comparisons:
//
//   topic-selector      daysSince - freq * multiplier   (graded, archetype-adjusted)
//   prep-memory         daysSince > freq * multiplier   (adjusted)
//   decision-engine     daysSince >= round(freq) + 1    (RAW — no multiplier)
//   weekly-diagnosis    daysSince > freq                (RAW)
//   next-action         daysSince >= 14                 (flat, every topic)
//   evidence            freq * 2                        (double cadence)
//
// The damage is specific, not theoretical. decision-engine sends the push that
// says "time to revise X"; prep-memory paints the screen that push links to.
// One applies the archetype multiplier and the other does not, so for a
// repeater (x0.7) and a working professional (x1.4) the notification and the
// screen disagree — a student is told to revise something the app itself shows
// as not yet due. decision-engine's own comment says matching the visible
// source of truth "is not optional here", and points at a symbol that no
// longer exists in the codebase.
//
// THE ARCHETYPE MULTIPLIER IS PART OF THE RULE, not a planner-only refinement.
// A repeater relearns and forgets faster; a working professional's scarcer
// week means a topic is not stale as quickly. Any surface that drops it is
// answering a different question from the one the student sees.
//
// Two shapes, one rule:
//   isRevisionDue  — the boolean every display and notification asks for
//   overdueDays    — the graded amount the planner ranks by
// The boolean is exactly `overdueDays > 0`, so a screen can never say "not
// due" about a topic the planner is actively prioritising for being overdue.

/** How overdue a topic is, in days, clamped. 0 = not due. */
export const MAX_OVERDUE_DAYS = 10;

export interface RevisionInput {
  topic: string;
  /** Days since the topic was last practised, or null if never. */
  daysSince: number | null;
  /**
   * The archetype cadence multiplier (archetypeRevisionMultiplier): 0.7 for a
   * repeater, 1.4 for a working professional, 1.0 otherwise.
   */
  multiplier?: number;
}

/**
 * The cadence for a topic, after the archetype adjustment.
 * Null when the topic has no metadata — an unknown topic is never "due",
 * because we have nothing to be due against.
 */
export function revisionCadenceDays(topic: string, multiplier = 1): number | null {
  const meta = TOPIC_METADATA[topic];
  if (!meta || typeof meta.revisionFrequencyDays !== 'number') return null;
  return meta.revisionFrequencyDays * multiplier;
}

/**
 * How many days past due, clamped to MAX_OVERDUE_DAYS.
 *
 * Clamped because the planner ranks by this and an abandoned topic would
 * otherwise dominate every other signal forever — being 200 days overdue is
 * not twenty times more urgent than being 10.
 */
export function overdueDays(input: RevisionInput): number {
  const { daysSince, multiplier = 1 } = input;
  if (daysSince == null) return 0;
  const cadence = revisionCadenceDays(input.topic, multiplier);
  if (cadence == null) return 0;
  return Math.min(Math.max(daysSince - cadence, 0), MAX_OVERDUE_DAYS);
}

/**
 * The boolean every display and notification asks for.
 *
 * Deliberately defined AS `overdueDays > 0` rather than as its own comparison,
 * so a screen can never disagree with the plan about the same topic.
 */
export function isRevisionDue(input: RevisionInput): boolean {
  return overdueDays(input) > 0;
}

/**
 * Statuses for which revision is a meaningful question at all.
 *
 * This IS the covered set, not a coincidentally-equal list: you can only be due
 * to revise something you have studied through at least once. It used to spell
 * the three names out, which meant the covered rule existed here as well as in
 * the ten other places the 14 Aug sweep found — and a sixth status added above
 * exam_ready would have been revisable in some of them and not others.
 */
export const REVISABLE_STATUSES = COVERED_STATUSES;

export function isRevisableStatus(status: string | null | undefined): boolean {
  return isCovered(status);
}
