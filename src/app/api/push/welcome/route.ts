import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatch } from '@/lib/notification-os';

// Welcome / verification push (Delivery Verification Engine, 22 July): fired the
// instant a student turns push on INSIDE the installed app. Two jobs — it
// confirms the freshly-minted subscription is genuinely deliverable end-to-end
// (accepted → received_at beacon → push_verified_at → health "healthy"), and it
// gives the student immediate proof their reminders work. This is the closed
// loop that makes "subscribed" become "verified" instead of assumed.
export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('full_name, notif_prefs').eq('id', user.id).single();
  const first = ((profile?.full_name as string | null) ?? '').trim().split(' ')[0] || 'there';

  const title = 'Reminders are on ✓';
  const body = `You're set, ${first}. This is exactly how your daily study plan and insights will reach you — even with the app closed.`;
  const url = '/student/tracker';

  // 16 Aug, Phase 13: used to hard-code { push: true } on the reasoning that
  // this route only fires the instant a student turns push ON, so it's true
  // "by construction". Reading the real value instead costs nothing extra
  // (same query as full_name) and removes the one scenario that reasoning
  // didn't cover: the subscribe write hasn't landed yet when this route
  // runs. If prefs.push genuinely isn't true yet, this one verification
  // push simply doesn't fire — the next app open or the push healer
  // re-establishes it, which is correct, not a regression.
  const outcome = await dispatch({
    userId: user.id, type: 'welcome_verify', title, body, url,
    reason: 'Welcome/verification push on in-app opt-in — proves the new subscription delivers end to end',
    expectedAction: 'open_plan', prefs: (profile?.notif_prefs as Record<string, unknown>) ?? {},
  });
  return NextResponse.json({ ok: outcome === 'sent', reason: outcome !== 'sent' ? outcome : null });
}
