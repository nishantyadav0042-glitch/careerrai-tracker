import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { serverError } from '@/lib/api-error';
import { logConsentEvent } from '@/lib/consent-history';

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();

  // Fetch the prior value first — this route replaces the whole notif_prefs
  // column, so the transition (not just the new value) is the only place
  // "the student just turned push off" vs. "push was already off" can be
  // told apart. Best-effort: a failed read here degrades to no history
  // event, never blocks the actual preference write below.
  const { data: before } = await admin.from('profiles').select('notif_prefs').eq('id', user.id).single();
  const prevPush = (before?.notif_prefs as Record<string, unknown> | null)?.push === true;
  const prevPrompted = (before?.notif_prefs as Record<string, unknown> | null)?.push_prompted === true
    || (before?.notif_prefs as Record<string, unknown> | null)?.push_reprompted === true;

  const { error } = await admin
    .from('profiles')
    .update({ notif_prefs: body })
    .eq('id', user.id);

  if (error) return serverError('notif-prefs', error);

  const nextPush = body?.push === true;
  const nextPrompted = body?.push_prompted === true || body?.push_reprompted === true;
  if (prevPush && !nextPush) {
    void logConsentEvent(admin, user.id, 'user_disabled_notifications');
  } else if (!prevPush && !nextPush && !prevPrompted && nextPrompted) {
    // The in-app ask was declined without ever engaging browser permission —
    // push-gate.tsx's decline() path, the one real "no" this data can prove.
    void logConsentEvent(admin, user.id, 'permission_denied');
  }

  return NextResponse.json({ ok: true });
}
