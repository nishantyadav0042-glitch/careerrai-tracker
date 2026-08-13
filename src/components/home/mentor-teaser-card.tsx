import { createAdminClient } from '@/lib/supabase/admin';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

// ── Home's mentor teaser — the piece that was genuinely missing ─────────────
//
// The 9 Aug mock's S3 showed a small card between the plan and the footer
// links: a real buddy, one line of proof, "Meet her →". Home never had an
// equivalent of this at all — not a styling gap, an absent card.
//
// Two honest states, same as everywhere else this session touched mentor
// data:
//
//   PREMIUM WITH A REAL BUDDY — show that one real person. True.
//
//   EVERYONE ELSE — show the real top-ranked match from the SAME showcase
//   function the paywall and onboarding already use (getRecommendedBuddies
//   ForStudent). Never a specific-assignment claim this student cannot back,
//   since real assignment is admin-driven and only happens post-payment (see
//   the mentor-match honesty fix, same session). The honest framing here is
//   "a mentor who'd fit you" — real name, real stats, a link to see more.
export async function MentorTeaserCard({ studentId, buddyId, isPremium }: {
  studentId: string;
  buddyId: string | null;
  isPremium: boolean;
}) {
  const admin = createAdminClient();

  if (isPremium && buddyId) {
    const { data: buddy } = await admin
      .from('profiles')
      .select('full_name, avatar_url, college, iim_converted, cat_percentile')
      .eq('id', buddyId)
      .maybeSingle();
    if (!buddy) return null;
    const initials = (buddy.full_name ?? 'B').split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    return (
      <Link href="/student/buddy" className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm">
        {buddy.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={buddy.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-600 to-teal-700 text-sm font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-extrabold text-stone-900">{buddy.full_name} · your mentor</p>
          <p className="truncate text-[11px] text-stone-500">
            {(buddy.college ?? buddy.iim_converted?.split(',')[0]?.trim()) ?? 'IIM mentor'}
            {buddy.cat_percentile != null ? ` · CAT ${Number(buddy.cat_percentile)}%ile` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700">Meet her →</span>
      </Link>
    );
  }

  // Not premium (or premium but not yet assigned): the real showcase pool,
  // same engine as My Buddy and onboarding, honestly framed.
  const pool = await getRecommendedBuddiesForStudent(admin, studentId);
  const top = pool[0];
  if (!top) return null;
  const initials = (top.full_name ?? 'B').split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Link href="/student/buddy" className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm">
      {top.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={top.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-600 to-teal-700 text-sm font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-[13.5px] font-extrabold text-stone-900">
          <Sparkles className="h-3 w-3 shrink-0 text-orange-500" />{top.full_name}
        </p>
        <p className="truncate text-[11px] text-stone-500">
          {(top.iim_converted?.split(',')[0]?.trim()) ?? 'IIM mentor'}
          {top.cat_percentile != null ? ` · CAT ${Number(top.cat_percentile)}%ile` : ''}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700">See mentors →</span>
    </Link>
  );
}
