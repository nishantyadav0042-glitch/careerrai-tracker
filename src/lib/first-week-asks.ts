// ── The rest of the questions, collected in week one ────────────────────────
//
// Founder, 14 Aug: "ask weakest section in onboarding, rest in first week."
//
// The audit found several plan inputs at 0% fill because nothing asked for
// them. The weakest section is now asked at signup — it is the one worth a tap
// before a student has any reason to trust us. The rest are worth MORE later:
// a student who has logged a few days can answer "where are you on QA?"
// honestly, where the same question at signup gets a guess from someone who
// has not opened the syllabus yet.
//
// THE RULES, and each one is there because the opposite has cost us:
//
//   ONE a day, maximum. A stack of questions is a form, and a form on the home
//   screen is something to dismiss rather than answer.
//
//   NEVER before they have logged. Asking a student to refine a plan they have
//   not used yet is asking them to imagine their own behaviour. It also puts a
//   question in front of the one action that matters on day one.
//
//   NEVER blocking, always dismissible. Incident #2: gating an action on
//   another action took a whole cohort's logging to zero. A question that can
//   trap a student is worse than an unanswered question.
//
//   ASKED ONCE, then gone. An input already collected is never re-asked, and a
//   student who dismisses one is not shown it again that day.
//
//   HIGHEST LEVERAGE FIRST, so the value arrives even if they answer only one.
//
// Everything here is pure: what to ask, and whether to ask at all. The
// rendering and the writes live with the caller.

export type AskId = 'weak_topic' | 'current_stage' | 'start_with';

export interface AskDefinition {
  id: AskId;
  /** The profile column this fills — the whole reason the ask exists. */
  field: string;
  question: string;
  /** Why the student should care, in their terms, not ours. */
  why: string;
  /** Ordering. Lower is asked first. */
  leverage: number;
}

/**
 * Ordered by what actually changes a plan.
 *
 * weak_topic moves the priority slice WITHIN the weakest section — the biggest
 * remaining lever once the section itself is known. current_stage changes the
 * phase (foundation vs intensive), which changes the whole shape of a day.
 * start_with only biases the QA cluster to open first, so it is last.
 */
export const FIRST_WEEK_ASKS: AskDefinition[] = [
  {
    id: 'weak_topic',
    field: 'self_reported_weak_topic',
    question: 'Which topic hurts the most right now?',
    why: 'It moves to the front of your day.',
    leverage: 1,
  },
  {
    id: 'current_stage',
    field: 'current_stage',
    question: 'Where are you in your prep?',
    why: 'Foundation and revision are different plans.',
    leverage: 2,
  },
  {
    id: 'start_with',
    field: 'start_with',
    question: 'Where should QA start?',
    why: 'We open that cluster first.',
    leverage: 3,
  },
];

/** How long after signup these are offered at all. */
export const FIRST_WEEK_DAYS = 7;
/** A student must have logged at least this many days before we ask anything. */
export const MIN_LOGS_BEFORE_ASKING = 1;

export interface AskContext {
  /** Days since the student signed up. */
  daysSinceSignup: number;
  /** Days they have actually logged. */
  daysLogged: number;
  /** Profile fields already filled — these are never re-asked. */
  answered: Partial<Record<string, unknown>>;
  /** Ask ids the student dismissed today. */
  dismissedToday: AskId[];
  /** Whether one has already been shown today. */
  askedToday: boolean;
}

/**
 * The ONE question to put in front of this student right now, or null.
 *
 * Null is the common and correct answer. This returns something on a handful
 * of days in a student's whole life, which is the point: the questions are
 * worth asking precisely because they are rare.
 */
export function nextAsk(ctx: AskContext): AskDefinition | null {
  if (ctx.askedToday) return null;
  if (ctx.daysLogged < MIN_LOGS_BEFORE_ASKING) return null;
  if (ctx.daysSinceSignup > FIRST_WEEK_DAYS) return null;

  const dismissed = new Set(ctx.dismissedToday);
  const pending = FIRST_WEEK_ASKS
    .filter((a) => !dismissed.has(a.id))
    .filter((a) => {
      const v = ctx.answered[a.field];
      // null is an ANSWER for these the same way it is for the weakest
      // section: a student who said "not sure" is not asked again.
      return !(a.field in ctx.answered) ? true : v === undefined;
    })
    .sort((a, b) => a.leverage - b.leverage);

  return pending[0] ?? null;
}

/**
 * Everything still missing, for the founder-facing view.
 *
 * The failure this whole thread is about was a set of inputs nobody filled and
 * nobody could see. A count that can be read at a glance is what stops that
 * from being rediscovered by an audit six months later.
 */
export function outstandingAsks(answered: Partial<Record<string, unknown>>): AskDefinition[] {
  return FIRST_WEEK_ASKS.filter((a) => !(a.field in answered) || answered[a.field] === undefined);
}
