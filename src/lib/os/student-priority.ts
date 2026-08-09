// ── Student priority: P0–P3, so the system tells you who to contact next ────
//
// Co-founder rule, 9 Aug: "Every student card should have a priority badge. P0
// revenue at risk, P1 hot sales lead, P2 engagement opportunity, P3 healthy.
// You never waste time deciding who to contact next — the system tells you."
//
// Pure and deterministic: given a few facts about a student, it returns exactly
// one priority and the reason for it. The classifier is the intelligence; the
// list page just sorts and badges by it. No student is P0 because they "look
// like" it — each tier has a precise condition, the same discipline the
// dashboard filters follow.

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface PriorityInput {
  isPremium: boolean;
  hasBuddy: boolean;
  /** A payment marked paid while the student is not premium — the sacred fault. */
  paymentStuck: boolean;
  /** Explicitly asked for a mentor at signup. */
  wantsBuddy: boolean;
  /** Active in the last 3 days (logged, or app-open). */
  activeRecently: boolean;
  /** Has built at least one study plan. */
  hasPlan: boolean;
  /** Days since last log; null if never logged. */
  daysSinceLog: number | null;
}

export interface PriorityVerdict {
  priority: Priority;
  reason: string;
}

const META: Record<Priority, { label: string; tone: 'red' | 'orange' | 'amber' | 'green' }> = {
  P0: { label: 'Revenue at risk', tone: 'red' },
  P1: { label: 'Hot sales lead', tone: 'orange' },
  P2: { label: 'Engagement', tone: 'amber' },
  P3: { label: 'Healthy', tone: 'green' },
};

export function priorityMeta(p: Priority) {
  return META[p];
}

/**
 * Classify one student. The order of checks IS the priority ranking — the first
 * condition that matches wins, so a paying student in trouble can never be
 * mislabelled a mere engagement opportunity.
 */
export function classifyStudent(s: PriorityInput): PriorityVerdict {
  // ── P0 — money already at risk. A paying student the product is failing. ──
  if (s.paymentStuck) {
    return { priority: 'P0', reason: 'Paid but premium not unlocked — fix now.' };
  }
  if (s.isPremium && !s.hasBuddy) {
    return { priority: 'P0', reason: 'Premium with no mentor — the thing they paid for.' };
  }

  // ── P1 — hot sales lead. Wants what we sell, and is warm enough to buy. ──
  if (!s.isPremium && s.wantsBuddy && s.activeRecently) {
    return {
      priority: 'P1',
      reason: s.hasPlan
        ? 'Asked for a mentor, active, has a plan — highest conversion odds.'
        : 'Asked for a mentor and active — call today.',
    };
  }

  // ── P2 — engagement opportunity. Using it, not yet a buyer. ──
  if (!s.isPremium && s.activeRecently) {
    return { priority: 'P2', reason: 'Active and free — a warm prospect to nurture.' };
  }
  if (s.daysSinceLog != null && s.daysSinceLog >= 4) {
    return { priority: 'P2', reason: `Going cold — ${s.daysSinceLog} days since a log.` };
  }

  // ── P3 — healthy. A premium student with a mentor, or a quietly-fine free one. ──
  return {
    priority: 'P3',
    reason: s.isPremium ? 'Premium, mentor assigned — served.' : 'Steady — nothing needed right now.',
  };
}
