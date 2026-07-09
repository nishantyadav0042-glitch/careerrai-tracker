import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendBuilderRecovery } from '@/lib/email';
import { BUILDER_STEPS, stepLabel } from '@/lib/lead-intel';
import { builderRecoveryCopy, dispatch } from '@/lib/notification-os';

// Runs every 30 minutes inside the 09:30–20:30 IST window (see vercel.json —
// the cron schedule IS the quiet-hours gate; a 2am drop gets its first touch
// next morning). The speed-to-contact ladder for Builder drop-offs:
//
//   30 min → 24 h → 72 h since the student last advanced a Builder screen,
//   then automation stops and the lead surfaces in the human intervention
//   queue on /admin/leads (interventionNeeded in lib/lead-intel).
//
// This segment previously got the cruelest sequence in the app: the Day 1-7
// arc crons told them "log karo, 90 seconds" twice a day — an action the
// mandatory Builder gate literally blocks — then went silent forever at day
// 14. Those crons now skip Builder-incomplete students entirely; this cron
// owns them with copy that's true on tap (the tracker reopens the Builder
// with their saved data).
//
// Touches are counted SINCE the anchor: a student who comes back, advances
// one screen, and drops again gets a fresh ladder — a resume is real
// re-engagement, not a dedup bug. Email is the primary channel here
// (mid-Builder students rarely reached the push-permission gate); push
// rides along when granted. Both go through dispatch(), so the global
// 2/day budget and measurement columns apply.
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();

  const { data: candidates } = await admin
    .from('profiles')
    .select('id, full_name, email, notif_prefs, created_at, onboarding_completed, onboarding_step_reached, onboarding_last_activity_at')
    .eq('role', 'student')
    .eq('is_demo', false)
    .gte('created_at', sevenDaysAgo);

  const open = (candidates ?? []).filter((c) => c.onboarding_completed !== true);
  if (!open.length) return NextResponse.json({ sent: 0, reason: 'no_open_drops' });

  const ids = open.map((c) => c.id);
  const { data: prior } = await admin
    .from('notifications')
    .select('user_id, created_at')
    .eq('type', 'builder_recovery')
    .in('user_id', ids);
  const priorByUser = new Map<string, string[]>();
  for (const n of prior ?? []) {
    if (!priorByUser.has(n.user_id)) priorByUser.set(n.user_id, []);
    priorByUser.get(n.user_id)!.push(n.created_at as string);
  }

  let sent = 0;
  for (const c of open) {
    const prefs = (c.notif_prefs ?? {}) as Record<string, unknown>;
    if (prefs.daily_reminder === false) continue;

    const anchorIso = (c.onboarding_last_activity_at as string | null) ?? (c.created_at as string);
    const anchorMs = new Date(anchorIso).getTime();
    const ageMin = (now - anchorMs) / 60_000;

    const dueTouch = ageMin >= 72 * 60 ? 3 : ageMin >= 24 * 60 ? 2 : ageMin >= 30 ? 1 : 0;
    if (dueTouch === 0) continue;

    const sentSinceAnchor = (priorByUser.get(c.id) ?? []).filter((ts) => Date.parse(ts) >= anchorMs).length;
    if (sentSinceAnchor >= dueTouch) continue;

    const stepReached = (c.onboarding_step_reached as number | null) ?? 0;
    const label = stepLabel(stepReached);
    const copy = builderRecoveryCopy(dueTouch as 1 | 2 | 3, label, stepReached, BUILDER_STEPS.length);
    const firstName = ((c.full_name as string | null) ?? '').split(' ')[0] || 'there';
    const screensLeft = Math.max(1, BUILDER_STEPS.length - stepReached);
    const ago = ageMin >= 60 ? `${Math.round(ageMin / 60)}h` : `${Math.round(ageMin)}min`;
    const email = (c.email as string | null);

    const outcome = await dispatch({
      userId: c.id,
      type: 'builder_recovery',
      title: copy.title,
      body: copy.body,
      url: '/student/tracker',
      reason: `Dropped the Builder at "${label}" ${ago} ago — touch ${dueTouch} of 3`,
      expectedAction: 'finish_builder',
      prefs,
      email: email
        ? { to: email, send: () => sendBuilderRecovery(email, firstName, label, screensLeft, dueTouch) }
        : null,
    });
    if (outcome === 'sent') sent++;
  }

  return NextResponse.json({ sent, openDrops: open.length });
}

export { POST as GET };
