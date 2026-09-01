import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendAdminAlert } from '@/lib/email';
import { withCronTracking } from '@/lib/cron-run-tracker';
import {
  detectReachAnomalies, alertableSurfaces,
  type ReachSurface, type SurfaceWindow,
} from '@/lib/notification-reach-alerts';

// ── The watch that should have existed on 10 August ─────────────────────────
//
// On 10 Aug the iOS install route changed and Apple Web Push acquisition went
// to ZERO on a surface that had converted all through July. It was found three
// weeks later, by a founder asking a question. This job exists so that class of
// collapse announces itself the next morning instead.
//
// It DECIDES nothing: every threshold lives in lib/notification-reach-alerts.ts
// as a pure function, so the 10 Aug shape is replayed against it in tests. This
// route only gathers the numbers and hands them over.
//
// It also sends nothing new to students. The only output is an admin email on
// the existing sendAdminAlert rail.

export const maxDuration = 300;

const DAY = 86_400_000;
const WINDOW_DAYS = 7;

type Row = { user_id: string | null; display_mode: string | null; platform: string | null };

/** The reach audit's surface definition, in one place. */
function surfaceOf(modes: Set<string>, platforms: Set<string>): ReachSurface {
  if (modes.has('ios_app')) return 'ios_wrapper';
  if (platforms.has('ios')) return 'ios_pwa';
  if (platforms.has('desktop')) return 'desktop_pwa';
  return 'android_pwa';
}

export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return withCronTracking('/api/cron/notification-reach-watch', async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const curFrom = new Date(now - WINDOW_DAYS * DAY).toISOString();
    const prevFrom = new Date(now - 2 * WINDOW_DAYS * DAY).toISOString();

    // Who is on which surface, over both windows.
    const { data: events, error: evErr } = await admin
      .from('student_events')
      .select('user_id, display_mode, platform')
      .gte('created_at', prevFrom)
      .in('display_mode', ['standalone', 'twa', 'ios_app'])
      .not('user_id', 'is', null)
      .limit(100_000);

    // An unavailable read must SUPPRESS the alarm, never manufacture one —
    // the same rule the companion cron learned the hard way (B3b migration).
    if (evErr) {
      console.error('[reach-watch] surface read failed, standing down:', evErr.message);
      return NextResponse.json({ ok: true, skipped: 'surface_read_unavailable' });
    }

    const modes = new Map<string, Set<string>>();
    const plats = new Map<string, Set<string>>();
    for (const r of (events ?? []) as Row[]) {
      const id = r.user_id!;
      if (!modes.has(id)) { modes.set(id, new Set()); plats.set(id, new Set()); }
      if (r.display_mode) modes.get(id)!.add(r.display_mode);
      if (r.platform) plats.get(id)!.add(r.platform);
    }
    const surfaceByStudent = new Map<string, ReachSurface>();
    for (const id of modes.keys()) surfaceByStudent.set(id, surfaceOf(modes.get(id)!, plats.get(id)!));

    // New subscriptions per surface, this window vs the one before.
    const { data: enabled } = await admin
      .from('student_events')
      .select('user_id, created_at')
      .eq('event', 'push_enabled')
      .gte('created_at', prevFrom)
      .limit(50_000);

    const blank = () => ({ cur: 0, prev: 0 });
    const subs = new Map<ReachSurface, { cur: number; prev: number }>();
    for (const e of (enabled ?? []) as { user_id: string | null; created_at: string }[]) {
      const s = e.user_id ? surfaceByStudent.get(e.user_id) : undefined;
      if (!s) continue;
      if (!subs.has(s)) subs.set(s, blank());
      if (e.created_at >= curFrom) subs.get(s)!.cur++; else subs.get(s)!.prev++;
    }

    // Verified endpoints and deaths, per surface, right now.
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, push_subscription, push_verified_at, push_died_at')
      .limit(50_000);

    const verified = new Map<ReachSurface, number>();
    const died = new Map<ReachSurface, { cur: number; prev: number }>();
    const capable = new Map<ReachSurface, number>();
    for (const [id, s] of surfaceByStudent) capable.set(s, (capable.get(s) ?? 0) + 1);
    for (const p of (profiles ?? []) as { id: string; push_subscription: unknown; push_verified_at: string | null; push_died_at: string | null }[]) {
      const s = surfaceByStudent.get(p.id);
      if (!s) continue;
      if (p.push_subscription && p.push_verified_at && p.push_verified_at >= new Date(now - 30 * DAY).toISOString()) {
        verified.set(s, (verified.get(s) ?? 0) + 1);
      }
      if (p.push_died_at) {
        if (!died.has(s)) died.set(s, blank());
        if (p.push_died_at >= curFrom) died.get(s)!.cur++; else if (p.push_died_at >= prevFrom) died.get(s)!.prev++;
      }
    }

    const windows: SurfaceWindow[] = (['android_pwa', 'ios_pwa', 'ios_wrapper', 'desktop_pwa'] as ReachSurface[])
      .map((surface) => ({
        surface,
        capableStudents: capable.get(surface) ?? 0,
        newSubscriptions: subs.get(surface)?.cur ?? 0,
        prevNewSubscriptions: subs.get(surface)?.prev ?? 0,
        verifiedEndpoints: verified.get(surface) ?? 0,
        // Endpoint history per surface is not retained, so week-over-week reach
        // is NOT MEASURED rather than guessed. null cannot raise an alarm.
        prevVerifiedEndpoints: 0,
        sendAttempted: null,
        providerAccepted: null,
        swReceived: null,
        died: died.get(surface)?.cur ?? 0,
        prevDied: died.get(surface)?.prev ?? 0,
      }));

    const anomalies = detectReachAnomalies(alertableSurfaces(windows));

    if (anomalies.length > 0) {
      const p0 = anomalies.filter((a) => a.severity === 'P0');
      await sendAdminAlert(
        `${p0.length > 0 ? '🚨 P0' : '⚠️'} Notification reach: ${anomalies.length} anomaly(ies)`,
        `<p>The reach watch found a funnel stage that broke. Each line names the STAGE, not just "notifications are down".</p><ul>${
          anomalies.map((a) => `<li><strong>[${a.severity}] ${a.stage}</strong> — ${a.detail}</li>`).join('')
        }</ul><p style="color:#57534e">Surfaces judged: ${alertableSurfaces(windows).map((w) => `${w.surface} (${w.capableStudents} capable, ${w.newSubscriptions} new subs, ${w.verifiedEndpoints} verified)`).join(' · ')}. The iOS App Store wrapper is excluded by design — it converts zero every window because a WKWebView has no Web Push API, and alerting on it daily would make this channel noise.</p>`
      ).catch((e) => console.error('[reach-watch] alert send failed:', e));
    }

    return NextResponse.json({
      ok: true,
      anomalies: anomalies.length,
      kinds: anomalies.map((a) => `${a.severity}:${a.kind}:${a.surface}`),
      windows: windows.map((w) => ({ s: w.surface, capable: w.capableStudents, subs: w.newSubscriptions, verified: w.verifiedEndpoints })),
    });
  });
}
