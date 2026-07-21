import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';

// Welcome / verification push (Delivery Verification Engine, 22 July): fired the
// instant a student turns push on INSIDE the installed app. Two jobs — it
// confirms the freshly-minted subscription is genuinely deliverable end-to-end
// (accepted → received_at beacon → push_verified_at → health "healthy"), and it
// gives the student immediate proof their reminders work. This is the closed
// loop that makes "subscribed" become "verified" instead of assumed.
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
  const first = ((profile?.full_name as string | null) ?? '').trim().split(' ')[0] || 'there';

  const title = 'Reminders are on ✓';
  const body = `You're set, ${first}. This is exactly how your daily study plan and insights will reach you — even with the app closed.`;
  const url = '/student/tracker';

  const { data: row } = await admin
    .from('notifications')
    .insert({
      user_id: user.id, type: 'welcome_verify', title, body,
      data: { url }, read: false, channel: 'in_app',
      reason: 'Welcome/verification push on in-app opt-in — proves the new subscription delivers end to end',
      expected_action: 'open_plan',
    })
    .select('id')
    .single();

  const res = await sendPushToUser(user.id, { title, body, url, notifId: row?.id as string });
  if (res.ok && row?.id) {
    await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', row.id);
  }
  return NextResponse.json({ ok: res.ok, reason: res.reason ?? null });
}
