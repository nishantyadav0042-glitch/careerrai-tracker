import type { DueReason } from '@/lib/call-queue';

// ── WHICH OF THE TWO BUSINESS GOALS IS THIS CALL FOR? ───────────────────────
//
// SALES-OS.md §4. The company hired two people for exactly two outcomes —
// retention/activation and conversion — and the counsellor must always know
// which one they are on before they dial. A call that opens with "aap Buddy le
// lijiye" to a student who stopped studying three days ago is the wrong call
// even if the student is commercially warm.
//
// ONE STUDENT, ONE CARD. A student can be both at once (stopped logging AND
// abandoned a checkout), and that must never produce two tasks — two
// counsellors' worth of work aimed at one person, or the same person called
// twice in a morning. So the card carries a PRIMARY objective and, when the
// other one also applies, a SECONDARY line that gives the counsellor the second
// half of the conversation.
//
// WHY COMMERCIAL SIGNAL WINS THE PRIMARY SLOT. Not because money matters more
// than a student studying — MISSION.md is explicit that it does not — but
// because commercial intent is PERISHABLE and retention need is not. A student
// who opened checkout yesterday is in a state that expires within days; a
// student who has been slipping for a week will still be slipping tomorrow.
// The retention conversation still happens, as the secondary context, in the
// same call.
//
// WHAT THIS IS NOT: a score, a rank, or a temperature. It is a label that says
// what the conversation is for. Ranking is call-queue's job and stays there.

export type SalesObjective = 'retention' | 'conversion';

/**
 * The lanes that exist to get a student studying again.
 *
 * `new_never_logged` is a RETENTION lane, and deliberately so — it is
 * activation, the most valuable version of retention we have. 737 of 975
 * students have never logged once (production, 29 Aug 2026), so treating
 * activation as a conversion opportunity would point both counsellors at the
 * wrong conversation for three-quarters of the base.
 */
const RETENTION_LANES: ReadonlySet<string> = new Set<DueReason>([
  'going_cold', 'broken_streak', 'new_never_logged',
  // Attention (2 Sep 2026): opened the app and did not log, or tapped a
  // notification. The student reached for the product and stopped short of
  // studying — activation work, which is retention.
  'attention',
]);

/** The lanes that exist because the student showed commercial intent. */
const CONVERSION_LANES: ReadonlySet<string> = new Set<DueReason>(['conversion']);

export interface ObjectiveInput {
  /** The lane the queue put them in. */
  lane: DueReason;
  /**
   * A LIVE commercial signal — an order created and not paid, or an intent-door
   * crossing. Distinct from `lane === 'conversion'`, because a student can be
   * surfaced by a retention lane while still holding a perishable money signal.
   */
  hasCommercialSignal: boolean;
  /** A retention need: silent, slipping, or never activated. */
  hasRetentionNeed: boolean;
}

export interface ObjectiveVerdict {
  primary: SalesObjective;
  /** NULL when only one objective applies — most cards. */
  secondary: SalesObjective | null;
  /** Why this is the primary, in the counsellor's words. Never empty. */
  primaryReason: string;
}

/**
 * Decide what today's call is for.
 *
 * Deterministic and total: every input produces a verdict, and the verdict
 * always carries a reason. There is no "unknown objective" card, because a card
 * whose purpose we cannot state should not have been dealt.
 */
export function classifyObjective(input: ObjectiveInput): ObjectiveVerdict {
  const { lane, hasCommercialSignal, hasRetentionNeed } = input;

  // A promise the student made outranks any classification we invent: the
  // objective is whatever the last conversation was about, and the queue
  // already carries that in the follow-up. Treated as conversion only when a
  // commercial signal is actually present.
  if (hasCommercialSignal) {
    return {
      primary: 'conversion',
      secondary: hasRetentionNeed ? 'retention' : null,
      primaryReason: 'A live commercial signal expires within days — retention need does not.',
    };
  }

  if (CONVERSION_LANES.has(lane)) {
    return {
      primary: 'conversion',
      secondary: hasRetentionNeed ? 'retention' : null,
      primaryReason: 'The student reached for the paid option themselves.',
    };
  }

  if (RETENTION_LANES.has(lane)) {
    return {
      primary: 'retention',
      secondary: null,
      primaryReason: lane === 'new_never_logged'
        ? 'The student has never started — activation is the whole job here.'
        : 'The student is losing the habit the product depends on.',
    };
  }

  // Callbacks, retries, follow-ups and never-contacted students. The objective
  // follows the need we can actually see rather than defaulting to a pitch:
  // opening with an offer to somebody who has simply gone quiet is how a
  // helpful call becomes a sales call.
  return {
    primary: hasRetentionNeed ? 'retention' : 'conversion',
    secondary: null,
    primaryReason: hasRetentionNeed
      ? 'No commercial signal, but the student has stopped studying.'
      : 'No retention concern — this is a commercial conversation.',
  };
}

/** Display label for the card. Two words, never a sentence. */
export const OBJECTIVE_LABEL: Record<SalesObjective, string> = {
  retention: 'Retention',
  conversion: 'Conversion',
};
