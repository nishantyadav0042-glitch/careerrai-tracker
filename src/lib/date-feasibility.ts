import { topicHours } from './prep-model';
import { FULL_SYLLABUS_MIN_HOURS } from './routine-engine';

// ── "Your date doesn't work" — said out loud, with the arithmetic ───────────
//
// Founder, 14 Aug, choosing option (a): "those students who have more than six
// hours should complete all the topics... and if the date is too close, tell
// them the date doesn't work."
//
// That second half is the part a planner normally skips, because it is easier
// to quietly drop topics than to tell a student their plan does not fit. The
// dropping is invisible; the telling is uncomfortable. So the product does the
// uncomfortable thing: it names the gap, in hours, against a date the student
// chose themselves.
//
// WHAT THIS IS NOT. It is not a refusal and it does not move anything. The
// date stays exactly where the student put it (one date, decided once, by
// them) and the plan keeps running. This produces a SENTENCE. The student
// decides whether to move the date or add hours — both are theirs to change,
// and either one closes the gap.
//
// THE ARITHMETIC, deliberately simple enough to argue with:
//   hours still needed  = sum of estimated hours for topics not yet started
//   hours still available = days left x the hours they committed per day
// A plan fits when available covers needed with a little room. It is TIGHT
// when the margin is thin, and it does not fit when needed exceeds available.
//
// Revision is not modelled here. These estimates are first-contact hours, so a
// verdict of "fits" is already the optimistic case — which is the honest
// direction for a warning to err in. Saying "you have room" when they do not
// would be the damaging mistake; saying "this is tight" a little early is not.

export type FinishVerdict = 'no_date' | 'fits' | 'tight' | 'impossible';

export interface FeasibilityInput {
  /** Canonical topics the student has NOT started. */
  untouchedTopics: string[];
  /** The hours per day they committed to. */
  hoursPerDay: number;
  /** Days from today to their chosen finish date. Null = no date set. */
  daysToTarget: number | null;
}

export interface Feasibility {
  verdict: FinishVerdict;
  /** Estimated hours of first-contact work still ahead. */
  neededHours: number;
  /** Hours their own commitment buys before the date. */
  availableHours: number;
  /** Hours short. 0 unless the verdict is 'impossible'. */
  shortfallHours: number;
  /** Days they would need at their current hours. Null when nothing is left. */
  daysNeeded: number | null;
  /** Extra days beyond the chosen date. 0 unless 'impossible'. */
  extraDaysNeeded: number;
  /** Hours/day that WOULD make the chosen date work. Null when unreachable. */
  hoursPerDayNeeded: number | null;
  /** The promise this student is owed — see FULL_SYLLABUS_MIN_HOURS. */
  owedFullSyllabus: boolean;
}

/**
 * A day is never fully spent on first contact — revision, mocks and the
 * phase-closing task take their share. This is the fraction of a committed
 * hour that realistically goes to opening new topics.
 *
 * 0.6 is not a guess dressed as precision: the day shape reserves the priority
 * slice at 40-55% and the syllabus clock takes one block per section per day,
 * so somewhat over half a day going to first contact is the shape the engine
 * actually produces. It is stated here as one named number so the whole
 * verdict can be argued with rather than trusted.
 */
export const FIRST_CONTACT_SHARE = 0.6;

/** Below this much slack the date is real but has no room for a bad week. */
export const TIGHT_MARGIN = 1.15;

export function assessFinishDate(input: FeasibilityInput): Feasibility {
  const { untouchedTopics, hoursPerDay, daysToTarget } = input;

  const neededHours = Math.round(
    untouchedTopics.reduce((sum, t) => sum + (topicHours(t) ?? 0), 0),
  );
  const owedFullSyllabus = hoursPerDay >= FULL_SYLLABUS_MIN_HOURS;

  const base = {
    neededHours,
    owedFullSyllabus,
    shortfallHours: 0,
    extraDaysNeeded: 0,
  };

  // No date is not a failure — it is a student who has not chosen one. The
  // planner already treats that as "one new topic a day" rather than a
  // deadline, and inventing urgency here would be a claim we cannot support.
  if (daysToTarget == null) {
    return { ...base, verdict: 'no_date', availableHours: 0, daysNeeded: null, hoursPerDayNeeded: null };
  }

  const usablePerDay = Math.max(0, hoursPerDay) * FIRST_CONTACT_SHARE;
  const availableHours = Math.round(Math.max(0, daysToTarget) * usablePerDay);

  // Nothing left to open: the syllabus is already started end to end.
  if (neededHours <= 0) {
    return { ...base, verdict: 'fits', availableHours, daysNeeded: 0, hoursPerDayNeeded: null };
  }

  const daysNeeded = usablePerDay > 0 ? Math.ceil(neededHours / usablePerDay) : null;
  // What they would have to commit per day to hold the date they picked.
  const hoursPerDayNeeded = daysToTarget > 0
    ? Math.round((neededHours / (daysToTarget * FIRST_CONTACT_SHARE)) * 2) / 2
    : null;

  if (availableHours < neededHours) {
    return {
      ...base,
      verdict: 'impossible',
      availableHours,
      shortfallHours: Math.round(neededHours - availableHours),
      daysNeeded,
      extraDaysNeeded: daysNeeded != null ? Math.max(0, daysNeeded - daysToTarget) : 0,
      hoursPerDayNeeded,
    };
  }

  return {
    ...base,
    verdict: availableHours < neededHours * TIGHT_MARGIN ? 'tight' : 'fits',
    availableHours,
    daysNeeded,
    hoursPerDayNeeded,
  };
}

export interface FeasibilityMessage {
  headline: string;
  detail: string;
  /** The two things the student can actually change. */
  options: string[];
}

/**
 * The sentence. Every number in it is one the student can check against their
 * own settings — that is what makes it a warning rather than a scare.
 *
 * Null for 'fits' and 'no_date': there is nothing true to say, and a product
 * that speaks when it has nothing to say is one a student stops reading.
 */
export function feasibilityMessage(f: Feasibility, targetDateLabel: string): FeasibilityMessage | null {
  if (f.verdict === 'fits' || f.verdict === 'no_date') return null;

  if (f.verdict === 'impossible') {
    return {
      headline: `${targetDateLabel} doesn't work at your hours.`,
      detail: `The syllabus you haven't started needs about ${f.neededHours}h. Your ${targetDateLabel} date gives you about ${f.availableHours}h — roughly ${f.shortfallHours}h short.`,
      options: [
        f.extraDaysNeeded > 0
          ? `Move the date about ${f.extraDaysNeeded} days later`
          : 'Move the date later',
        f.hoursPerDayNeeded != null
          ? `Or raise your day to about ${f.hoursPerDayNeeded}h to keep it`
          : 'Or raise your daily hours',
      ],
    };
  }

  return {
    headline: `${targetDateLabel} works, but there's no room for a bad week.`,
    detail: `About ${f.neededHours}h of syllabus left and about ${f.availableHours}h before ${targetDateLabel}.`,
    options: ['Keep it and protect your daily hours', 'Or move the date a little later'],
  };
}
