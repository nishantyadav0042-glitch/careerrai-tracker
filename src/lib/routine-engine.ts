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
  // True only for the single priority task. Backed by a real meta-analysis
  // (Wang, Wang & Gai 2021, Frontiers in Psychology, N=15,907): explicit
  // if-then implementation intentions have a real, domain-general effect on
  // goal attainment (g=0.336), academic goals included. The same analysis
  // found interactive/personalized delivery beats static delivery (g=0.465
  // vs 0.277) — a deterministic engine can't be "interactive," so this is
  // applied to exactly ONE vivid, personal trigger rather than diluted
  // across every task, which is the closest a static list gets to that gap.
  isImplementationIntention?: boolean;
}

export interface GeneratedRoutine {
  phase: Phase;
  tasks: RoutineTask[];
  estMinutes: number;
  whySummary: string;
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

// The ONE explicit if-then implementation intention per day — see the
// isImplementationIntention doc comment above for why only the priority task
// gets this treatment. Pure date-math on the student's OWN history, never an
// LLM call. "If you open the app today" is the honest trigger a deterministic
// engine can offer — it doesn't know time-of-day or context, so the cue is
// tied to the one moment it DOES know: this session.
export function implementationIntention(
  section: Section,
  lastPracticedDaysAgo: number | null,
  phase: Phase
): string {
  if (lastPracticedDaysAgo == null) {
    return phase === 'foundation'
      ? `If you study today, start with ${section} — first pass, before anything else`
      : `If you study today, start with ${section} — day one counts`;
  }
  if (lastPracticedDaysAgo === 0) return `If you study today, keep ${section} going — that's the momentum`;
  if (lastPracticedDaysAgo === 1) return `If you study today, start with ${section} — you did it yesterday too`;
  return `If you study today, start with ${section} — it's been ${lastPracticedDaysAgo} days`;
}

// Plain, non-conditional reason for the secondary tasks — deliberately NOT
// if-then framed. The evidence supports one vivid, personal trigger, not
// diluting the pattern across a whole checklist. Varied by position so two
// "first pass" days in a row don't read as copy-pasted next to each other.
export function sectionReason(section: Section, lastPracticedDaysAgo: number | null, ordinal: 'second' | 'third'): string {
  if (lastPracticedDaysAgo == null) {
    return ordinal === 'second' ? `${section} — rounding out today's set` : `${section} — closes today's session`;
  }
  if (lastPracticedDaysAgo === 0) return `${section} — done earlier today too`;
  if (lastPracticedDaysAgo === 1) return `${section} — last done yesterday`;
  return `${section} — last done ${lastPracticedDaysAgo} days ago`;
}

// The "how did you plan this" answer, made visible instead of implicit. A
// student who tapped a 2-second setup prompt days ago has no reason to
// remember it drove today's list — without this line the same personalized
// output reads as an arbitrary generic template.
export function personalizationSummary(profile: RoutineProfile, isWeekendToday: boolean, hours: number): string {
  const hoursLabel = `${hours}h ${isWeekendToday ? 'today (weekend)' : 'today'}`;
  const weakLabel = profile.weakestSection ? `${profile.weakestSection} is your focus` : 'balanced across sections';
  return `Built from your setup: ${weakLabel} · ${hoursLabel}`;
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
    reason: implementationIntention(weak, history.daysSinceLastPracticed[weak], phase),
    isImplementationIntention: true,
  });

  nonWeak.forEach((section, i) => {
    tasks.push({
      id: `${section.toLowerCase()}-set`,
      section,
      label: `${section} — practice set`,
      estMinutes: Math.round(totalMinutes * otherShare),
      reason: sectionReason(section, history.daysSinceLastPracticed[section], i === 0 ? 'second' : 'third'),
    });
  });

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
  const whySummary = personalizationSummary(profile, weekend, hours);
  return { phase, tasks, estMinutes, whySummary };
}

// The single highest-priority task — what Emergency Mode collapses to.
export function emergencyTask(routine: GeneratedRoutine): RoutineTask {
  return routine.tasks[0];
}
