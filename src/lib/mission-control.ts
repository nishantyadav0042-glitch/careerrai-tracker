import { createAdminClient } from '@/lib/supabase/admin';
import { getNotificationHealth, getReliabilityMetrics } from '@/lib/notification-health';

/* eslint-disable @typescript-eslint/no-explicit-any */

// CareerRai Mission Control — one live instrument, not a report. The founder's
// framing (22 July): stop optimizing "delivery %", optimize REACHABILITY —
// "how many students could CareerRai reliably reach in the next 5 minutes if it
// absolutely had to." That single number summarizes notification-ecosystem
// health better than any chart. Everything here is real production state; no
// letter grades, no theater.

export type Confidence = 'exact' | 'high' | 'medium' | 'low';

// Rates from small samples swing wildly (167 students → one failure moves a
// metric 2-5%). A census (we know ALL students) is exact; a rate is only as
// trustworthy as its denominator.
export function confidenceFor(sampleSize: number): Confidence {
  if (sampleSize >= 60) return 'high';
  if (sampleSize >= 20) return 'medium';
  return 'low';
}

// The scalar metrics captured each hour into metric_snapshots, and recomputed
// live on the page. Keep this flat so deltas are trivial.
export interface HealthScalars {
  total: number;
  permissionGranted: number;   // prefs.push === true
  reachable: number;           // live subscription right now
  dead: number;                // disconnected (wants push, sub dead)
  disconnected: number;
  healthy: number;             // verified device delivery ≤3d
  reachabilityPct: number;     // reachable / total * 100
  sameDayDeaths7d: number;
  pushedToday: number;
  receivedToday: number;
  clickedToday: number;
}

export async function computeHealthScalars(admin?: any): Promise<HealthScalars> {
  const db = admin ?? createAdminClient();
  const [health, reliability] = await Promise.all([
    getNotificationHealth(db),
    getReliabilityMetrics(db),
  ]);
  const total = health.funnel.total;
  const reachable = health.funnel.subscribed;
  return {
    total,
    permissionGranted: health.funnel.optedIn,
    reachable,
    dead: health.byState.disconnected,
    disconnected: health.byState.disconnected,
    healthy: health.byState.healthy,
    reachabilityPct: total ? Math.round((reachable / total) * 1000) / 10 : 0,
    sameDayDeaths7d: reliability.sameDayDeaths7d,
    pushedToday: reliability.today.pushed,
    receivedToday: reliability.today.received,
    clickedToday: reliability.today.clicked,
  };
}

// Leading indicators — subscription-age cohorts and their survival. This is the
// EARLY warning the founder asked for: if the 1-3 day cohort starts dying, we
// know days before 28-day retention collapses. Watch the young cohorts.
export interface AgeCohort { label: string; total: number; alive: number; pct: number | null; confidence: Confidence }

export async function computeAgeCohorts(admin?: any): Promise<AgeCohort[]> {
  const db = admin ?? createAdminClient();
  const { data } = await db.from('profiles')
    .select('push_subscription, push_subscribed_at')
    .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true)
    .not('push_subscribed_at', 'is', null);
  const now = Date.now();
  const DAY = 86_400_000;
  const buckets: { label: string; lo: number; hi: number }[] = [
    { label: '<1 day', lo: 0, hi: 1 },
    { label: '1–3 days', lo: 1, hi: 3 },
    { label: '3–7 days', lo: 3, hi: 7 },
    { label: '7–14 days', lo: 7, hi: 14 },
    { label: '14–28 days', lo: 14, hi: 28 },
    { label: '28+ days', lo: 28, hi: Infinity },
  ];
  return buckets.map((b) => {
    const rows = (data ?? []).filter((r: any) => {
      const age = (now - new Date(r.push_subscribed_at).getTime()) / DAY;
      return age >= b.lo && age < b.hi;
    });
    const alive = rows.filter((r: any) => r.push_subscription != null).length;
    const total = rows.length;
    return { label: b.label, total, alive, pct: total ? Math.round((alive / total) * 100) : null, confidence: confidenceFor(total) };
  });
}

// Which OS owns each headline metric — so "who fixes what" is never ambiguous.
export const METRIC_OWNER: Record<string, string> = {
  reachability: 'Notification OS',
  permission: 'Growth OS',
  reachable: 'Notification OS',
  dead: 'Notification OS',
  sameDayDeaths: 'Notification OS',
  delivery: 'Notification OS',
  studyFromPush: 'Learning OS',
};

// Alert thresholds — don't wait for a human to be staring at the page.
export interface Alert { level: 'warn' | 'critical'; metric: string; message: string }

export function evaluateAlerts(now: HealthScalars, prev: HealthScalars | null): Alert[] {
  const alerts: Alert[] = [];
  if (now.sameDayDeaths7d > 1) {
    alerts.push({ level: 'critical', metric: 'sameDayDeaths', message: `${now.sameDayDeaths7d} same-day subscription deaths in the last 7 days — the permission-timing fix may be regressing.` });
  }
  if (prev) {
    const reachDrop = prev.reachabilityPct - now.reachabilityPct;
    if (reachDrop >= 5) {
      alerts.push({ level: 'critical', metric: 'reachability', message: `Reachability dropped ${reachDrop.toFixed(1)} points (was ${prev.reachabilityPct}%, now ${now.reachabilityPct}%).` });
    }
    if (now.dead - prev.dead >= 3) {
      alerts.push({ level: 'warn', metric: 'dead', message: `Dead subscriptions rose by ${now.dead - prev.dead} since the last snapshot.` });
    }
  }
  return alerts;
}
