import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { disconnectGoogle } from '@/lib/google-oauth';

// Disconnecting clears the token AND the permanent room — see clearGoogleState.
// Leaving the room behind would let the app keep handing out a link on a
// calendar it can no longer read, write or cancel.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await disconnectGoogle(user.id, user.id);
  return NextResponse.json({
    ok: true,
    note: 'Google disconnected. Your meeting room was removed — reconnecting creates a new one.',
  });
}
