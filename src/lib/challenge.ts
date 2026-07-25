// ── Daily Challenge shared logic ────────────────────────────────────────────
// The one place that answers "which day's challenge is active right now?" so
// the card, the attempt route and the admin scheduler can never disagree —
// a second copy of this rule would be the study-day bug all over again.

/**
 * Challenges unlock at 08:00 IST (founder decision, 25 Jul). Before 8am the
 * PREVIOUS day's set stays active — a student opening at 6am finishes
 * yesterday's question rather than staring at a locked card, and the 1am
 * night-peak crowd is naturally still on yesterday's challenge, consistent
 * with the 3am study-day boundary.
 */
export function activeChallengeDate(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const unlockPassed = ist.getUTCHours() >= 8;
  if (!unlockPassed) ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10);
}

/** Community split shown only past this many attempts — below it, a
 *  percentage is noise wearing a suit (the no-invented-numbers rule). */
export const SPLIT_MIN_ATTEMPTS = 20;


export interface ChallengeView {
  id: string;
  section: string;
  topic: string;
  question: string;
  options: string[];
  difficulty: string;
  /** Set when a student contributed it — their public credit. */
  contributorName: string | null;
  /** The student's own attempt, if any. Null until answered. */
  attempt: {
    choice: number;
    isCorrect: boolean;
    correctIndex: number;
    explanation: string;
    /** % of students who got it right; null below SPLIT_MIN_ATTEMPTS. */
    communityCorrectPct: number | null;
    attemptCount: number;
    /** Where this topic sits in the student's own plan. */
    coverageStatus: string;
  } | null;
}
