import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';

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

  // Fired the instant a student turns push ON, so prefs.push is true by
  // construction at this exact moment — forced rather than re-read, because
  // this route's whole job is proving THIS subscription works right now, not
  // re-deciding whether to.
  const outcome = await dispatch({
    userId: user.id, type: 'welcome_verify', title, body, url,
    reason: 'Welcome/verification push on in-app opt-in — proves the new subscription delivers end to end',
    expectedAction: 'open_plan', prefs: { push: true },
  });
  return NextResponse.json({ ok: outcome === 'sent', reason: outcome !== 'sent' ? outcome : null });
}
