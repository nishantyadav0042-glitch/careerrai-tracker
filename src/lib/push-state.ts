// ── Is this student actually receiving reminders? One answer, one place ─────
//
// The bug this exists to kill, in one sentence: the profile toggle was wired to
// `notif_prefs.push` — the PREFERENCE — so a student whose subscription had died
// opened the app, saw "Browser push alerts" switched ON, and received nothing.
//
// Measured on 9 Aug: 42 students sat in exactly that state, average 18 days.
// Every one of them had said yes to reminders. Every one of them was being told
// the reminders were on.
//
// A preference is what the student ASKED for. A subscription is what the browser
// will actually deliver to. Those are two different facts and the app had one
// name for both. Anything that renders notification state must ask this function
// instead of reading either field on its own.

export type PushHealth =
  /** Wants reminders, browser subscription is live. The only good state. */
  | 'healthy'
  /** Never turned reminders on. Not a fault — an ask we have not made or won. */
  | 'never_enabled'
  /** Turned them off deliberately. Respect it; never nag. */
  | 'off_by_choice'
  /** Said yes, subscription is dead. We are failing a promise they accepted. */
  | 'broken';

export interface PushStateInput {
  /** `notif_prefs.push === true` — what the student asked for. */
  prefWantsPush: boolean;
  /** `profiles.push_subscription is not null` — what can actually be delivered to. */
  hasSubscription: boolean;
  /** `profiles.push_died_at` — set when a send returned a terminal 410/404. */
  diedAt: string | null;
}

/**
 * `broken` is deliberately NOT conditioned on `diedAt`.
 *
 * A subscription can go missing without ever having been recorded dead — a
 * failed persist during onboarding, cleared site data, a WebAPK install that
 * replaced the browser-tab endpoint before any send was attempted. In every one
 * of those cases the student asked for reminders and is not getting them, which
 * is the only thing that matters to them. Requiring `diedAt` would have hidden
 * exactly the silent cases this function was written to find.
 */
export function pushHealth(input: PushStateInput): PushHealth {
  if (!input.prefWantsPush) {
    // They may still hold a live subscription from before they turned it off.
    // Their choice governs; a live endpoint is not consent.
    return input.hasSubscription || input.diedAt ? 'off_by_choice' : 'never_enabled';
  }
  return input.hasSubscription ? 'healthy' : 'broken';
}

/** Only `broken` earns an interruption. The other three are not problems. */
export function needsPushRepair(input: PushStateInput): boolean {
  return pushHealth(input) === 'broken';
}

/**
 * What the student is told when it is broken.
 *
 * Three rules, each one paid for. Never blame the student — they did the thing
 * we asked and the failure is ours. Never say "notifications" — say the thing
 * they lose, which is the reminder that was going to arrive tomorrow morning.
 * And never make it dismissible-forever: the whole defect was silence.
 */
export const PUSH_REPAIR_COPY = {
  title: 'Your reminders have stopped',
  body: 'Your phone dropped the connection — this happens after an app update or a phone restart. Nothing on your side went wrong.',
  cta: 'Turn reminders back on',
} as const;

/**
 * How many days of reminders a broken student has already missed.
 *
 * Shown only when we are sure: `diedAt` is the one timestamp we can defend. When
 * a subscription went missing without a recorded death we say nothing rather
 * than guess, because a number the student can disprove costs more than it buys.
 */
export function daysSinceReminderStopped(diedAt: string | null, todayIso: string): number | null {
  if (!diedAt) return null;
  const died = Date.parse(diedAt);
  const today = Date.parse(todayIso);
  if (!Number.isFinite(died) || !Number.isFinite(today)) return null;
  const days = Math.floor((today - died) / 86_400_000);
  return days > 0 ? days : null;
}
