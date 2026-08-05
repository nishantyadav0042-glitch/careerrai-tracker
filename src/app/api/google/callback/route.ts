import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { exchangeCodeAndStore } from '@/lib/google-oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureBuddyRoom } from '@/lib/buddy-room';

export const dynamic = 'force-dynamic';

// Step 2: Google sends the code here. Store tokens, return the mentor to
// wherever they started, with a flag the page can turn into a message.
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const params = new URL(request.url).searchParams;
  const back = decodeURIComponent(params.get('state') || '/buddy/profile');
  const denied = params.get('error');
  const code = params.get('code');

  if (denied || !code) {
    return NextResponse.redirect(new URL(`${back}?google=denied`, request.url));
  }
  const result = await exchangeCodeAndStore(code, user.id);
  if (!result.ok) {
    console.error('[google] connect failed:', result.error);
    return NextResponse.redirect(new URL(`${back}?google=failed`, request.url));
  }

  // A buddy gets their ONE permanent Meet room here, at connect time — the
  // only moment it is ever created. Every session they run for the rest of
  // their time on CareerRai uses this link.
  //
  // A failure is logged, not surfaced: the connection itself succeeded, and
  // the first booking calls ensureBuddyRoom again anyway. Turning a working
  // connection into "failed" over a retryable step would be a lie.
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'buddy') {
    const room = await ensureBuddyRoom(user.id);
    if (!room.ok) console.error('[google] permanent room not created:', room.reason, room.error);
  }

  return NextResponse.redirect(new URL(`${back}?google=connected`, request.url));
}
