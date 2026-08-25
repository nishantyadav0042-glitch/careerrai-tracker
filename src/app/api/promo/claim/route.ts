import { NextResponse } from 'next/server';
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

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ show: false, reason: 'unauthenticated' }, { status: 401 });

  const claim = await claimBuddyPitch(createAdminClient(), user.id, 'modal');
  return NextResponse.json(claim);
}
