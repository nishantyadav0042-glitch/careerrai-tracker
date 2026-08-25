import type { SupabaseClient } from '@supabase/supabase-js';

// ── The ONE authority on whether a student may be pitched Buddy today ───────
//
// Founder rule, 26 Aug: one buy-buddy pitch per student per day — open the
// app ten times, still exactly one. One commercial pitch per student per
// STUDY day (05:30 IST rollover), total, across every channel — the home
// modal, the evening notification, all of it.
//
// The decision is an INSERT into promo_impressions, whose primary key
// (student_id, promo_type, study_day) IS the cap. Not localStorage: the old
// throttle was per-browser and failed OPEN (`catch { return true }`) — a
// second phone or a blocked storage jar meant unlimited pitches on exactly
// the surface the founder capped. A primary key cannot be talked out of it.
//
// FAIL CLOSED, deliberately: any error that is not "row already exists" means
// we cannot PROVE the student hasn't been pitched today — so the answer is
// don't pitch. A student seeing zero promos on a broken day costs a possible
// sale; a student seeing five costs the trust the whole product runs on.
//
// This is also why claim() is called AT THE MOMENT OF SHOWING, not at render:
// a claim is a burned slot, and a burned slot with no impression behind it
// (the modal's mount conditions failed after claiming) would silently eat the
// day's one pitch. Callers claim only when they are definitely about to show.

export type PromoChannel = 'modal' | 'notification' | 'onboarding';

export type PromoClaim =
  | { show: true }
  | { show: false; reason: 'already_pitched_today' | 'claim_failed' };

export async function claimBuddyPitch(
  admin: SupabaseClient,
  studentId: string,
  channel: PromoChannel,
): Promise<PromoClaim> {
  const { error } = await admin
    .from('promo_impressions')
    .insert({ student_id: studentId, promo_type: 'buddy_pitch', channel });

  if (!error) return { show: true };
  if (error.code === '23505') return { show: false, reason: 'already_pitched_today' };

  // Unknown failure — refuse, loudly. The log line is what turns a silent
  // week of zero pitches into a same-day page instead of a month-end mystery.
  console.error('[promo] buddy_pitch claim failed (failing CLOSED):', error.message);
  return { show: false, reason: 'claim_failed' };
}
