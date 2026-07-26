// Ranks buddies for a specific free student — powers the "Top buddies for you"
// showcase. Deliberately simple and explainable: a buddy scores higher when
// their strongest section is the student's weakest, and when the student's
// profile type (working professional / repeater / fresher) is one they say
// they help best. Complete profiles (photo, LinkedIn, story) outrank sparse
// ones so buddies are rewarded for finishing setup.

export interface MatchStudent {
  baseline_varc: number | null;
  baseline_dilr: number | null;
  baseline_qa: number | null;
  is_working_professional: boolean | null;
  is_repeater: boolean | null;
}

export interface MatchBuddy {
  id: string;
  full_name: string;
  avatar_url: string | null;
  cat_percentile: number | null;
  first_attempt_percentile: number | null;
  cat_year: number | null;
  iim_converted: string | null;
  current_company: string | null;
  strongest_section: string | null;
  student_types_helped: string[] | null;
  how_i_work: string | null;
  linkedin_url: string | null;
}

export function weakestSection(s: MatchStudent): string | null {
  const sections = [
    { name: 'VARC', val: s.baseline_varc },
    { name: 'DILR', val: s.baseline_dilr },
    { name: 'QA', val: s.baseline_qa },
  ].filter((x): x is { name: string; val: number } => x.val != null);
  if (sections.length < 2) return null;
  return sections.reduce((a, b) => (b.val < a.val ? b : a)).name;
}

// A buddy's own percentile jump between attempts, if she is a repeater
// herself (first_attempt_percentile set). This is real journey data, not a
// self-checked box, so it's the most truthful signal available and should
// outrank "student_types_helped" whenever it's relevant and substantial.
function buddyImprovement(buddy: MatchBuddy): number | null {
  if (buddy.first_attempt_percentile == null || buddy.cat_percentile == null) return null;
  return Number(buddy.cat_percentile) - Number(buddy.first_attempt_percentile);
}

export function matchReason(student: MatchStudent, buddy: MatchBuddy): string | null {
  const weak = weakestSection(student);
  if (weak && buddy.strongest_section === weak) return `Strong in ${weak} — your weakest section`;

  const isRepeaterBuddy = buddy.first_attempt_percentile != null;
  const improvement = buddyImprovement(buddy);

  // A repeater buddy's own comeback is the most specific, most relevant
  // match for a repeater student — more grounded than the generic
  // self-checked "Repeaters" box, and it's what she actually lived.
  if (student.is_repeater && isRepeaterBuddy && improvement != null && improvement >= 3) {
    return `Improved ${Number(buddy.first_attempt_percentile)}→${Number(buddy.cat_percentile)}%ile on the second attempt — been where you are`;
  }

  const types = buddy.student_types_helped ?? [];
  if (student.is_working_professional && types.includes('Working Professionals')) return 'Mentors working professionals like you';
  if (student.is_repeater && types.includes('Repeaters')) return 'Specialises in repeaters';
  // A buddy who herself needed a second attempt isn't a "first-timer success
  // story" — only claim this for buddies who cracked it on their first try,
  // so the copy never contradicts the buddy's own actual journey.
  if (student.is_repeater === false && types.includes('Freshers') && !isRepeaterBuddy) {
    return 'Great with first-time aspirants';
  }
  // Fallback: a dramatic comeback is a compelling, always-true signal even
  // for a student who isn't a repeater themselves.
  if (improvement != null && improvement >= 5) {
    return `Improved ${Number(buddy.first_attempt_percentile)}→${Number(buddy.cat_percentile)}%ile on the second attempt`;
  }
  return null;
}

export function rankBuddies(student: MatchStudent, buddies: MatchBuddy[]): MatchBuddy[] {
  const weak = weakestSection(student);
  const score = (b: MatchBuddy): number => {
    let s = 0;
    if (weak && b.strongest_section === weak) s += 40;
    const isRepeaterBuddy = b.first_attempt_percentile != null;
    const improvement = buddyImprovement(b);
    const types = b.student_types_helped ?? [];
    if (student.is_working_professional && types.includes('Working Professionals')) s += 20;
    if (student.is_repeater && isRepeaterBuddy && improvement != null && improvement >= 3) s += 25;
    else if (student.is_repeater && types.includes('Repeaters')) s += 20;
    if (student.is_repeater === false && types.includes('Freshers') && !isRepeaterBuddy) s += 10;
    // Profile completeness — complete profiles convert, sparse ones don't
    if (b.avatar_url) s += 8;
    if (b.linkedin_url) s += 6;
    if (b.iim_converted) s += 4;
    if (b.how_i_work) s += 2;
    if (b.cat_percentile != null) s += Math.min(5, Math.max(0, Number(b.cat_percentile) - 95));
    return s;
  };
  return [...buddies].sort((a, b) => score(b) - score(a));
}

export interface RecommendedBuddyResult extends MatchBuddy {
  reason: string | null;
}

// Server-only: fetches this student's profile + all showcase-eligible buddies
// (real, setup-complete, non-demo) and returns the ranked top 4 with match
// reasons. Shared by every screen that shows the buddy showcase to a free
// student — profile page, and the paywall screens (buddy tab, chat tab).
export async function getRecommendedBuddiesForStudent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  studentId: string
): Promise<RecommendedBuddyResult[]> {
  const [{ data: student }, { data: buddies }] = await Promise.all([
    admin.from('profiles')
      .select('baseline_varc, baseline_dilr, baseline_qa, is_working_professional, is_repeater')
      .eq('id', studentId).single(),
    admin.from('profiles')
      .select('id, full_name, avatar_url, cat_percentile, first_attempt_percentile, cat_year, iim_converted, current_company, strongest_section, student_types_helped, how_i_work, linkedin_url')
      .eq('role', 'buddy').eq('buddy_onboarding_completed', true)
      .not('cat_percentile', 'is', null)
      .not('is_test_account', 'is', true), // never recommend test/demo buddies to real students
  ]);
  if (!student || !buddies?.length) return [];

  const matchStudent = student as MatchStudent;
  return rankBuddies(matchStudent, buddies as MatchBuddy[])
    .slice(0, 4)
    .map((b) => ({ ...b, reason: matchReason(matchStudent, b) }));
}
