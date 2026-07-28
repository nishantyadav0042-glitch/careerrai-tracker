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
  /**
   * Hour of the IST study day, 0-23. REQUIRED, and its absence was a real bug:
   * without it, 'start_the_day' and 'inactivity' evaluate the same condition
   * ("has not opened") and therefore always fire together. A simulation over
   * 448 real student-days showed both firing 335 times each — two notifications
   * for one fact. Time is what distinguishes a morning invitation from an
   * afternoon nudge.
   */
  hourIST: number;
}

/** When each intent is allowed to fire. Outside its window, it never sends. */
export const INTENT_WINDOW: Record<NudgeIntent, [number, number]> = {
  start_the_day: [7, 10],   // morning invitation
  inactivity:    [14, 16],  // afternoon: still nothing today
  log_reminder:  [20, 22],  // evening: the day is done, how did it go
  recovery:      [9, 11],   // one calm morning reach for someone who has gone quiet
};

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

// EVIDENCE TAGS (docs/EVIDENCE-POLICY.md). None of these three numbers is
// derived from an experiment, and saying so here is the point:
//
//   maxPerDay: 4        HYPOTHESIS · evidence: none · confidence: low
//                       EXPERIMENT: compare 2 / 3 / 4 against logs completed.
//                       DERIVED: at cap 3 vs 4 the simulated load is identical
//                       (2.38/student-day), so 4 is not currently binding.
//   fatigueThreshold: 6 HYPOTHESIS · evidence: none · confidence: low
//                       The REASONING is derived — at a 1-3% tap rate, four
//                       ignored in a row is ordinary — but 6 itself is
//                       intuition. EXPERIMENT: 4 / 6 / 8 over two weeks.
//   probeEveryDays: 3   HYPOTHESIS · evidence: none · confidence: low
//
// DERIVED, from 448 real student-days (scripts/simulate-nudges.mjs):
//   mean 2.38 nudges/student-day · 71.9% of student-days receive 3 · 8.3%
//   receive 0. An earlier claim of "~1.2/day" was wrong by roughly 2x and was
//   never measured before being stated.
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

  const [from, to] = INTENT_WINDOW[intent];
  if (s.hourIST < from || s.hourIST > to) {
    return { send: false, why: `outside the ${from}:00-${to}:00 window for ${intent}` };
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
  // Walks the day hour by hour, because a day is a sequence and not a set:
  // an intent that fires at 09:00 changes the state the 14:00 intent sees.
  const order: NudgeIntent[] = ['start_the_day', 'recovery', 'inactivity', 'log_reminder'];
  const out: NudgeIntent[] = [];
  const state = { ...s };
  for (let hour = 0; hour < 24; hour++) {
    state.hourIST = hour;
    for (const intent of order) {
      if (out.includes(intent)) continue; // once per day, per intent
      if (decideNudge(intent, state, policy).send) {
        out.push(intent);
        state.sentToday += 1;
      }
    }
  }
  return out;
}
