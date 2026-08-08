import { SIX_PROMISES } from '@/components/six-promises';

// ── What we did for you, said out loud, on a cadence ────────────────────────
//
// Founder, 8 Aug: put the claims at the first moment the student opens the app,
// ask for their commitment in return, highlight that it is free — and repeat it
// every two or three days, because retention needs telling, not one screen at
// signup.
//
// The six-promise screen already covers the first open. This module covers the
// repeat, and it deliberately does NOT repeat the same advertisement. The
// strongest version of "here is what we do for you" is not a claim at all — it
// is a COUNT of what we actually did, from their own data:
//
//   "We built you 14 daily plans. That is 14 mornings you did not spend
//    deciding what to study."
//
// A student can check that against their own memory. A slogan they cannot check
// is the thing they learn to scroll past — which is precisely how the six
// promises would die if we simply showed them again every third day.
//
// So the rotation is: proof, proof, promise. Two measured statements about
// their own week, then one reminder of the deal. When a student is brand new
// and there is nothing to count yet, only the promise is available, and it says
// so honestly rather than counting to zero.

/** Every third day. Frequent enough to be remembered, rare enough to be read. */
export const VALUE_PROOF_INTERVAL_DAYS = 3;

export interface ValueProofInput {
  /** Daily plans we generated for them (daily_routines rows). */
  plansBuilt: number;
  /** Topics we are holding coverage state for. */
  topicsRemembered: number;
  /** Revision prompts we raised before they forgot. */
  revisionsFlagged: number;
  /** Reminders actually delivered. */
  remindersSent: number;
  /** Days they logged study — used to address them honestly, never to shame. */
  daysLogged: number;
  /** Days since signup, so a day-one account is not told about "this week". */
  daysSinceSignup: number;
  /** Rotates the message so the same one is not shown twice running. */
  rotation: number;
}

export interface ValueProof {
  kind: 'proof' | 'promise';
  headline: string;
  body: string;
  /** The one thing we ask back. Always the same thing, deliberately. */
  ask: string;
}

/**
 * The hours claim, stated as arithmetic rather than as a boast.
 *
 * The six-promise screen tells a student they lose "about an hour a day"
 * deciding, planning and remembering. This is that same number, applied only to
 * days we DID build them a plan — so it can never claim credit for a day we did
 * nothing. Rounded down, because an overstated saving is the easiest possible
 * thing for a student to disbelieve.
 */
export function hoursGivenBack(plansBuilt: number): number {
  return Math.floor(plansBuilt * 1);
}

export function buildValueProof(input: ValueProofInput): ValueProof {
  const ask = 'You do one thing. Study. We keep doing the rest — free.';

  // Nothing to count yet. Say the deal, and do not dress up zeros as progress.
  const nothingMeasured =
    input.plansBuilt === 0 && input.topicsRemembered === 0 && input.remindersSent === 0;
  if (nothingMeasured || input.daysSinceSignup < 2) {
    return {
      kind: 'promise',
      headline: 'Six things we do. One thing you do.',
      body: `${SIX_PROMISES.length} jobs are ours — your plan, what to study today, remembering everything, revision timing, fixing the plan when life happens, and keeping you on track. All free.`,
      ask,
    };
  }

  // proof, proof, promise
  const slot = ((input.rotation % 3) + 3) % 3;

  if (slot === 0) {
    const hours = hoursGivenBack(input.plansBuilt);
    return {
      kind: 'proof',
      headline: `${input.plansBuilt} plans built for you`,
      body: hours >= 1
        ? `That is ${input.plansBuilt} morning${input.plansBuilt === 1 ? '' : 's'} you did not spend deciding what to study — roughly ${hours} hour${hours === 1 ? '' : 's'} back in your day.`
        : `That is ${input.plansBuilt} morning${input.plansBuilt === 1 ? '' : 's'} you did not spend deciding what to study.`,
      ask,
    };
  }

  if (slot === 1) {
    const parts: string[] = [];
    if (input.topicsRemembered > 0) parts.push(`${input.topicsRemembered} topics tracked`);
    if (input.revisionsFlagged > 0) parts.push(`${input.revisionsFlagged} flagged for revision before you forgot them`);
    if (input.remindersSent > 0) parts.push(`${input.remindersSent} reminders sent`);
    return {
      kind: 'proof',
      headline: 'We are holding all of it for you',
      body: parts.length > 0
        ? `${parts.join(', ')}. You have not had to remember any of it.`
        : 'Your whole syllabus is tracked, so you never have to hold it in your head.',
      ask,
    };
  }

  return {
    kind: 'promise',
    headline: 'Still free. Still six jobs to one.',
    body: 'Your plan, today\'s work, your whole syllabus in memory, revision timing, the fix when life happens, and staying on track. We do those. You study.',
    ask,
  };
}

/**
 * Should the card show today?
 *
 * Cadence, not frequency capping: a fixed interval from the last time it was
 * seen, so a student who opens the app ten times today sees it once, and one
 * who disappears for a week sees it on their first day back rather than being
 * hit with the three they missed.
 */
export function shouldShowValueProof(lastShownIso: string | null, todayIso: string): boolean {
  if (!lastShownIso) return true;
  const days = Math.round(
    (Date.parse(todayIso + 'T00:00:00Z') - Date.parse(lastShownIso + 'T00:00:00Z')) / 86_400_000,
  );
  return days >= VALUE_PROOF_INTERVAL_DAYS;
}
