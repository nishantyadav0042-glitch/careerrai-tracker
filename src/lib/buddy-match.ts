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

export function matchReason(student: MatchStudent, buddy: MatchBuddy): string | null {
  const weak = weakestSection(student);
  if (weak && buddy.strongest_section === weak) return `Strong in ${weak} — your weakest section`;
  const types = buddy.student_types_helped ?? [];
  if (student.is_working_professional && types.includes('Working Professionals')) return 'Mentors working professionals like you';
  if (student.is_repeater && types.includes('Repeaters')) return 'Specialises in repeaters';
  if (student.is_repeater === false && types.includes('Freshers')) return 'Great with first-time aspirants';
  return null;
}

export function rankBuddies(student: MatchStudent, buddies: MatchBuddy[]): MatchBuddy[] {
  const weak = weakestSection(student);
  const score = (b: MatchBuddy): number => {
    let s = 0;
    if (weak && b.strongest_section === weak) s += 40;
    const types = b.student_types_helped ?? [];
    if (student.is_working_professional && types.includes('Working Professionals')) s += 20;
    if (student.is_repeater && types.includes('Repeaters')) s += 20;
    if (student.is_repeater === false && types.includes('Freshers')) s += 10;
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
