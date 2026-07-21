import { createAdminClient } from '@/lib/supabase/admin';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The Notification Health Engine (co-founder's ask, 21 July): the backend used
// to treat "a subscription row exists" as "healthy". That is wrong. Healthy =
// permission granted AND a live subscription AND delivery verified recently.
// This computes, for every real student, exactly one health state — so the
// funnel opted-in → subscribed → delivery-verified → healthy is a number we
// watch, not a guess.

export type NotifHealthState =
  | 'healthy'       // sub live + a device confirmed delivery in the last 3 days
  | 'unverified'    // sub live, pushes accepted, but no device beacon yet (new instrumentation, or delivery genuinely not landing)
  | 'stale'         // sub live but last verified delivery is 7+ days old despite pushes since — suspect
  | 'disconnected'  // wants push (prefs on) but NO live subscription — the reconnect flow's job
  | 'never_opted_in'// no push preference — the install/permission funnel's job
  | 'opted_out';    // explicitly turned push off

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
  const prefsPush = (p.notif_prefs as { push?: boolean } | null)?.push === true;
  const hasSub = p.push_subscription != null;
  const verifiedDays = daysAgo(p.push_verified_at, now);

  if (!prefsPush && !hasSub) {
    // Distinguish "never asked / never granted" from "deliberately off".
    return p.notif_prefs && (p.notif_prefs as any).push === false
      ? { state: 'opted_out', score: 0 }
      : { state: 'never_opted_in', score: 0 };
  }
  if (prefsPush && !hasSub) return { state: 'disconnected', score: 10 };
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
    healthy: 0, unverified: 0, stale: 0, disconnected: 0, never_opted_in: 0, opted_out: 0,
  } as Record<NotifHealthState, number>;
  for (const s of students) byState[s.state]++;

  const funnel = {
    total: students.length,
    optedIn: students.filter((s) => s.state !== 'never_opted_in' && s.state !== 'opted_out').length,
    subscribed: students.filter((s) => ['healthy', 'unverified', 'stale'].includes(s.state)).length,
    verified: byState.healthy,
    healthy: byState.healthy,
    disconnected: byState.disconnected,
  };

  // Worst first — the students who need action lead the list.
  const order: Record<NotifHealthState, number> = {
    disconnected: 0, stale: 1, unverified: 2, healthy: 3, never_opted_in: 4, opted_out: 5,
  };
  students.sort((a, b) => order[a.state] - order[b.state] || (a.full_name ?? '').localeCompare(b.full_name ?? ''));

  return { students, funnel, byState };
}

export interface SurvivalPoint { ageDays: number; cohort: number; alive: number; pct: number | null }
export interface ReliabilityMetrics {
  survival: SurvivalPoint[];               // 7/14/28-day subscription survival
  today: { pushed: number; received: number; clicked: number };  // the delivery pipeline today
  sameDayDeaths7d: number;                 // subscriptions that died the same day they were born, last 7d
}

// The reliability numbers the platform is judged on: does a subscription still
// deliver weeks after it was created (survival), is today's pipeline flowing
// (delivery → receipt → click), and are we still losing subs on signup day
// (the bug we fixed — this must trend to zero).
export async function getReliabilityMetrics(admin?: any): Promise<ReliabilityMetrics> {
  const db = admin ?? createAdminClient();
  const now = Date.now();
  const dayStart = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  const [{ data: subs }, { data: pushedToday }, { data: deaths }] = await Promise.all([
    db.from('profiles')
      .select('push_subscription, push_subscribed_at')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true)
      .not('push_subscribed_at', 'is', null),
    db.from('notifications').select('pushed_at, received_at, clicked_at').not('pushed_at', 'is', null).gte('pushed_at', dayStart),
    db.from('profiles').select('created_at, push_died_at')
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

  const sameDayDeaths7d = (deaths ?? []).filter(
    (r: any) => new Date(r.push_died_at).toISOString().slice(0, 10) === new Date(r.created_at).toISOString().slice(0, 10)
  ).length;

  return { survival, today, sameDayDeaths7d };
}
