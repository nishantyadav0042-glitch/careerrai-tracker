// ── Earning the right to interrupt ──────────────────────────────────────────
//
// THE EVIDENCE THAT DECIDES THIS FILE. Tap rate on delivered pushes, measured
// since the delivery beacon shipped on 22 Jul:
//
//   inactive_recovery    6.9%   ← fires on a CONDITION
//   onboarding_morning   4.2%   ← fires on a CONDITION
//   welcome_verify       3.7%   ← fires on an ACTION
//   companion_morning    2.7%   ← fires on a CLOCK
//   companion_progress   2.0%   ← clock
//   companion_spark      1.5%   ← clock
//   companion_kickoff    1.2%   ← clock
//   companion_wind       1.1%   ← clock
//   companion_log        0.0%   ← clock. 93 delivered, ZERO taps, ever.
//
// State-triggered notifications outperform clock-triggered ones by 4-6x in our
// own data. That is the whole argument. The question "4 or 8?" optimises the
// wrong variable — a 9th clock notification at 1% is worth less than moving
// one existing notification onto a condition.
//
// So this module answers a different question, once per candidate send:
//
//        Why is THIS student receiving THIS message RIGHT NOW?
//
// If there is no answer, we stay silent. Silence is not a failure state; it is
// the default, and every send has to beat it.
//
// Pure and dependency-free on purpose: the caller gathers the state, this
// decides. That makes every rule below testable without a database, which is
// the only reason rules like these survive contact with a deadline.

export type NudgeIntent =
  | 'start_the_day'    // "here's today's plan"
  | 'log_reminder'     // "how did today go?"
  | 'inactivity'       // "you haven't opened today"
  | 'recovery';        // "we haven't seen you in days"

export interface StudentNudgeState {
  /** Has the student opened the app during the current study day? */
  openedToday: boolean;
  /** Has today's log/check-in been completed? */
  loggedToday: boolean;
  /** Study days since their last log. null = never logged. */
  daysSinceLastLog: number | null;
  /** Nudges already DELIVERED to this student today. */
  sentToday: number;
  /**
   * Consecutive delivered pushes with no tap. The fatigue signal — the thing
   * nobody builds. Every ignored notification teaches the student, and Android,
   * that CareerRai is not important. Trust is the scarce resource, not the
   * notification budget.
   */
  ignoredStreak: number;
  /** Can we physically reach them? */
  reachable: boolean;
}

export interface Decision {
  send: boolean;
  /** Always populated. An unexplainable send is a bug, not a nudge. */
  why: string;
}

// ── Tuning ──────────────────────────────────────────────────────────────────
//
// These are guesses. Not one of them is derived from an experiment, because we
// have never run one. They are therefore CONFIGURABLE, not constants: the
// co-founder's point is that 6 might turn out to be 4 or 8, and a number
// baked into a function is a number nobody ever revisits.
//
// Defaults below are the starting position, overridable per call.
export interface NudgePolicy {
  maxPerDay: number;
  fatigueThreshold: number;
  probeEveryDays: number;
}

export const DEFAULT_POLICY: NudgePolicy = {
  maxPerDay: 4,
  fatigueThreshold: 6,
  probeEveryDays: 3,
};

/** Hard ceiling. Nobody receives more than this in a day, whatever their state. */
export const MAX_NUDGES_PER_DAY = DEFAULT_POLICY.maxPerDay;

/**
 * Back off after this many ignored-in-a-row. Chosen deliberately low: at a 1-3%
 * tap rate, four consecutive misses is the NORMAL case, not an anomaly — so a
 * threshold tuned for a healthy channel would never fire here. Six says "this
 * person has stopped seeing us", and the answer to that is to stop talking,
 * not to talk louder.
 */
export const FATIGUE_THRESHOLD = DEFAULT_POLICY.fatigueThreshold;

/** After backing off, allow one probe every N days rather than going silent forever. */
export const FATIGUE_PROBE_EVERY_DAYS = DEFAULT_POLICY.probeEveryDays;

export function decideNudge(
  intent: NudgeIntent,
  s: StudentNudgeState,
  policy: NudgePolicy = DEFAULT_POLICY,
): Decision {
  if (!s.reachable) return { send: false, why: 'no live push subscription' };

  if (s.sentToday >= policy.maxPerDay) {
    return { send: false, why: `daily ceiling of ${policy.maxPerDay} already reached` };
  }

  // ── Fatigue ───────────────────────────────────────────────────────────────
  // Silence is the treatment. The one exception is a recovery nudge, which is
  // aimed at a student who has already gone quiet — that is precisely when a
  // rare, well-timed message is worth its cost. inactive_recovery is our
  // best-performing notification at 6.9% for exactly this reason.
  if (s.ignoredStreak >= policy.fatigueThreshold && intent !== 'recovery') {
    return { send: false, why: `fatigued — ${s.ignoredStreak} delivered and ignored in a row` };
  }

  switch (intent) {
    case 'start_the_day':
      // They are already here. A "come and start your day" push to somebody
      // holding the app open is the purest form of wasted trust.
      if (s.openedToday) return { send: false, why: 'already opened the app today' };
      if (s.loggedToday) return { send: false, why: 'already logged today' };
      return { send: true, why: 'has not opened the app yet today' };

    case 'log_reminder':
      // The single most important message we send — and the one that has never
      // once been tapped, because it fired at a fixed hour regardless of
      // whether there was anything left to ask.
      if (s.loggedToday) return { send: false, why: 'today is already logged' };
      if (!s.openedToday) {
        return { send: false, why: 'has not opened today — inactivity nudge covers this, not a log reminder' };
      }
      return { send: true, why: 'opened the app today but today is still unlogged' };

    case 'inactivity':
      if (s.openedToday) return { send: false, why: 'already opened the app today' };
      if (s.loggedToday) return { send: false, why: 'already logged today' };
      return { send: true, why: 'no app open yet today' };

    case 'recovery': {
      // Aimed at absence, so it must not fire at someone who is present.
      if (s.openedToday || s.loggedToday) return { send: false, why: 'active today — not a recovery case' };
      if (s.daysSinceLastLog == null) return { send: true, why: 'never logged — activation case' };
      if (s.daysSinceLastLog < 2) return { send: false, why: 'logged within the last day — too soon to call it lapsed' };
      // Once fatigued, probe occasionally instead of daily.
      if (s.ignoredStreak >= policy.fatigueThreshold && s.daysSinceLastLog % policy.probeEveryDays !== 0) {
        return { send: false, why: 'fatigued — waiting for the next probe day' };
      }
      return { send: true, why: `${s.daysSinceLastLog} study days since their last log` };
    }
  }
}

/**
 * What a student would receive on a given day under these rules. Used by the
 * tests to assert the shape of the system rather than any single rule, and by
 * the admin desk to answer "how many notifications does an engaged student
 * actually get?" without guessing.
 */
export function nudgesForDay(s: StudentNudgeState, policy: NudgePolicy = DEFAULT_POLICY): NudgeIntent[] {
  const order: NudgeIntent[] = ['start_the_day', 'inactivity', 'log_reminder', 'recovery'];
  const out: NudgeIntent[] = [];
  const state = { ...s };
  for (const intent of order) {
    if (decideNudge(intent, state, policy).send) {
      out.push(intent);
      state.sentToday += 1;
    }
  }
  return out;
}
