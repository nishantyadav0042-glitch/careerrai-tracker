import { createAdminClient } from '@/lib/supabase/admin';
import { studyDayStart } from '@/lib/study-day';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The Notification Health Engine (co-founder's ask, 21 July): the backend used
// to treat "a subscription row exists" as "healthy". That is wrong. Healthy =
// permission granted AND a live subscription AND delivery verified recently.
// This computes, for every real student, exactly one health state — so the
// funnel opted-in → subscribed → delivery-verified → healthy is a number we
// watch, not a guess.
//
// ── STATES RENAMED 15 AUG — "opted_out" WAS NEVER A REAL MEASUREMENT ────────
//
// `notif_prefs` has a DATABASE DEFAULT of `{"push": false, ...}`. Every
// profile is born with it. `notif_prefs->>'push' = 'false'` is therefore true
// for EVERY student who has never touched the setting AND every student who
// was actually asked and said no — one column value, two entirely different
// facts, and the old code called both of them "opted out". Checked against
// production: of 248 students in that bucket, only 24 (9.7%) have any record
// of ever seeing a real push prompt (push-gate.tsx stamps `push_prompted` or
// `push_reprompted` on decline — the one place a genuine "no" gets written
// down). The other 224 are honestly UNKNOWN: this data cannot tell you
// whether they were asked and ignored it, or never reached the screen that
// asks at all. `never_opted_in` was worse — dead code. `notif_prefs` is never
// null (the default fires first), so `p.notif_prefs && push===false` was
// always true whenever push was false, and the branch beneath it was
// unreachable. It reported 0 because it could never report anything else.
//
// `disconnected` also collapsed two different populations into one number —
// see the split below, and getReliabilityMetrics' deathsWithoutBirth for the
// production audit that found it.
//
// What is NOT distinguishable from current data, stated rather than guessed:
// a student who explicitly turned push OFF after having it on (REVOKED) looks
// identical to one who was never asked — /api/profiles/notif-prefs overwrites
// the column with no history of the previous value. Do not invent that
// distinction; there is nothing in the data to earn it.

export type NotifHealthState =
  | 'healthy'                   // sub live + a device confirmed delivery in the last 3 days
  | 'unverified'                // sub live, pushes accepted, but no device beacon yet
  | 'stale'                     // sub live but last verified delivery is 7+ days old despite pushes since
  | 'disconnected_dead'         // wants push, subscription genuinely died (has a recorded birth) — real churn, cause open
  | 'disconnected_unexplained'  // wants push, subscription missing with NO recorded birth — the 12–21 Jul instrumentation gap, closed 15 Aug
  | 'declined'                  // push off, AND a real prompt is on record (push_prompted/push_reprompted) — a genuine "no"
  | 'not_asked';                // push off, and nothing in the data proves a prompt was ever shown — was mislabeled "opted out"/"never opted in"

export interface StudentHealth {
  id: string;
  full_name: string | null;
  phone: string | null;
  state: NotifHealthState;
  score: number;              // 0-100
  context: string | null;     // where the sub lives (standalone/browser)
  lastVerifiedDays: number | null;
  subscribedDays: number | null; // subscription age — lifetime signal
}

const DAY = 86_400_000;
const daysAgo = (iso: string | null | undefined, now: number): number | null =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null;

export function scoreStudent(p: any, now: number): { state: NotifHealthState; score: number } {
  const prefs = (p.notif_prefs ?? {}) as Record<string, unknown>;
  const prefsPush = prefs.push === true;
  const hasSub = p.push_subscription != null;
  const verifiedDays = daysAgo(p.push_verified_at, now);

  if (!prefsPush && !hasSub) {
    const wasPrompted = prefs.push_prompted === true || prefs.push_reprompted === true;
    return wasPrompted ? { state: 'declined', score: 0 } : { state: 'not_asked', score: 0 };
  }
  if (prefsPush && !hasSub) {
    // The 15 Aug forensic split: a subscription with no push_subscribed_at
    // was never actually MISSING a birth — the pre-auth signup path just
    // never wrote one (fixed in lib/push-subscription-registry.ts). Every
    // instance is dated 12–21 July; this classification does not improve as
    // new students arrive, because the write path that caused it is closed.
    return p.push_subscribed_at != null
      ? { state: 'disconnected_dead', score: 10 }
      : { state: 'disconnected_unexplained', score: 10 };
  }
  // Has a live subscription from here down.
  if (verifiedDays != null && verifiedDays <= 3) return { state: 'healthy', score: 100 };
  if (verifiedDays != null && verifiedDays >= 7) return { state: 'stale', score: 45 };
  // Live sub, no recent device confirmation. Not yet proven unhealthy —
  // the delivery beacon is new, so most live subs sit here until their SW
  // updates and beacons back.
  return { state: 'unverified', score: 70 };
}

export async function getNotificationHealth(admin?: any): Promise<{
  students: StudentHealth[];
  funnel: { total: number; optedIn: number; subscribed: number; verified: number; healthy: number; disconnected: number };
  byState: Record<NotifHealthState, number>;
}> {
  const db = admin ?? createAdminClient();
  const { data } = await db
    .from('profiles')
    .select('id, full_name, phone, notif_prefs, push_subscription, push_context, push_verified_at, push_subscribed_at')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true);

  // Per-request "now" is correct for a live ops view.
  const now = Date.now();
  const students: StudentHealth[] = (data ?? []).map((p: any) => {
    const { state, score } = scoreStudent(p, now);
    return {
      id: p.id,
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      state,
      score,
      context: (p.push_context as string | null) ?? null,
      lastVerifiedDays: daysAgo(p.push_verified_at, now),
      subscribedDays: daysAgo(p.push_subscribed_at, now),
    };
  });

  const byState = {
    healthy: 0, unverified: 0, stale: 0,
    disconnected_dead: 0, disconnected_unexplained: 0,
    declined: 0, not_asked: 0,
  } as Record<NotifHealthState, number>;
  for (const s of students) byState[s.state]++;

  const funnel = {
    total: students.length,
    optedIn: students.filter((s) => s.state !== 'not_asked' && s.state !== 'declined').length,
    subscribed: students.filter((s) => ['healthy', 'unverified', 'stale'].includes(s.state)).length,
    verified: byState.healthy,
    healthy: byState.healthy,
    disconnected: byState.disconnected_dead + byState.disconnected_unexplained,
  };

  // Worst first — the students who need action lead the list.
  const order: Record<NotifHealthState, number> = {
    disconnected_dead: 0, disconnected_unexplained: 1, stale: 2, unverified: 3, healthy: 4, declined: 5, not_asked: 6,
  };
  students.sort((a, b) => order[a.state] - order[b.state] || (a.full_name ?? '').localeCompare(b.full_name ?? ''));

  return { students, funnel, byState };
}

export interface SurvivalPoint { ageDays: number; cohort: number; alive: number; pct: number | null }
export interface ReliabilityMetrics {
  survival: SurvivalPoint[];               // 7/14/28-day subscription survival
  today: { pushed: number; received: number; clicked: number };  // the delivery pipeline today
  sameDayDeaths7d: number;                 // subscriptions that died the same IST day they were BORN (not the day the account signed up), last 7d
  deathsWithoutBirth: number;              // integrity: push_died_at set with push_subscribed_at NULL — a death with no birth
}

// The reliability numbers the platform is judged on: does a subscription still
// deliver weeks after it was created (survival), is today's pipeline flowing
// (delivery → receipt → click), and are we still losing subs on signup day
// (the bug we fixed — this must trend to zero).
export async function getReliabilityMetrics(admin?: any): Promise<ReliabilityMetrics> {
  const db = admin ?? createAdminClient();
  const now = Date.now();
  // The STUDY day (3am IST), not IST midnight. Every other surface in the
  // product rolls over at 3am; this one rolled at midnight, so between 00:00
  // and 03:00 IST it reported "0 sent today" while the product still
  // considered it yesterday — a card that reads zero for three hours a night
  // for no reason.
  const dayStart = studyDayStart().toISOString();

  const [{ data: subs }, { data: pushedToday }, { data: deaths }] = await Promise.all([
    db.from('profiles')
      .select('push_subscription, push_subscribed_at')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true)
      .not('push_subscribed_at', 'is', null),
    db.from('notifications').select('pushed_at, received_at, clicked_at').not('pushed_at', 'is', null).gte('pushed_at', dayStart),
    // push_subscribed_at, NOT created_at — see the comparison below.
    db.from('profiles').select('created_at, push_subscribed_at, push_died_at')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true)
      .not('push_died_at', 'is', null).gte('push_died_at', new Date(now - 7 * 86_400_000).toISOString()),
  ]);

  const survival: SurvivalPoint[] = [7, 14, 28].map((ageDays) => {
    const cutoff = now - ageDays * 86_400_000;
    // Cohort = subscriptions old enough to have faced this window.
    const cohortRows = (subs ?? []).filter((r: any) => new Date(r.push_subscribed_at).getTime() <= cutoff);
    const alive = cohortRows.filter((r: any) => r.push_subscription != null).length;
    const cohort = cohortRows.length;
    return { ageDays, cohort, alive, pct: cohort ? Math.round((alive / cohort) * 100) : null };
  });

  const today = {
    pushed: (pushedToday ?? []).length,
    received: (pushedToday ?? []).filter((r: any) => r.received_at != null).length,
    clicked: (pushedToday ?? []).filter((r: any) => r.clicked_at != null).length,
  };

  // "Died the same day it was born" means the SUBSCRIPTION, not the account.
  // This compared push_died_at to created_at — the day the student signed up —
  // which is a different question entirely, and it reported 4 where the real
  // answer is 1. That inflated number is what drives the red "the
  // permission-timing fix may be regressing" banner on mission control, so a
  // metric measuring the wrong thing was raising a false alarm about a fix
  // that is not actually regressing.
  //
  // Also in IST, not UTC: a subscription born 03:00 IST and dying 06:00 IST is
  // one study day but two UTC days, so the old comparison silently missed
  // every same-day death in the 00:00–05:30 IST window.
  //
  // A death with no birth is not a same-day death: 4 profiles carry
  // push_died_at with push_subscribed_at NULL, and those are excluded here and
  // reported separately as an integrity violation.
  const istDay = (t: string) =>
    new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const sameDayDeaths7d = (deaths ?? []).filter(
    (r: any) => r.push_subscribed_at != null && istDay(r.push_died_at) === istDay(r.push_subscribed_at)
  ).length;
  const deathsWithoutBirth = (deaths ?? []).filter((r: any) => r.push_subscribed_at == null).length;

  return { survival, today, sameDayDeaths7d, deathsWithoutBirth };
}
