import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { rankBuddies, type MatchBuddy, type MatchStudent } from '@/lib/buddy-match';

export const dynamic = 'force-dynamic';

// The student's best-matched mentor, PUBLIC fields only — for the onboarding
// "Meet your mentor" screen (founder S2, 10 Aug: "real buddy → real profile;
// never simulate a relationship that doesn't exist"). Same rankBuddies match
// the evening nudge already computes, so the screen and the push tell one
// story. Returns the assigned buddy when one exists; otherwise the top match
// with the honest framing left to the client ("matching is confirmed after
// you upgrade").
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('profiles')
    .select('buddy_id, baseline_varc, baseline_dilr, baseline_qa, is_working_professional, is_repeater')
    .eq('id', user.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const PUBLIC_FIELDS =
    'id, full_name, avatar_url, cat_percentile, first_attempt_percentile, cat_year, iim_converted, current_company, strongest_section, student_types_helped, how_i_work, linkedin_url, college, buddy_bio';

  type MentorRow = MatchBuddy & { college?: string | null; buddy_bio?: string | null };
  let mentor: MentorRow | null = null;
  let assigned = false;

  if (me.buddy_id) {
    const { data } = await admin.from('profiles').select(PUBLIC_FIELDS).eq('id', me.buddy_id).maybeSingle();
    if (data) { mentor = data as unknown as MentorRow; assigned = true; }
  }
  if (!mentor) {
    const { data: buddies } = await admin
      .from('profiles')
      .select(PUBLIC_FIELDS)
      .eq('role', 'buddy')
      .not('is_test_account', 'is', true);
    const ranked = rankBuddies(me as MatchStudent, (buddies ?? []) as unknown as MatchBuddy[]);
    mentor = (ranked[0] as MentorRow | undefined) ?? null;
  }
  if (!mentor) return NextResponse.json({ mentor: null, assigned: false });

  const first = mentor.first_attempt_percentile != null ? Number(mentor.first_attempt_percentile) : null;
  const final = mentor.cat_percentile != null ? Number(mentor.cat_percentile) : null;

  return NextResponse.json({
    assigned,
    mentor: {
      firstName: (mentor.full_name ?? 'Your mentor').split(' ')[0],
      fullName: mentor.full_name,
      college: mentor.college ?? mentor.iim_converted?.split(',')[0]?.trim() ?? null,
      avatarUrl: mentor.avatar_url ?? null,
      // "72 → 98.2" only when the climb is real — same rule as the push copy.
      journey: final == null ? null : first != null && final > first ? `CAT ${first} → ${final}%ile` : `CAT ${final}%ile`,
      bio: mentor.buddy_bio ?? mentor.how_i_work ?? null,
      // Why THIS mentor, in the student's own facts.
      matchedOn: [
        me.is_repeater ? 'Repeater journey' : 'First-attempt journey',
        me.is_working_professional ? 'Working-day schedule' : null,
        mentor.strongest_section ? `Strong in ${mentor.strongest_section}` : null,
      ].filter(Boolean),
    },
  });
}
