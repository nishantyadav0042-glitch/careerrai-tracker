import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { logConsentEvent } from '@/lib/consent-history';

// The Phase 8 fix for the exact gap found investigating Installment 1's 49
// provider-dead students: 7 of them genuinely reopened the app since their
// subscription died, and none of them healed — because push-healer.tsx's
// own catch block was entirely silent. "The healer ran and failed" and "the
// healer never ran" were indistinguishable from the database, forever.
//
// PushHealer calls this ONLY when it actually attempted a recovery
// (server believed the subscription was dead) — not on the routine
// keep-the-server-copy-fresh reuse path, which isn't a recovery event.
// Authenticated the same way /api/push/subscribe is: this writes to the
// caller's own profile row, nothing else.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const ok = (body as { ok?: unknown })?.ok === true;
  const rawReason = (body as { reason?: unknown })?.reason;
  const reason = typeof rawReason === 'string' ? rawReason.slice(0, 500) : null;

  const admin = createAdminClient();
  await admin.from('profiles').update({
    push_recovery_attempted_at: new Date().toISOString(),
    push_recovery_last_error: ok ? null : (reason ?? 'unknown'),
  }).eq('id', user.id);

  await logConsentEvent(admin, user.id, 'recovery_attempted', reason);
  await logConsentEvent(admin, user.id, ok ? 'recovery_succeeded' : 'recovery_failed', reason);

  return NextResponse.json({ ok: true });
}
