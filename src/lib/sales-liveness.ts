// ── WHO IS STILL IN THE APP ─────────────────────────────────────────────────
//
// Founder, 15 Sep 2026: "675 walon ko call karwane ke liye kya karna hoga?"
//
// Counted first. Of the 401 CAT-2026 students who are sales-ready and have
// never been called:
//
//   T1  in the app this week ................  15
//   T2  in the app this month ............... 113
//   T3  logged once, now gone ...............  52
//   T4  opened once, never logged ........... 220
//   T5  never opened since signup ...........   1
//
// 128 of them are alive and 221 are close to cold. That ordering is worth more
// than any script: measured on this base, a call to a student who was ALIVE
// but not logging revived them at 11.5% against 0.8% for a matched control,
// and the deck was dealing both kinds in the same breath.
//
// ══ WHY IT COULD NOT TELL THEM APART ════════════════════════════════════════
//
// The fresh lane ranks on `scoreConversion`, whose only recency signal is
// `activeRecently: daysSinceLastLog <= 3` — LOGGING. A T1 student who opened
// the app three times this week and never logged scores exactly what a T4
// student who vanished a month ago scores: zero. Life was being measured by
// the record of study rather than by the student turning up, which is the same
// mistake as Incidents #77, #79, #80, #81 and #82, one layer further in.
//
// `last_seen_at` is written whenever the student opens the app, and every one
// of these 675 has a phone. So the queue already held the answer.
//
// ══ THE DIRECTION IS DELIBERATE ═════════════════════════════════════════════
//
// This only ever LIFTS the students who are present. It never pushes a quiet
// student down, because being unreachable is not a fault and a student who
// went quiet is exactly who retention is for — they simply are not the
// cheapest conversation available today. And it applies to the discretionary
// lanes alone: a promise is a promise whether the student has opened the app
// or not.

/** Lanes where the counsellor's attention is ours to direct. */
const DISCRETIONARY = new Set(['fresh', 'rotation', 'attention', 'new_never_logged']);

/** Seen inside this window: they are in the product right now. */
export const ALIVE_DAYS = 7;

/** Seen inside this window: still in orbit. */
export const IN_ORBIT_DAYS = 21;

export const ALIVE_BOOST = 30_000;
export const IN_ORBIT_BOOST = 12_000;

// ── NEVER ARRIVED IS NOT THE SAME AS WENT QUIET (founder, 19 Sep 2026) ──────
//
// "hot means interested or callback or who have logged once or once anytime
// active on our app. Not the once never opened or tapped anything."
//
// Measured that night on the one remaining rep's live book of 1,006: only 72
// have never opened the app and never tapped anything. Everyone else has been
// present at least once. So this changes the order of a small tail, not the
// shape of his day — and that is the point, because the tail was sorting
// level with students who opened the app a month ago.
//
// IT DOES NOT CONTRADICT THE RULE ABOVE, and the distinction is the whole
// reason it is allowed. That rule protects the student who WENT QUIET: they
// showed up, then stopped, and being unreachable is not a fault. A student
// with no `last_seen_at` at all never arrived — they signed up and the app has
// never once been opened. That is not quietness, it is absence, and it is the
// one group where a counsellor's hour buys the least.
//
// LAST, NOT EXCLUDED — a deliberate softening of the instruction. Dropping
// them from the queue entirely would make 72 students permanently
// uncontactable, which is Incident #77's exact harm (609 students unreached)
// arrived at from the other direction. Sorted last, they are reached on a day
// with room and skipped on a day without one, which is what "don't spend his
// time on them" actually means.
export const NEVER_SEEN_PENALTY = -20_000;

/**
 * Sort adjustment for how recently the student opened the app.
 *
 * Bounded well under the lane bands (going_cold sits at 4,000,000), so this
 * orders WITHIN a lane and never promotes someone out of one.
 */
export function alivenessBoost(input: {
  lane: string;
  lastSeenAt: string | null | undefined;
  nowMs: number;
}): number {
  if (!DISCRETIONARY.has(input.lane)) return 0;
  // Never opened the app at all: sorted below everyone who has ever been
  // present, including the long-quiet. Never applied outside the
  // discretionary lanes — a promise is a promise whether they installed
  // anything or not.
  if (!input.lastSeenAt) return NEVER_SEEN_PENALTY;
  const seen = Date.parse(input.lastSeenAt);
  // An unparseable timestamp is missing DATA, not a missing student. Treating
  // it as "never arrived" would sink a student on a bad string.
  if (!Number.isFinite(seen)) return 0;
  const days = (input.nowMs - seen) / 86_400_000;
  if (days < 0) return ALIVE_BOOST;          // clock skew: treat as present
  if (days <= ALIVE_DAYS) return ALIVE_BOOST;
  if (days <= IN_ORBIT_DAYS) return IN_ORBIT_BOOST;
  return 0;
}

/** What the card says, so the counsellor knows what they are walking into. */
export function livenessNote(lastSeenAt: string | null | undefined, nowMs: number): string | null {
  if (!lastSeenAt) return null;
  const days = Math.floor((nowMs - Date.parse(lastSeenAt)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return 'In the app today';
  if (days === 0) return 'In the app today';
  if (days <= ALIVE_DAYS) return `In the app ${days} day${days === 1 ? '' : 's'} ago`;
  if (days <= IN_ORBIT_DAYS) return `Last opened the app ${days} days ago`;
  return null;
}
