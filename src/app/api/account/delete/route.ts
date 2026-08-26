import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/account/delete — permanent, user-initiated account deletion.
// Required by both Google Play (public + in-app deletion) and Apple App Store
// (Guideline 5.1.1(v): in-app account deletion). Wipes ALL personal data via
// the delete_student_account RPC (atomic cascade), then removes the auth
// identity, then clears the session.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Only students self-delete here. A buddy/admin deleting themselves via this
  // route would orphan the students they serve — send them to support instead.
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'No account found' }, { status: 404 });
  if (profile.role !== 'student') {
    return NextResponse.json(
      { error: 'This account type must be closed by our team. Please email business@careerrai.com.' },
      { status: 403 }
    );
  }

  // 1) Wipe every row of personal data (atomic — the compliance-critical step).
  const { error: rpcError } = await admin.rpc('delete_student_account', { p_id: user.id });
  if (rpcError) {
    return NextResponse.json(
      { error: 'We could not delete your account automatically. Please email business@careerrai.com and we will remove it.' },
      { status: 500 }
    );
  }

  // 2) Remove the auth identity (login, sessions, refresh tokens). Data is
  //    already gone; a lingering auth row is harmless (no profile => no access),
  //    so a failure here is non-fatal — the deletion still counts as complete.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);

  // 3) Clear this browser's session cookie (best effort — the user is gone).
  // GLOBAL on purpose — the one place it is correct. The account is being
  // destroyed, so every session on every device must die with it. Everywhere
  // else, a logout is local (see api/auth/logout).
  try { await supabase.auth.signOut({ scope: 'global' }); } catch { /* noop */ }

  return NextResponse.json({ ok: true, authRemoved: !authError });
}
