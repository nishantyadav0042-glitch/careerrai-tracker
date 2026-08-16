// ── ONE DEFINITION OF "A SUBSCRIPTION WAS CREATED" ──────────────────────────
//
// Two places in the app can turn a browser subscription into a row on
// `profiles`: the authenticated toggle inside the app (/api/push/subscribe)
// and the pre-auth /start funnel's signup step (verify-phone-otp/route.ts),
// which can capture a subscription before an account technically exists.
//
// Until 15 Aug these were two hand-written definitions of the same event, and
// they disagreed on one field. The authenticated route stamped
// `push_subscribed_at` (set once, first subscription ever — the field the
// health engine's whole notion of "subscription age" is built on). The
// pre-auth route never stamped it at all. Every student who subscribed
// through the pre-auth path and later lost that subscription became a
// "death with no recorded birth" — 24 of them, all dated 12–21 July, before
// this was found. Not a data-quality footnote: it is HALF of every
// "disconnected" student on the dashboard, misread as unexplained churn.
//
// This function is the fix: the one place that decides what fields change
// when a subscription arrives, called by both routes. The DB write itself
// still happens where each caller already writes profiles — one immediately
// (the authenticated PATCH), one merged into a larger new-account insert —
// because that difference is real and honest, not a duplicated definition.
// What must never differ again is which fields get touched and how.
//
// Not named push-subscribe.ts: that file already exists and does a different
// job — the CLIENT-SIDE "ask the browser for permission and subscribe" flow
// (enablePush). This is the SERVER-SIDE "what do we write once we have one"
// question. Same subject, two ends of one wire, kept apart on purpose.

export interface ExistingSubscriptionState {
  notifPrefs: Record<string, unknown> | null | undefined;
  pushSubscribedAt: string | null | undefined;
}

export interface SubscriptionRegistration {
  push_subscription: unknown;
  notif_prefs: Record<string, unknown>;
  push_died_at: null;
  push_subscribed_at: string;
  push_resubscribed_at: string;
  /**
   * Installment 5: a successful registration RESOLVES whatever the last
   * recovery attempt failed on, so the stale reason must not linger — a
   * student showing `recovery_failed: browser_permission_default` while
   * holding a live subscription is a lie the dashboard would repeat.
   * `push_recovery_attempted_at` is deliberately NOT cleared: it is real
   * history, and classifyRecovery() reads it together with an active
   * subscription to report 'recovered' rather than 'not_applicable'.
   */
  push_recovery_last_error: null;
  push_context?: 'standalone' | 'twa' | 'ios_app' | 'browser' | 'unknown';
}

const VALID_CONTEXTS = ['standalone', 'twa', 'ios_app', 'browser', 'unknown'] as const;

/** Narrows an arbitrary client-supplied string to a real push context, or null. */
export function normalisePushContext(raw: unknown): SubscriptionRegistration['push_context'] | undefined {
  return typeof raw === 'string' && (VALID_CONTEXTS as readonly string[]).includes(raw)
    ? (raw as SubscriptionRegistration['push_context'])
    : undefined;
}

/**
 * The fields to write when a subscription is registered — pure, no I/O, so
 * both callers can be tested against the same expectations.
 *
 * `push_subscribed_at` is set ONCE across a student's whole lifetime: if one
 * already exists, it survives; only a brand-new subscriber gets `now`. This
 * is the exact field the pre-auth path used to skip.
 *
 * `notif_prefs` is MERGED, never replaced — daily_reminder/email/reminder_time
 * must survive a push subscribe exactly as they did before it, the same
 * discipline /api/push/subscribe already had and the pre-auth path did not
 * (it wrote `{ push: true }` as the WHOLE column).
 */
export function registerSubscription(
  existing: ExistingSubscriptionState,
  subscription: unknown,
  now: string,
  context?: unknown
): SubscriptionRegistration {
  const notif_prefs = { ...(existing.notifPrefs ?? {}), push: true };
  const push_context = normalisePushContext(context);
  return {
    push_subscription: subscription,
    notif_prefs,
    push_died_at: null,
    push_subscribed_at: existing.pushSubscribedAt ?? now,
    push_resubscribed_at: now,
    push_recovery_last_error: null,
    ...(push_context ? { push_context } : {}),
  };
}
