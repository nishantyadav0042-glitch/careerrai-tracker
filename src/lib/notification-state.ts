// ── The canonical notification state model ───────────────────────────────
//
// Notification Reliability V2, Phase 1 (16 Aug). Before this file, the same
// question — "is this student actually reachable?" — had two different
// answers living in two different files reading the same two columns:
// notification-health.ts's scoreStudent() and push-state.ts's pushHealth().
// They agreed almost everywhere, but diverged on exactly one real case
// (notif_prefs.push = false with a leftover live subscription blob) —
// notification-health.ts counted it as opted-in, push-state.ts correctly
// called it the student's own choice. Two files, opposite rules, same row.
//
// This does not replace either of those two files' public APIs in this
// pass — that is dashboard-surface work (Phase 15/16, tracked separately)
// and both already independently converged on the correct rule below after
// the 16 Aug fixes. What this file gives them (and anything built after it)
// is ONE place that rule is written down, so it can never re-diverge by
// accident, plus the specific derived question Phase 17 needs: which
// students granted permission but are not actually reachable right now.

export type PermissionState = 'not_requested' | 'granted' | 'denied' | 'unknown';
export type SubscriptionState = 'active' | 'missing' | 'provider_dead' | 'recovering' | 'unknown';

export interface NotificationStateInput {
  /** notif_prefs.push === true — what the student actually asked for. */
  prefsPush: boolean;
  /** notif_prefs.push_prompted === true || push_reprompted === true — the
   *  one thing that can tell "asked and declined" apart from "never asked". */
  wasPrompted: boolean;
  /** profiles.push_subscription is not null — what can currently be
   *  delivered to, independent of what the student asked for. */
  hasSubscription: boolean;
  /** profiles.push_died_at — set ONLY by a real HTTP 410/404 from the push
   *  provider (push.ts's attemptSend). The one column in this whole model
   *  that is proof rather than inference. */
  diedAt: string | null;
}

export interface NotificationState {
  permission: PermissionState;
  subscription: SubscriptionState;
}

/**
 * The one classification. A live subscription is never read as consent
 * (the student's own preference always decides `permission`), and death is
 * never inferred from absence (only `diedAt` — a real provider rejection —
 * can produce `provider_dead`; a subscription that's merely missing with no
 * such proof is `missing`, a different, less certain fact).
 *
 * `recovering` and `unknown` are reserved for Phase 3 (the self-healing
 * subscription flow — client-side, tracked as a separate follow-up
 * installment) and are not emitted by this function yet: recovering needs a
 * "recovery attempt in progress" signal this schema doesn't carry yet, and
 * `unknown` would require an ambiguous input this schema's NOT NULL columns
 * don't currently produce. Both stay in the type so callers written against
 * it don't need to change again when Phase 3 lands.
 */
export function classifyNotificationState(input: NotificationStateInput): NotificationState {
  const permission: PermissionState = input.prefsPush
    ? 'granted'
    : input.wasPrompted ? 'denied' : 'not_requested';

  const subscription: SubscriptionState = input.hasSubscription
    ? 'active'
    : input.diedAt != null ? 'provider_dead' : 'missing';

  return { permission, subscription };
}

/**
 * Phase 17's priority recovery queue, precisely: permission was granted —
 * the student said yes — but there is currently no live channel to reach
 * them through, for any reason (missing, or provider-confirmed dead). This
 * is the ONE population that deserves an urgent "we owe this student
 * working reminders" queue; it is deliberately NOT the same set as the
 * dashboard's historical "disconnected" number, which mixes in students the
 * provider never actually rejected.
 */
export function needsRecovery(state: NotificationState): boolean {
  return state.permission === 'granted' && state.subscription !== 'active';
}

// ── The recovery lifecycle (Installment 2, Part 1) ──────────────────────
//
// Investigating the 49 provider-dead students from Installment 1 found the
// real reason recovery wasn't visible: 7 of the 49 actually returned to the
// app since their subscription died (real /student/* visits, standalone
// PWA, real device) and NONE of them healed — because push-healer.tsx's
// catch block was `/* silent — never break the app over a push heal */`.
// The healer running and failing looked IDENTICAL to the healer never
// running at all. This type makes that distinction a first-class,
// queryable fact instead of an invisible one.

export type RecoveryState =
  | 'not_applicable'    // permission isn't granted, or the subscription is
                         // healthy and was never known to be broken
  | 'recovery_required' // permission granted, subscription unusable, no
                         // recovery attempt on record yet
  | 'recovery_attempted' // an attempt ran, subscription is still not active,
                         // and we don't have a captured reason why (the
                         // attempt itself, or the report of it, was lost —
                         // an honest UNKNOWN, not invented as a failure)
  | 'recovery_failed'   // an attempt ran, subscription is still not active,
                         // and we DO have the actual reason
  | 'recovered';         // subscription is active AND a recovery attempt is
                         // on record — the subscription that's live now is
                         // the healer's doing, not one that was never broken

export interface RecoveryInput {
  permission: PermissionState;
  subscription: SubscriptionState;
  /** profiles.push_recovery_attempted_at — stamped by the healer on every
   *  attempt, success or failure, never left silent. */
  recoveryAttemptedAt: string | null;
  /** profiles.push_recovery_last_error — the real reason the LAST attempt
   *  didn't leave the student with an active subscription. Null if the
   *  last attempt succeeded, or if no attempt is on record. */
  recoveryLastError: string | null;
}

export function classifyRecovery(input: RecoveryInput): RecoveryState {
  if (input.permission !== 'granted') return 'not_applicable';

  if (input.subscription === 'active') {
    // Deliberately NOT ordering-sensitive (comparing timestamps against
    // subscriptionEstablishedAt): push-healer.tsx reports the recovery
    // outcome as a SEPARATE beacon after persistSubscription's own write,
    // so recoveryAttemptedAt can land a moment after the subscription's own
    // timestamp even on success — a strict ">=" check would misclassify a
    // real recovery as "not_applicable". Presence is enough: an active
    // subscription with any recorded recovery attempt is a recovered one —
    // PushHealer only force-rotates when the server already believes the
    // subscription is dead, so a healthy subscription with no history of
    // dying never accumulates an attempt in the first place.
    return input.recoveryAttemptedAt != null ? 'recovered' : 'not_applicable';
  }

  // subscription is 'missing' or 'provider_dead' from here down.
  if (input.recoveryAttemptedAt == null) return 'recovery_required';
  return input.recoveryLastError != null ? 'recovery_failed' : 'recovery_attempted';
}
