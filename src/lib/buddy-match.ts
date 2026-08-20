import { resolveFocusSections } from './focus-sections';
import { type DebriefRow } from './mock-informed-focus';
import { studyDayString } from './study-day';

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
  /**
   * The plan engine's answer to "what is this student struggling with?",
   * resolved by resolveFocusSections -- the SAME authority that decides which
   * section today's plan attacks. Founder ruling (Batch 8): matching must
   * never hold its own opinion about a student's weakness. focus_source says
   * which evidence rung produced it; the hard 'DILR' default at the bottom of
   * the chain arrives as source 'default' and is treated as no evidence.
   *
   * Optional so callers that predate this (cron/buddy-evening) keep their
   * exact old behaviour: absent focus = the legacy baseline-only path.
   */
  focus_weakest?: string | null;
  focus_source?: 'mock' | 'self_report' | 'baseline' | 'coverage' | 'default' | null;
  /** A genuine plateau (see findPlateau) -- never mere repetition. */
  plateau?: { topic: string; section: string } | null;
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

/** Distinct days required before repetition is even a candidate for plateau. */
export const PLATEAU_MIN_DAYS = 3;

/**
 * A genuine plateau, or null.
 *
 * Founder ruling (Batch 8): "Never classify repetition alone as stuckness."
 * A student touching Arithmetic three days running might be drilling it by
 * choice. So this requires BOTH:
 *
 *   1. the same topic completed on >= PLATEAU_MIN_DAYS distinct days, AND
 *   2. the student's own MOST RECENT confidence mark on it is a struggle
 *      signal ('red' or 'yellow') -- their tap, not our inference. This is the
 *      same evidence daily-insight's recovery rule reads from the other side,
 *      and it is corroborated by the coverage ladder by construction: only
 *      green/blue advance a topic, so a latest-red topic is also one whose
 *      repeated work is not converting into rung movement.
 *
 * Repetition with green marks falls through -- that is practice, not a wall.
 * If several topics qualify, the most-repeated wins; ties break to the topic
 * with the most recent struggle mark, so the answer is deterministic.
 */
export function findPlateau(
  completions: { topic: string; section: string; date: string; confidence: string | null }[],
): { topic: string; section: string } | null {
  const byTopic = new Map<string, { section: string; dates: Set<string>; marks: { date: string; confidence: string | null }[] }>();
  for (const c of completions) {
    if (!byTopic.has(c.topic)) byTopic.set(c.topic, { section: c.section, dates: new Set(), marks: [] });
    const t = byTopic.get(c.topic)!;
    t.dates.add(c.date);
    t.marks.push({ date: c.date, confidence: c.confidence });
  }
  const candidates: { topic: string; section: string; days: number; lastStruggle: string }[] = [];
  for (const [topic, t] of byTopic) {
    if (t.dates.size < PLATEAU_MIN_DAYS) continue;
    const latest = [...t.marks].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest.confidence !== 'red' && latest.confidence !== 'yellow') continue;
    candidates.push({ topic, section: t.section, days: t.dates.size, lastStruggle: latest.date });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.days - a.days || b.lastStruggle.localeCompare(a.lastStruggle) || a.topic.localeCompare(b.topic));
  return { topic: candidates[0].topic, section: candidates[0].section };
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
  // Evidence ladder, most specific first (founder ruling, Batch 8). Every line
  // is traceable to a stored or derived signal, and the SOURCE decides the
  // wording -- a mock finding, a plateau the student marked themselves, a
  // self-report and a coverage-grid reading are four different claims and must
  // not share one sentence. The 'default' source produces NO reason: the
  // bottom of the focus chain is a hard 'DILR' fallback, and a default is not
  // a fact about the student.
  if (student.plateau && buddy.strongest_section === student.plateau.section) {
    return `Strong in ${student.plateau.section} — best fit for breaking your repeated ${student.plateau.topic} plateau`;
  }
  const focusWeak = student.focus_source && student.focus_source !== 'default' ? student.focus_weakest : null;
  if (focusWeak && buddy.strongest_section === focusWeak) {
    switch (student.focus_source) {
      case 'mock':
        return `Strong in ${focusWeak} — the section your last mock exposed`;
      case 'self_report':
        return `Strong in ${focusWeak} — the section you said you struggle with`;
      case 'baseline':
        return `Strong in ${focusWeak} — your weakest section`;
      case 'coverage':
        return `Strong in ${focusWeak} — where your syllabus map is thinnest`;
    }
  }
  // Legacy path for callers that don't resolve focus (cron/buddy-evening):
  // baseline-only, exactly as before.
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
  // Describes what the MENTOR has done, not a category the student is filed
  // under. Every other rung on this ladder does that -- "Strong in DILR, your
  // weakest section", "Improved 91->98%ile, been where you are" -- and this one
  // used to break the pattern by telling a student they were a "working
  // professional" on a product whose audience is students, some of whom happen
  // to also have a job. The trigger is unchanged and the signal behind it was
  // audited: is_working_professional is an explicit, mandatory signup answer,
  // and all 53 students carrying it completed onboarding.
  if (student.is_working_professional && types.includes('Working Professionals')) {
    return 'Has mentored students balancing work and CAT prep';
  }
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
  // Weights follow the evidence ladder: measured beats marked-by-student beats
  // typed-at-signup beats grid-derived, and profile completeness is only ever
  // a tie-break (its terms sum to 25, below every evidence weight). The
  // 'default' focus source scores nothing -- see matchReason.
  const focusWeak = student.focus_source && student.focus_source !== 'default' ? student.focus_weakest : null;
  const FOCUS_WEIGHT: Record<string, number> = { mock: 60, self_report: 40, baseline: 35, coverage: 30 };
  const weak = weakestSection(student);
  const score = (b: MatchBuddy): number => {
    let s = 0;
    if (student.plateau && b.strongest_section === student.plateau.section) s += 50;
    if (focusWeak && b.strongest_section === focusWeak) s += FOCUS_WEIGHT[student.focus_source as string] ?? 0;
    else if (!focusWeak && weak && b.strongest_section === weak) s += 40;
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
// (real, setup-complete, non-demo) and returns the ranked top 5 with match
// reasons.
//
// FIVE, not four, and not one (founder, 19 Aug): CareerRai still does the
// matching and still names a recommendation, but the student gets the final
// choice. Picking a person to talk to about being stuck is not a thing to be
// assigned. Four alternatives is enough to feel like a choice and few enough
// that it does not become a mentor marketplace to shop in -- which is exactly
// the category the founder does not want to be in. Shared by every screen that shows the buddy showcase to a free
// student — profile page, and the paywall screens (buddy tab, chat tab).
/** The raw rows one student's focus resolution needs. Shape-identical whether
 *  they arrived from a single-student fetch or a bulk one. */
export interface FocusInputs {
  profile: Record<string, unknown>;
  coverage: { section: string; status: string }[];
  debriefs: DebriefRow[];
  routines: { tasks: unknown }[];
  completions: { routine_date: string; task_id: string; confidence: string | null }[];
}

/**
 * THE single place a student becomes a MatchStudent.
 *
 * P1, 20 Aug: the page resolved focus through resolveFocusSections while
 * cron/buddy-evening called rankBuddies directly with only the baseline
 * columns -- populated for 1 of 553 students -- so the cron ranked on profile
 * completeness alone. Proven consequence: the push named Soumitra while the
 * page it opened recommended Spandana, for 80 of 123 push-eligible students.
 *
 * The bug was not the cron's query list. It was that TWO code paths could each
 * decide what a student's problem is. This function is the fix: it is pure, it
 * takes rows, and every surface must go through it. Fetching differs (one
 * student or many); deciding cannot.
 */
export function buildMatchStudent(inputs: FocusInputs, todayIso: string): MatchStudent {
  const focus = resolveFocusSections(inputs.profile, inputs.coverage, inputs.debriefs, todayIso);

  // Plateau evidence: topic/section come from the routine's own task list, the
  // confidence marks are the student's own taps.
  const taskMeta = new Map<string, { topic: string; section: string }>();
  for (const r of inputs.routines) {
    for (const t of (Array.isArray(r.tasks) ? r.tasks : []) as { id?: string; topic?: string; section?: string }[]) {
      if (t.id && t.topic && t.section) taskMeta.set(String(t.id), { topic: t.topic, section: t.section });
    }
  }
  const plateau = findPlateau(
    inputs.completions.flatMap((c) => {
      const meta = taskMeta.get(String(c.task_id));
      return meta ? [{ topic: meta.topic, section: meta.section, date: c.routine_date, confidence: c.confidence }] : [];
    }),
  );

  return {
    ...(inputs.profile as unknown as MatchStudent),
    focus_weakest: focus.weakest,
    focus_source: focus.weakestSource,
    plateau,
  };
}

/** Columns every focus resolution needs from the student's profile row. */
export const FOCUS_PROFILE_COLUMNS =
  'id, baseline_varc, baseline_dilr, baseline_qa, is_working_professional, is_repeater, self_reported_weakest_section, self_reported_strongest_section';

/** Showcase-eligible mentors. One definition, used by page and cron alike. */
export const MATCH_BUDDY_COLUMNS =
  'id, full_name, avatar_url, cat_percentile, first_attempt_percentile, cat_year, iim_converted, current_company, strongest_section, student_types_helped, how_i_work, linkedin_url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchEligibleBuddies(admin: any): Promise<MatchBuddy[]> {
  const { data } = await admin.from('profiles').select(MATCH_BUDDY_COLUMNS)
    .eq('role', 'buddy').eq('buddy_onboarding_completed', true)
    .not('cat_percentile', 'is', null)
    .not('is_test_account', 'is', true); // never recommend test/demo buddies
  return (data ?? []) as MatchBuddy[];
}

/**
 * Focus inputs for MANY students, in a bounded number of queries.
 *
 * Four queries per CHUNK, not per student. The cron previously did zero of
 * these; doing them per-student would have been 6 x N, which the audit costed
 * at ~60k queries per run at 10k students and called unacceptable at 100k.
 * Chunking keeps both the query count and each result set bounded, so the run
 * grows linearly in chunks rather than quadratically in round-trips.
 */
export const FOCUS_BULK_CHUNK = 250;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchFocusInputsBulk(admin: any, studentIds: string[]): Promise<Map<string, FocusInputs>> {
  const out = new Map<string, FocusInputs>();
  const fourteenAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split('T')[0];

  for (let i = 0; i < studentIds.length; i += FOCUS_BULK_CHUNK) {
    const ids = studentIds.slice(i, i + FOCUS_BULK_CHUNK);
    const [{ data: profiles }, { data: coverage }, { data: debriefs }, { data: routines }, { data: completions }] =
      await Promise.all([
        admin.from('profiles').select(FOCUS_PROFILE_COLUMNS).in('id', ids),
        admin.from('topic_coverage').select('student_id, section, status').in('student_id', ids),
        admin.from('mock_debriefs').select('student_id, taken_on, varc, dilr, qa').in('student_id', ids),
        admin.from('daily_routines').select('student_id, tasks').in('student_id', ids).gte('routine_date', fourteenAgo),
        admin.from('routine_task_completions').select('student_id, routine_date, task_id, confidence')
          .in('student_id', ids).gte('routine_date', fourteenAgo),
      ]);

    const group = <T extends { student_id: string }>(rows: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const r of rows ?? []) {
        if (!m.has(r.student_id)) m.set(r.student_id, []);
        m.get(r.student_id)!.push(r);
      }
      return m;
    };
    const cov = group(coverage), deb = group(debriefs), rou = group(routines), com = group(completions);

    for (const p of (profiles ?? []) as { id: string }[]) {
      out.set(p.id, {
        profile: p as Record<string, unknown>,
        coverage: (cov.get(p.id) ?? []) as unknown as { section: string; status: string }[],
        debriefs: (deb.get(p.id) ?? []) as unknown as DebriefRow[],
        routines: (rou.get(p.id) ?? []) as unknown as { tasks: unknown }[],
        completions: (com.get(p.id) ?? []) as unknown as { routine_date: string; task_id: string; confidence: string | null }[],
      });
    }
  }
  return out;
}

/**
 * The recommendation, for one student. Page-side entry point.
 *
 * Fetches this student's inputs and hands them to buildMatchStudent -- the same
 * function the cron uses -- so the two cannot disagree about who is
 * recommended or why.
 */
export async function getRecommendedBuddiesForStudent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  studentId: string
): Promise<RecommendedBuddyResult[]> {
  const [inputsById, buddies] = await Promise.all([
    fetchFocusInputsBulk(admin, [studentId]),
    fetchEligibleBuddies(admin),
  ]);
  const inputs = inputsById.get(studentId);
  if (!inputs || !buddies.length) return [];
  return recommendFor(inputs, buddies);
}

/**
 * Ranking + reasons from already-fetched inputs. The ONLY producer of a Buddy
 * recommendation. Page and cron both end here, which is what makes the push
 * and the page it opens structurally incapable of naming different mentors.
 */
export function recommendFor(inputs: FocusInputs, buddies: MatchBuddy[], todayIso = studyDayString()): RecommendedBuddyResult[] {
  const matchStudent = buildMatchStudent(inputs, todayIso);
  return rankBuddies(matchStudent, buddies)
    .slice(0, 5)
    .map((b) => ({ ...b, reason: matchReason(matchStudent, b) }));
}
