// Deterministic, rules-based daily routine generator. No LLM call anywhere in
// here on purpose — the free tier stays instant, predictable, and free; the
// paid Buddy is where adaptive human judgment lives. Every rule is plain
// TypeScript so it can be read, argued with, and changed like content, not
// like a black box.

export type Section = 'VARC' | 'DILR' | 'QA';
export type Phase = 'foundation' | 'intensive' | 'revision';

export interface RoutineProfile {
  isWorkingProfessional: boolean;
  isRepeater: boolean;
  targetPercentile: number | null;
  weekdayHours: number | null;
  weekendHours: number | null;
  weakestSection: Section | null;
  strongestSection: Section | null;
  coachingEnrolled: boolean | null;
  attemptYear: number | null;
}

export interface RoutineTask {
  id: string;
  section: Section | 'General';
  label: string;
  estMinutes: number;
  reason: string | null;
}

export interface GeneratedRoutine {
  phase: Phase;
  tasks: RoutineTask[];
  estMinutes: number;
}

// CAT is always the last Sunday of November of a given year. Reuses the same
// convention already live on the Home tab (student/tracker/page.tsx
// CAT_EXAM_DATE) so phase boundaries and the countdown never disagree.
export function catExamDate(year: number): Date {
  const nov30 = new Date(year, 10, 30);
  const lastSunday = new Date(nov30);
  lastSunday.setDate(30 - nov30.getDay());
  return lastSunday;
}

// Phase is relative to THIS student's own exam date, not a hardcoded calendar
// assumption that every student targets the same November. attemptYear comes
// from profiles.attempt_year; when absent, or when that year's CAT has
// already passed (e.g. a repeater who hasn't updated it post-exam yet), rolls
// forward to the next upcoming CAT automatically rather than mislabeling a
// post-exam student as still in "foundation" for a cycle that's already over.
export function getPhase(now: Date, attemptYear?: number | null): Phase {
  let year = attemptYear ?? now.getFullYear();
  if (now > catExamDate(year)) year += 1;

  if (now.getFullYear() === year) {
    const month = now.getMonth(); // 0-indexed
    if (month === 10 && now <= catExamDate(year)) return 'revision'; // Nov, up to exam day
    if (month === 8 || month === 9) return 'intensive';               // Sep, Oct
  }
  return 'foundation'; // everything else, including multi-year-out early prep
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

// Reason line: pure date-math on the student's OWN history, never an LLM call.
// Falls back to a phase-appropriate line when there's no history yet (day 1).
export function priorityReason(
  section: Section,
  lastPracticedDaysAgo: number | null,
  phase: Phase
): string {
  if (lastPracticedDaysAgo == null) {
    return phase === 'foundation'
      ? `Building your ${section} foundation — first pass`
      : `${section} — start here today`;
  }
  if (lastPracticedDaysAgo === 0) return `${section} — keep today's momentum going`;
  if (lastPracticedDaysAgo === 1) return `${section} — last done yesterday`;
  return `${section} — last done ${lastPracticedDaysAgo} days ago`;
}

export interface HistoryInput {
  // Days since this section last appeared in a completed task, per section.
  // null = never practiced.
  daysSinceLastPracticed: Record<Section, number | null>;
}

export function generateRoutine(profile: RoutineProfile, now: Date, history: HistoryInput): GeneratedRoutine {
  const phase = getPhase(now, profile.attemptYear);
  const weekend = isWeekend(now);
  const hours = (weekend ? profile.weekendHours : profile.weekdayHours) ?? (profile.isWorkingProfessional ? 1.5 : 2.5);
  const totalMinutes = Math.max(30, Math.round(hours * 60));

  const weak = profile.weakestSection ?? 'DILR';
  const strong = profile.strongestSection;
  const allSections: Section[] = ['VARC', 'DILR', 'QA'];
  const nonWeak = allSections.filter((s) => s !== weak);

  const tasks: RoutineTask[] = [];

  // Daily floor, in do-order: weakest section leads (biased ~15% more time),
  // then the other two, then a mock/revision task depending on phase.
  const weakShare = 0.40;
  const otherShare = (1 - weakShare) / nonWeak.length;

  tasks.push({
    id: `${weak.toLowerCase()}-priority`,
    section: weak,
    label: phase === 'foundation' ? `${weak} — concept + practice set` : `${weak} — targeted practice set`,
    estMinutes: Math.round(totalMinutes * weakShare),
    reason: priorityReason(weak, history.daysSinceLastPracticed[weak], phase),
  });

  for (const section of nonWeak) {
    tasks.push({
      id: `${section.toLowerCase()}-set`,
      section,
      label: `${section} — practice set`,
      estMinutes: Math.round(totalMinutes * otherShare),
      reason: priorityReason(section, history.daysSinceLastPracticed[section], phase),
    });
  }

  // Phase-specific closing task, in do-order (last).
  if (phase === 'intensive') {
    tasks.push({
      id: 'mock-or-review',
      section: 'General',
      label: profile.isRepeater ? 'Mock analysis — review your last attempt' : 'Sectional mock',
      estMinutes: Math.max(20, Math.round(totalMinutes * 0.15)),
      reason: 'Intensive phase — mocks are the #1 signal now',
    });
  } else if (phase === 'revision') {
    tasks.push({
      id: 'revision-block',
      section: strong ?? weak,
      label: `Revise ${strong ?? weak} — keep it sharp, don't drift`,
      estMinutes: Math.max(15, Math.round(totalMinutes * 0.15)),
      reason: 'Revision phase — protect your strengths, don\'t just chase weaknesses',
    });
  } else if (profile.isRepeater) {
    tasks.push({
      id: 'repeater-review',
      section: weak,
      label: `Review yesterday's ${weak} mistakes`,
      estMinutes: Math.max(15, Math.round(totalMinutes * 0.15)),
      reason: 'Repeaters improve fastest by closing yesterday\'s gaps, not opening new ground',
    });
  }

  const estMinutes = tasks.reduce((s, t) => s + t.estMinutes, 0);
  return { phase, tasks, estMinutes };
}

// The single highest-priority task — what Emergency Mode collapses to.
export function emergencyTask(routine: GeneratedRoutine): RoutineTask {
  return routine.tasks[0];
}
