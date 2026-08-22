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
// The clock (founder, 13 Aug): "start a timer as soon as they click Daily
// Pick — solve this in 90 secs — so they don't even think, they just read and
// start solving."
//
// 90s is the point: it is enough to actually solve a real CAT-level question
// and far too little to browse, second-guess or look anything up. The timer
// never blocks an answer — a student who takes 4 minutes still answers and
// still learns; they just do not get the in-time badge. A hard cutoff would
// turn a daily habit into a test you can fail, which is the fastest way to
// stop someone opening it tomorrow.
export const TARGET_SECONDS = 90;

// ── The clock must fit the question (founder, 13 Aug) ───────────────────────
// He solved a VARC summary in 31 of its 90 seconds: no rush felt, so no dare
// worth sharing — "if they didn't feel the rush of the clock, no one will
// share." Each question row carries target_seconds (default 90); TARGET_SECONDS
// above is only the fallback for rows and attempts from before this shipped.
//
// CALIBRATION RULE for anyone writing questions: a prepared student should
// need ~60–80% of the target — the founder's brief verbatim: "a bit tough to
// solve in 90 seconds but not too hard… it should take at least 1 minute."
// A clock nobody beats kills sharing as surely as one nobody feels:
//   QA    90s — multi-step computation earns the full minute and a half
//   DILR  90s — reading the setup is part of the solve
//   VARC  60s — reading is fast; elimination is the whole game
export function targetFor(row: { target_seconds?: number | null }): number {
  const t = Number(row.target_seconds);
  return Number.isFinite(t) && t >= 30 && t <= 600 ? t : TARGET_SECONDS;
}

export const SPLIT_MIN_ATTEMPTS = 20;


// ── What a challenge row is TESTING ─────────────────────────────────────────
//
// 'question' asks whether the student KNOWS something. The two radar kinds ask
// something a lecture series cannot teach and a repeater is usually missing:
// given four sets and forty minutes, which do you open, and which do you
// refuse. Same four-option mechanic, same clock, same attempts table — but a
// different faculty, and the whole reason for the marker is that we can ask
// later how a student does at selection versus content.
//
// Standing caution (founder, 22 Aug): we are COLLECTING this, not asserting
// it. Nothing yet shows that selection accuracy here predicts CAT percentile,
// and no surface may claim it does until the data says so.
export type ChallengeKind = 'question' | 'radar_first' | 'radar_discard';

export const RADAR_KINDS: ChallengeKind[] = ['radar_first', 'radar_discard'];

export function isRadar(kind: string | null | undefined): boolean {
  return kind === 'radar_first' || kind === 'radar_discard';
}

/** The label a radar drill wears, so a student knows they are being asked to
 *  DECIDE rather than to solve. Getting this wrong turns a selection drill
 *  into a question they think they failed. */
export function radarLabel(kind: string | null | undefined): string | null {
  if (kind === 'radar_first') return 'Set selection · which one first';
  if (kind === 'radar_discard') return 'Set selection · which one to drop';
  return null;
}

export interface ChallengeView {
  id: string;
  section: string;
  topic: string;
  /** What this row tests. Absent on rows written before kinds existed, which
   *  the default makes 'question' — the honest reading of those. */
  kind: ChallengeKind;
  question: string;
  options: string[];
  difficulty: string;
  /** This question's own clock — see targetFor(). */
  targetSeconds: number;
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
    /** How long they took. Null for attempts made before the clock shipped. */
    yourSeconds?: number | null;
    beatTheClock?: boolean | null;
    /** Share of timed attempts inside the target; null below the density gate. */
    inTimePct?: number | null;
  } | null;
}
