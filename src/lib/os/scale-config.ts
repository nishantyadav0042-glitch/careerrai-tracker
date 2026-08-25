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

// ── Sales call-queue lanes (founder, 24 Aug · Phase 1.5 debt C3) ────────────
// The numbers that decide WHY a student is in a rep's queue today. They live
// here, not as literals inside classifyLane, so that "silent" means one thing
// across every surface that reasons about a student going quiet — the sales
// lane, the mission-deck root-cause census, and anything added later. Tuning
// the definition is a config change, not an engine edit.
//
// classifyLane (lib/call-queue) is THE per-student sales lane authority. The
// mission-deck census (lib/mission-queue) answers a different question — which
// branch of the whole roster is biggest — and keeps its own aggregation, but
// must share these thresholds when it is next touched.

/** Consecutive days with no log before a previously-active student is "going
 *  cold". Three days is the first point at which silence is a pattern rather
 *  than a weekend. */
export const GOING_COLD_SILENT_DAYS = 3;

/** How many of the preceding days must carry a log for the silence to mean
 *  something. Below this the student never had a rhythm to lose. */
export const GOING_COLD_MIN_PRIOR_DAYS = 3;

/** A daily run at least this long is a habit worth winning back by name. */
export const BROKEN_STREAK_MIN_RUN = 5;

/** How recently the run must have ended to still be warm enough to recover. */
export const BROKEN_STREAK_MAX_DAYS_SINCE = 3;

/** Days after signup before the activation call is appropriate. Calling two
 *  hours after someone joins reads as surveillance, not help. */
export const NEW_LEAD_MIN_AGE_DAYS = 1;

/** After this many days a never-logged signup has missed the activation
 *  moment and falls through to the ordinary fresh lane. */
export const NEW_LEAD_MAX_AGE_DAYS = 7;

// ── Buddy check-in (founder, 10 Aug) ────────────────────────────────────────
// "Agar mere paas 5 student assigned hain aur unme se kisi ek ne bhi kal log
// nahi bhara, to agle din buddy ki ID se message jaayega." The numbers that
// decide WHEN that happens live here, not inside the cron.

/** Consecutive logless days before a mentor check-in is drafted. One missed day
 *  is life (travel, dead phone, exam); two in a row is a pattern. Rest-day logs
 *  count as showing up, so this only ever counts days with no log at all. */
export const CHECKIN_MISSED_DAYS_TRIGGER = 2;

/** Past this many silent days it is not a check-in case any more (days).
 *  "Do din se log nahi dikha, sab theek hai?" is a mentor noticing. The same
 *  message at day 31 is a stranger noticing a month late — that student has
 *  churned, and churn is a founder/win-back problem, not a nudge problem. */
export const CHECKIN_MAX_MISSED_DAYS = 14;

/** A student may not be check-in'd more often than this (days). Protects the
 *  personal feel: a "message from your mentor" that arrives every other day
 *  reads as a robot within a week. */
export const CHECKIN_COOLDOWN_DAYS = 5;

/** After this many check-ins with no reply, stop drafting. Someone who ignores
 *  two personal messages does not need a third — that is a human problem for
 *  the mentor and the founder, not a nudge problem. */
export const CHECKIN_MAX_UNANSWERED = 2;

/** How long a drafted check-in stays sendable (hours). "You missed 2 days" is
 *  false by Thursday if it was written on Monday, and sending stale facts from
 *  the mentor's ID is worse than sending nothing. */
export const CHECKIN_DRAFT_TTL_HOURS = 36;

/**
 * When a pile of identical exceptions stops being a list and becomes one
 * incident. Presentation only — never changes correctness or the underlying
 * records (see exception.ts:shouldAggregate). Deliberately high: at today's
 * scale the founder should see the individuals, so this stays dormant until a
 * domain genuinely floods. Tune per domain here when that day comes.
 */
export const AGGREGATION_THRESHOLD = 25;
