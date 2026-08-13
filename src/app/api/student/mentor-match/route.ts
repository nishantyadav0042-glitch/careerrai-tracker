import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';

export const dynamic = 'force-dynamic';

// The onboarding "Meet your mentor" screen's data.
//
// Two genuinely different states, and the honesty line runs between them:
//
//   ASSIGNED (me.buddy_id set) — a real match exists. Return exactly that one
//   person; the screen may say "your mentor" because it is true.
//
//   NOT ASSIGNED (everyone else, i.e. almost every new signup) — no match has
//   happened. `buddy_id` is written by a human admin AFTER payment
//   (api/admin/assign-buddy), never automatically and never at onboarding
//   time. So this branch can only honestly return a POOL of real mentors the
//   student could end up with, never a single "matched for you" claim.
//
// Founder, 13 Aug, on exactly this distinction: real mentor pool, no fake
// match — no claim that one specific person is already assigned.
//
// This used to hand-roll its own buddy fetch and ranking for the unassigned
// case — a second, drifting copy of the exact scoring
// getRecommendedBuddiesForStudent already does for the /student/buddy
// showcase and sales-conversion.ts. Reusing it here means onboarding, the
// paywall and sales all rank buddies with the one engine, not three.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('profiles')
    .select('buddy_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  if (me.buddy_id) {
    const PUBLIC_FIELDS = 'id, full_name, avatar_url, cat_percentile, first_attempt_percentile, iim_converted, strongest_section, how_i_work, college, buddy_bio';
    const { data: buddy } = await admin.from('profiles').select(PUBLIC_FIELDS).eq('id', me.buddy_id).maybeSingle();
    if (buddy) {
      return NextResponse.json({ assigned: true, mentor: shapeMentor(buddy), mentors: [] });
    }
  }

  const pool = await getRecommendedBuddiesForStudent(admin, user.id);
  return NextResponse.json({
    assigned: false,
    mentor: null,
    // Top 3, not 4 — this card has less room than the full buddy showcase and
    // three real cards already make the "this is a real pool" point.
    mentors: pool.slice(0, 3).map((b) => shapeMentor(b, b.reason)),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shapeMentor(m: any, reason?: string | null) {
  const first = m.first_attempt_percentile != null ? Number(m.first_attempt_percentile) : null;
  const final = m.cat_percentile != null ? Number(m.cat_percentile) : null;
  return {
    firstName: (m.full_name ?? 'A CareerRai mentor').split(' ')[0],
    fullName: m.full_name,
    college: m.college ?? m.iim_converted?.split(',')[0]?.trim() ?? null,
    avatarUrl: m.avatar_url ?? null,
    // "72 → 98.2" only when the climb is real, same rule the push copy uses.
    journey: final == null ? null : first != null && final > first ? `CAT ${first} → ${final}%ile` : `CAT ${final}%ile`,
    bio: m.buddy_bio ?? m.how_i_work ?? null,
    matchedOn: reason ? [reason] : [],
  };
}
