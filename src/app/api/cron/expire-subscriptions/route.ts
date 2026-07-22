import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';

// Memberships are one-time purchases, not auto-debit. When a term ends we flip
// the student from 'active' to 'paused' (data fully preserved) so the membership
// card re-shows the plan buttons and they can reactivate manually. Runs daily.
//
// Access is revoked WITH billing (is_premium -> false): every feature gate reads
// is_premium, so leaving it true kept full paid access for free after a lapsed
// term. Data (streak, mocks, debriefs, buddy history) is untouched — only the
// paywall closes; reactivating re-grants premium through the normal payment path
// (and re-queues the buddy, since grant only fires on a false->true flip).
export async function POST(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Find active subscriptions whose renewal date has already passed.
  const { data: lapsed, error } = await admin
    .from('profiles')
    .select('id, full_name')
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
  await admin.from('notifications').insert(
    lapsed.map((p) => ({
      user_id: p.id,
      type: 'membership',
      title: 'Your journey is paused — not gone',
      body: 'Your streak, mocks, debriefs, and buddy are saved. Reactivate anytime to continue exactly where you left off.',
      data: {},
      read: false,
      channel: 'in_app',
    }))
  );

  return NextResponse.json({ expired: ids.length });
}

export { POST as GET };
