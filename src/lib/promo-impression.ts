import type { SupabaseClient } from '@supabase/supabase-js';
import type { DispatchOutcome } from './notification-os';

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

export type PromoChannel = 'modal' | 'notification' | 'onboarding' | 'approved_push';

export type PromoClaim =
  | { show: true; shownAt: string }
  | { show: false; reason: 'already_pitched_today' | 'claim_failed' };

export async function claimBuddyPitch(
  admin: SupabaseClient,
  studentId: string,
  channel: PromoChannel,
): Promise<PromoClaim> {
  const { data, error } = await admin
    .from('promo_impressions')
    .insert({ student_id: studentId, promo_type: 'buddy_pitch', channel })
    .select('shown_at')
    .single();

  // shown_at comes back so a caller whose send never lands can hand back THIS
  // claim and nothing else — see settleBuddyPitch().
  if (!error && data?.shown_at) return { show: true, shownAt: data.shown_at as string };
  if (error?.code === '23505') return { show: false, reason: 'already_pitched_today' };

  // Unknown failure — refuse, loudly. The log line is what turns a silent
  // week of zero pitches into a same-day page instead of a month-end mystery.
  // An insert that reports no error but hands back no row lands here too: we
  // cannot name the claim we made, so we cannot promise to release it either.
  console.error(
    '[promo] buddy_pitch claim failed (failing CLOSED):',
    error?.message ?? 'insert returned no row',
  );
  return { show: false, reason: 'claim_failed' };
}

/**
 * Has this student already received today's pitch? READ-ONLY — never consumes.
 *
 * For the passive inline surfaces (the tracker teaser, the blueprint banner).
 * Founder's correction, 26 Aug: those cards must go QUIET once the day's
 * pitch has happened, but they must never claim the day themselves — a card
 * the student scrolled past would silently burn the slot the modal (the main
 * interruption, the pitch that actually converts) was waiting for.
 *
 * FAILS CLOSED like the claim: an unreadable answer is treated as "already
 * pitched", so a broken read hides promos rather than stacking them.
 */
export async function buddyPitchedToday(
  admin: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('promo_impressions')
    .select('student_id')
    .eq('student_id', studentId)
    .eq('promo_type', 'buddy_pitch')
    .eq('study_day', new Date().toISOString().slice(0, 10))
    .maybeSingle();
  if (error) {
    console.error('[promo] pitched-today read failed (treating as pitched):', error.message);
    return true;
  }
  return data != null;
}

/**
 * What happens to a claim after the send was attempted. THE one place that
 * decides it — three callers claim-then-send, and three copies of this rule
 * would be three chances to get it subtly different.
 *
 * The defect this closes (audit 26 Aug, D1): the crons claimed the day and
 * then dispatched. When dispatch declined — budget spent, a dead push
 * subscription, an insert that failed — the claim stayed burned and the
 * student got NOTHING. Measured on 26 Aug: 150 claimed, 136 delivered, 14
 * students marked as pitched who were never pitched at all.
 *
 * The rule is NOT "release whenever the outcome isn't 'sent'". `dispatch()`
 * returns 'failed' both when no notification row was ever created AND when
 * the row exists but the push transport failed — and in that second case the
 * student HAS an in-app notification sitting in their bell. Releasing there
 * would hand out a second pitch, which is the one thing this system exists to
 * prevent. So we do not infer from the enum; we look at what actually exists.
 *
 * Release only when nothing reached the student. Every uncertainty — an
 * unreadable check, a delete that fails — KEEPS the claim, because a lost
 * pitch costs a possible sale and a double pitch costs the trust the product
 * runs on. Same asymmetry as claimBuddyPitch(), pointed the same way.
 */
export async function settleBuddyPitch(
  admin: SupabaseClient,
  studentId: string,
  notificationType: string,
  claim: { shownAt: string },
  outcome: DispatchOutcome,
): Promise<'kept' | 'released'> {
  // 'sent' delivered it. 'duplicate_suppressed' means a notification of this
  // type ALREADY exists for the student today — the day-per-type unique index
  // refused a repeat — so they have been pitched and the claim stands.
  if (outcome === 'sent' || outcome === 'duplicate_suppressed') return 'kept';

  const { data: rows, error } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', studentId)
    .eq('type', notificationType)
    .gte('created_at', claim.shownAt)
    .limit(1);

  if (error) {
    console.error('[promo] could not verify delivery, keeping the claim:', error.message);
    return 'kept';
  }
  if (rows && rows.length > 0) return 'kept'; // an in-app row exists: they were pitched

  // Scoped to the exact row this claim created, so a release can never take
  // away a pitch some other channel won in the meantime.
  const { error: delError } = await admin
    .from('promo_impressions')
    .delete()
    .eq('student_id', studentId)
    .eq('promo_type', 'buddy_pitch')
    .eq('shown_at', claim.shownAt);

  if (delError) {
    console.error('[promo] release failed, day stays claimed:', delError.message);
    return 'kept';
  }
  return 'released';
}
