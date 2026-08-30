import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { withCronTracking } from '@/lib/cron-run-tracker';
import { dispatch } from '@/lib/notification-os';

// Memberships are one-time purchases, not auto-debit. When a term ends we flip
// the student from 'active' to 'paused' (data fully preserved) so the membership
// card re-shows the plan buttons and they can reactivate manually. Runs daily.
//
// Access is revoked WITH billing (is_premium -> false). What that actually
// gates is the MENTOR — the buddy panel and mentor chat. The tracker, plan,
// analysis, reports and exams stay free and fully usable; what students pay for
// is time with a real person, not access to software. Data (streak, mocks,
// debriefs, buddy history) is untouched; reactivating re-grants premium through
// the normal payment path (and re-queues the buddy, since grant only fires on a
// false->true flip).
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return withCronTracking('/api/cron/expire-subscriptions', async () => {

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // Find active subscriptions whose renewal date has already passed.
    const { data: lapsed, error } = await admin
      .from('profiles')
      .select('id, full_name, notif_prefs')
      .eq('subscription_status', 'active')
      .lt('subscription_renews_at', nowIso);

    if (error) {
      console.error('[expire-subscriptions]', error);
      return NextResponse.json({ error: 'query failed' }, { status: 500 });
    }
    // NO early return here: sweep 2 below must run on every tick, and the common
    // case is that nothing lapsed today. Bailing would mean the unbacked-premium
    // net only ever ran on the rare day a subscription happened to end.
    if (!lapsed?.length) {
      return NextResponse.json({ expired: 0, revoked: await revokeUnbackedPremium(admin) });
    }

    const ids = lapsed.map((p) => p.id);

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ subscription_status: 'paused', is_premium: false })
      .in('id', ids);

    if (updateErr) {
      console.error('[expire-subscriptions]', updateErr);
      return NextResponse.json({ error: 'update failed' }, { status: 500 });
    }

    // Cancel any still-pending buddy assignment for lapsed students (mirrors
    // revokePremium's refund path) so a paused member isn't handed a new buddy.
    await admin
      .from('buddy_assignment_queue')
      .update({ status: 'cancelled' })
      .in('student_id', ids)
      .eq('status', 'pending');

    // Nudge each student in-app — continuity, not a hard stop.
    // Through dispatch() — continuity, not a hard stop, and the student
    // should hear it from us rather than discover a missing buddy.
    for (const p of lapsed) {
      await dispatch({
        userId: p.id as string,
        type: 'membership',
        title: 'Your mentorship has ended',
        body: 'Your streak, mocks and debriefs stay yours — keep using them free. Reactivate whenever you want your IIM mentor back.',
        url: '/student/profile',
        reason: 'Subscription lapsed — say what they keep before they notice what they lost',
        expectedAction: 'acknowledge',
        prefs: ((p as { notif_prefs?: unknown }).notif_prefs as Record<string, unknown>) ?? {},
      });
    }

    return NextResponse.json({ expired: ids.length, revoked: await revokeUnbackedPremium(admin) });
  });
}

/**
 * SWEEP 2 — premium that no paid window backs, which sweep 1 can never reach.
 *
 * grantPremiumAndQueueBuddy sets is_premium and premium_since; it does NOT set
 * subscription_status or subscription_renews_at — its callers do, in the same
 * breath. A grant that ran without its caller's subscription write therefore
 * leaves is_premium=true with status 'free' and renews_at NULL, and the sweep
 * above cannot see it: that one only looks at rows already marked 'active' with
 * a date in the past. The result is access with no end date and no way to end it.
 *
 * Production held three such rows. What they were entitled to was not what they
 * had: two were single-SESSION buyers (one session plus three mentor messages) and one had
 * never paid at all — while resolveChatEntitlement grants UNLIMITED mentor chat
 * on is_premium alone. A session was quietly buying the subscription.
 *
 * All three code paths that grant premium are correctly plan-gated today
 * (activatePaidOrder returns early for a session, retry-unlock refuses a
 * non-plan payment, create-order writes the window), so this is not a leak still
 * open. It is the repair for records that predate those gates, and the net that
 * stops the shape persisting unnoticed if it ever recurs.
 *
 * NO NOTIFICATION, on purpose. "Your mentorship has ended" is true for a lapsed
 * subscriber and false for someone who never had a subscription — sending it
 * would tell a session buyer they lost something they never bought. The ids are
 * returned and logged instead, so the change is auditable and the founder
 * decides what, if anything, to say.
 */
async function revokeUnbackedPremium(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, subscription_status, is_test_account, is_demo')
    .eq('is_premium', true);
  if (error) {
    console.error('[expire-subscriptions] unbacked-premium query failed:', error.message);
    return 0;
  }

  // Filtered HERE rather than in the query: `.eq(col, false)` drops rows where
  // the flag is NULL — which is most of them — so pushing this into PostgREST
  // would have swept the App Store reviewer and the demo login along with the
  // real anomalies, and failed the next iOS review on a login that lost access.
  const unbacked = (rows ?? []).filter(
    (r) => r.subscription_status !== 'active' && r.is_test_account !== true && r.is_demo !== true,
  );
  if (!unbacked.length) return 0;

  const ids = unbacked.map((r) => r.id as string);
  const { error: revokeErr } = await admin
    .from('profiles').update({ is_premium: false }).in('id', ids);
  if (revokeErr) {
    console.error('[expire-subscriptions] unbacked-premium revoke failed:', revokeErr.message);
    return 0;
  }

  console.error(
    `[expire-subscriptions] revoked premium with no paid window from ${ids.length}: ${ids.join(', ')}`,
  );
  return ids.length;
}

export { POST as GET };
