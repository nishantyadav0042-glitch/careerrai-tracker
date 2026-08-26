import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { claimBuddyPitch } from '@/lib/promo-impression';

// POST /api/promo/claim — the browser asking "may I show the Buddy pitch?"
//
// The student can only ever claim FOR THEMSELVES: the id comes from the
// session, never the body, so this cannot burn someone else's daily slot.
// The table itself is service_role-only; the browser reaches it exclusively
// through this door, and the door's answer is final — a "no" here means the
// modal does not mount, whatever localStorage thinks.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ show: false, reason: 'unauthenticated' }, { status: 401 });

  // Channel from the body, allow-listed. Only the two browser-side claimants
  // exist: the home modal, and the onboarding pitch screens (which consume
  // day 0 so the evening notification cannot make it a two-pitch day).
  // 'notification' and 'approved_push' are server-side claims and are NOT
  // accepted here — a browser must not be able to impersonate a channel it
  // does not own.
  const body = await request.json().catch(() => ({}));
  const channel = body?.channel === 'onboarding' ? 'onboarding' : 'modal';

  const claim = await claimBuddyPitch(createAdminClient(), user.id, channel);
  return NextResponse.json(claim);
}
