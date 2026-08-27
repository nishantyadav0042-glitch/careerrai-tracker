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
    if (!lapsed?.length) return NextResponse.json({ expired: 0 });

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

    return NextResponse.json({ expired: ids.length });
  });
}

export { POST as GET };
