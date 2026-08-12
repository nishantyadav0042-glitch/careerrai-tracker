import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { campaignState } from '@/lib/campaign';
import { campaignSeatsSold } from '@/lib/pricing';

// GET /api/campaign — the campaign as THIS student sees it.
//
// One endpoint feeds every surface (Home card, contextual CTA, /offer page,
// and the push copy), so the price, the seat count and the deadline can never
// disagree between two screens — the failure this codebase keeps paying for.
//
// `eligible` is deliberately separate from `live`: the campaign can be live
// while a particular student should not be sold to (already premium). A
// premium student sees nothing, ever — no "upgrade" nag to someone who paid.
export const dynamic = 'force-dynamic';

export async function GET() {
  const sold = await campaignSeatsSold();
  const state = campaignState(new Date(), sold);

  const user = await getAuthUser();
  if (!user) {
    // Logged-out (/offer from an ad or a WhatsApp link): show the offer, no
    // personalisation. Signing up is the next step, not a blocker.
    return NextResponse.json({ ...state, eligible: state.live, isPremium: false });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_premium, role')
    .eq('id', user.id)
    .maybeSingle();

  const isPremium = profile?.is_premium === true;
  const isStudent = (profile?.role ?? 'student') === 'student';

  return NextResponse.json({
    ...state,
    isPremium,
    eligible: state.live && isStudent && !isPremium,
  });
}
