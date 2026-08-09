// ── Scale configuration — the business thresholds, in one place ──────────────
//
// Founder, 9 Aug: "Don't hard-code business thresholds into the UI architecture.
// The 8-student comfort line is useful today, but mentor capacity will one day
// depend on type, availability, SLA, tier… The threshold should be
// configuration/business logic, not UI logic."
//
// So every number that encodes a business judgement lives here, not scattered
// through pages and assemblers. Today they are constants; the moment they need
// to vary by mentor type, plan tier, or live load, THIS is the one file that
// grows a lookup — and no page changes. The values are unchanged from where they
// used to live; this is a consolidation, not a re-tuning.

/** One mentor should not carry more than this before it needs a founder look. */
export const MENTOR_OVERLOAD_THRESHOLD = 8;

/** How long a paying student may wait for a mentor before it is an incident (hours). */
export const BUDDY_SLA_HOURS = 24;

/**
 * reconcile-payments runs every 15 min; a stuck payment is only surfaced after
 * this window, so an alert means "automatic recovery has already run and failed",
 * not "first attempt failed". (minutes)
 */
export const SELF_HEAL_WINDOW_MIN = 20;

/** How far back a failed payment is still worth a sales follow-up (days). */
export const FAILED_PAYMENT_LOOKBACK_DAYS = 30;

/** How far back an abandoned checkout is still worth chasing (days). */
export const ABANDONED_CHECKOUT_LOOKBACK_DAYS = 14;

/** How far back an expired (nobody-joined) session still counts as a fresh miss (days). */
export const EXPIRED_SESSION_LOOKBACK_DAYS = 3;

/**
 * When a pile of identical exceptions stops being a list and becomes one
 * incident. Presentation only — never changes correctness or the underlying
 * records (see exception.ts:shouldAggregate). Deliberately high: at today's
 * scale the founder should see the individuals, so this stays dormant until a
 * domain genuinely floods. Tune per domain here when that day comes.
 */
export const AGGREGATION_THRESHOLD = 25;
