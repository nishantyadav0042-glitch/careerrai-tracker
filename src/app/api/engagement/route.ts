import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/auth';

// Records free-user engagement signals (§D) that drive the sales-ready trigger.
// The hottest signal is buddy_cta_clicks — every reach for the locked buddy.
// Demo sessions are blocked from mutating by the proxy, so this only ever runs
// for real users.
const EVENTS = ['buddy_cta_click', 'tour_completed', 'mock_opened', 'sample_debrief_viewed'] as const;
type EngagementEvent = (typeof EVENTS)[number];

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let event: string | undefined;
  try {
    ({ event } = (await request.json()) as { event?: string });
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!event || !EVENTS.includes(event as EngagementEvent)) {
    return NextResponse.json({ error: 'unknown event' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (event === 'buddy_cta_click') {
    // Atomic increment via RPC; fall back to a read-modify-write if the fn is absent.
    const { error } = await admin.rpc('increment_buddy_cta', { p_student_id: user.id });
    if (error) {
      const { data: row } = await admin
        .from('student_engagement')
        .select('buddy_cta_clicks')
        .eq('student_id', user.id)
        .maybeSingle();
      await admin
        .from('student_engagement')
        .update({ buddy_cta_clicks: (row?.buddy_cta_clicks ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('student_id', user.id);
    }
    // Reaching for the locked buddy is the hottest signal — flag sales-ready now
    // so the founder calls them that same evening (don't wait for the daily cron).
    await admin
      .from('student_engagement')
      .update({ sales_ready: true, sales_ready_at: new Date().toISOString() })
      .eq('student_id', user.id)
      .eq('sales_ready', false);
  } else {
    const flag =
      event === 'tour_completed' ? { tour_completed: true } :
      event === 'mock_opened' ? { mock_opened: true } :
      { sample_debrief_viewed: true };
    // Upsert (not update) so the flag persists even if no row existed yet —
    // otherwise a 0-row update could let the mandatory tour re-show on reload.
    await admin
      .from('student_engagement')
      .upsert({ student_id: user.id, ...flag, updated_at: now }, { onConflict: 'student_id' });
  }

  return NextResponse.json({ ok: true });
}
