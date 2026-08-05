import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { exchangeCodeAndStore } from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureBuddyRoom } from '@/lib/buddy-room';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// Step 2: Google sends the code here. Store tokens, return the mentor to
// wherever they started, with a flag the page can turn into a message.
//
// EVERY outcome is audited, including the failures. The first version only
// logged success, which meant a mentor saying "it won't connect" left no trace
// at all — the token table was empty and so was the audit log, and there was
// no way to tell "Google refused us" from "the user pressed cancel" from
// "they never got here". A failure nobody can read is a failure you debug
// twice.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const params = new URL(request.url).searchParams;
  const back = decodeURIComponent(params.get('state') || '/buddy/profile');
  const denied = params.get('error');
  const deniedDescription = params.get('error_description');
  const code = params.get('code');

  if (denied || !code) {
    // Google's own error code is the useful part. `access_denied` is someone
    // pressing Cancel; `admin_policy_enforced` or `org_internal` means their
    // Workspace blocked it; anything else usually means the OAuth app is not
    // configured for this account. Recording it is the difference between a
    // guess and an answer.
    await audit({
      subjectId: user.id, action: 'google.connect_failed', ok: false,
      detail: {
        stage: 'consent',
        googleError: denied ?? 'no_code_returned',
        googleErrorDescription: deniedDescription,
      },
    });
    return NextResponse.redirect(new URL(`${back}?google=denied`, request.url));
  }

  const result = await exchangeCodeAndStore(code, user.id);
  if (!result.ok) {
    console.error('[google] connect failed:', result.error);
    await audit({
      subjectId: user.id, action: 'google.connect_failed', ok: false,
      detail: { stage: 'token_exchange', reason: result.error },
    });
    return NextResponse.redirect(new URL(`${back}?google=failed`, request.url));
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  await audit({ subjectId: user.id, action: 'google.connected', detail: { email: result.email, role: profile?.role ?? null } });

  // A buddy gets their ONE permanent Meet room here, at connect time — the
  // only moment it is ever created. Every session they run for the rest of
  // their time on CareerRai uses this link.
  //
  // A failure is logged, not surfaced: the connection itself succeeded, and
  // the first booking calls ensureBuddyRoom again anyway. Turning a working
  // connection into "failed" over a retryable step would be a lie.
  if (profile?.role === 'buddy') {
    const room = await ensureBuddyRoom(user.id);
    if (!room.ok) console.error('[google] permanent room not created:', room.reason, room.error);
  }

  return NextResponse.redirect(new URL(`${back}?google=connected`, request.url));
}
