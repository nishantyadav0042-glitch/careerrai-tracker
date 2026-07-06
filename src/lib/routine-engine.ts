// Deterministic, rules-based daily routine generator. No LLM call anywhere in
// here on purpose — the free tier stays instant, predictable, and free; the
// paid Buddy is where adaptive human judgment lives. Every rule is plain
// TypeScript so it can be read, argued with, and changed like content, not
// like a black box.

import type { TopicChoice } from './topic-selector';

export type Section = 'VARC' | 'DILR' | 'QA';
export type Phase = 'foundation' | 'intensive' | 'revision';

// Self-reported prep stage — see getPhase() below for how this can advance
// (never regress) the calendar-derived phase. Values match the Study Plan
// Generator onboarding design exactly.
export type Stage = 'not_started' | 'concepts' | 'questions' | 'sectionals' | 'mocks';

export interface RoutineProfile {
  isWorkingProfessional: boolean;
  isRepeater: boolean;
  targetPercentile: number | null;
  weekdayHours: number | null;
  weekendHours: number | null;
  weakestSection: Section | null;
  strongestSection: Section | null;
  // Self-reported toughest topic *within* weakestSection — now just ONE
  // input into the Topic Selector (topic-selector.ts), not an override. See
  // chooseTopicForSection's selfReportedBonus.
  weakTopic: string | null;
  // null = never asked. See getPhase() — this can only push the phase
  // forward relative to the calendar default, never pull it back.
  currentStage: Stage | null;
  coachingEnrolled: boolean | null;
  attemptYear: number | null;
}

export interface RoutineTask {
  id: string;
  section: Section | 'General';
  // Structured topic, not just embedded in the label string — this is what
  // lets future days compute real per-topic revision recency instead of
  // only per-section. null only for phase-closing tasks with no single topic
  // (a full mock, a general revision block).
  topic: string | null;
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

// A student already at sectionals/mocks shouldn't get "concept + practice"
// framing just because their exam is still far off on the calendar — but the
// reverse must never happen: a student who hasn't started 3 weeks out still
// needs the calendar's urgency, not a false "foundation" demotion. So stage
// can only push the phase forward, never pull it back.
const STAGE_MIN_PHASE: Record<Stage, Phase> = {
  not_started: 'foundation',
  concepts: 'foundation',
  questions: 'foundation',
  sectionals: 'intensive',
  mocks: 'intensive',
};
const PHASE_RANK: Record<Phase, number> = { foundation: 0, intensive: 1, revision: 2 };

// Phase is relative to THIS student's own exam date, not a hardcoded calendar
// assumption that every student targets the same November. attemptYear comes
// from profiles.attempt_year; when absent, or when that year's CAT has
// already passed (e.g. a repeater who hasn't updated it post-exam yet), rolls
// forward to the next upcoming CAT automatically rather than mislabeling a
// post-exam student as still in "foundation" for a cycle that's already over.
// A repeater has already been through one full prep cycle by definition — so
// absent an explicit current_stage self-report, defaulting them to the
// calendar's "foundation" would misrepresent someone who has already covered
// the basics once. This only fills the gap when stage is unknown: an
// explicit stage answer (even 'not_started', meaning "haven't restarted THIS
// cycle yet") is more specific real data and always wins over the archetype
// guess, exactly like STAGE_MIN_PHASE always wins over the calendar guess.
const ARCHETYPE_PHASE_FLOOR: Phase = 'intensive';

// The exam date THIS student actually cares about — resolves attempt_year
// with the "roll forward if that year's CAT already passed" rule below, so
// every on-screen countdown (goal editor, tracker header, trajectory wall,
// CAT context card) reads the same date as the phase engine instead of each
// screen hardcoding its own fixed year that drifts once that year's exam
// has passed or a student's attempt_year differs from the calendar default.
export function resolveCatExamDate(now: Date, attemptYear?: number | null): Date {
  let year = attemptYear ?? now.getFullYear();
  if (now > catExamDate(year)) year += 1;
  return catExamDate(year);
}

export function getPhase(now: Date, attemptYear?: number | null, stage?: Stage | null, isRepeater?: boolean): Phase {
  const examDate = resolveCatExamDate(now, attemptYear);
  const year = examDate.getFullYear();

  let calendarPhase: Phase = 'foundation'; // everything else, including multi-year-out early prep
  if (now.getFullYear() === year) {
    const month = now.getMonth(); // 0-indexed
    if (month === 10 && now <= examDate) calendarPhase = 'revision'; // Nov, up to exam day
    else if (month === 8 || month === 9) calendarPhase = 'intensive';         // Sep, Oct
  }

  if (stage) {
    const stageMin = STAGE_MIN_PHASE[stage];
    if (PHASE_RANK[stageMin] > PHASE_RANK[calendarPhase]) return stageMin;
    return calendarPhase;
  }
  if (isRepeater && PHASE_RANK[ARCHETYPE_PHASE_FLOOR] > PHASE_RANK[calendarPhase]) return ARCHETYPE_PHASE_FLOOR;
  return calendarPhase;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

// Archetype planning parameters — ONE engine, coefficients per archetype,
// never a forked codebase per archetype (see docs/product-vision-notes.md).
// Revision cadence is the concrete, real difference: a repeater relearns
// faster (and forgets faster under second-attempt pressure) so their cycle
// tightens; a working professional's daily time is scarcer so a topic isn't
// flagged overdue as quickly. This is read by both the Topic Selector
// (below, via today/route.ts) and the Mission Engine's revision signal.
export function archetypeRevisionMultiplier(profile: { isRepeater: boolean; isWorkingProfessional: boolean }): number {
  if (profile.isRepeater) return 0.7;
  if (profile.isWorkingProfessional) return 1.4;
  return 1.0;
}

// The ONE explicit if-then implementation intention per day — see the
// isImplementationIntention doc comment above for why only the priority task
// gets this treatment. "If you open the app today" is the honest trigger a
// deterministic engine can offer — it doesn't know time-of-day or context, so
// the cue is tied to the one moment it DOES know: this session. The specific
// clause now comes from the Topic Selector's own reasoning (coverage status,
// revision-due, prerequisites) instead of a flat per-section day-count, so
// the cue is topic-specific, not just section-specific.
export function implementationIntention(section: Section, topic: string, topicReasons: string[], phase: Phase): string {
  const target = `${section} — ${topic}`;
  if (topicReasons.length > 0) {
    return `If you study today, start with ${target} — ${topicReasons[0]}`;
  }
  return phase === 'foundation'
    ? `If you study today, start with ${target} — first pass, before anything else`
    : `If you study today, start with ${target} — day one counts`;
}

// Plain, non-conditional reason for the secondary tasks — deliberately NOT
// if-then framed. The evidence supports one vivid, personal trigger, not
// diluting the pattern across a whole checklist.
export function sectionReason(section: Section, topic: string, topicReasons: string[], ordinal: 'second' | 'third'): string {
  const target = `${section} — ${topic}`;
  if (topicReasons.length > 0) return `${target} — ${topicReasons[0]}`;
  return ordinal === 'second' ? `${target} — rounding out today's set` : `${target} — closes today's session`;
}

// The "how did you plan this" answer, made visible instead of implicit. A
// student who tapped a 2-second setup prompt days ago has no reason to
// remember it drove today's list — without this line the same personalized
// output reads as an arbitrary generic template. Takes the ACTUAL chosen
// topic (the Topic Selector's output), which may differ from the raw
// self-report once Coverage Matrix/revision data starts to matter.
export function personalizationSummary(profile: RoutineProfile, isWeekendToday: boolean, hours: number, weakTopicChosen: string | null): string {
  const hoursLabel = `${hours}h ${isWeekendToday ? 'today (weekend)' : 'today'}`;
  const weakLabel = profile.weakestSection
    ? weakTopicChosen
      ? `${profile.weakestSection} (${weakTopicChosen}) is your focus`
      : `${profile.weakestSection} is your focus`
    : 'balanced across sections';
  return `Built from your setup: ${weakLabel} · ${hoursLabel}`;
}

export interface HistoryInput {
  // Days since this section last appeared in a completed task, per section.
  // null = never practiced. Still used by the Mission Engine's per-section
  // signal — a separate, coarser consumer than the Topic Selector below.
  daysSinceLastPracticed: Record<Section, number | null>;
}

export function generateRoutine(
  profile: RoutineProfile,
  now: Date,
  history: HistoryInput,
  // One TopicChoice per section, computed by the caller (today/route.ts)
  // from the Topic Selector — Coverage Matrix + prerequisites + weightage +
  // revision-due + (for the weak section only) the self-report bonus. This
  // is what replaced the old static "same topic for every student" default
  // for the two non-weakest sections.
  topicChoices: Record<Section, TopicChoice>
): GeneratedRoutine {
  const phase = getPhase(now, profile.attemptYear, profile.currentStage, profile.isRepeater);
  const weekend = isWeekend(now);
  // Weekday and weekend fallbacks are now genuinely different per archetype
  // (previously both used the same constant regardless of which day it
  // was) — a working professional's realistic weekend capacity is higher
  // than their weekday capacity, which the old single fallback couldn't
  // express.
  const hours = (weekend ? profile.weekendHours : profile.weekdayHours)
    ?? (weekend
      ? (profile.isWorkingProfessional ? 4 : 3)
      : (profile.isWorkingProfessional ? 1.5 : 2.5));
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

  const weakChoice = topicChoices[weak];
  const priorityLabel = phase === 'foundation'
    ? `${weak} — ${weakChoice.topic}: concept + practice`
    : `${weak} — ${weakChoice.topic}: targeted practice`;

  tasks.push({
    id: `${weak.toLowerCase()}-priority`,
    section: weak,
    topic: weakChoice.topic,
    label: priorityLabel,
    estMinutes: Math.round(totalMinutes * weakShare),
    reason: implementationIntention(weak, weakChoice.topic, weakChoice.reasons, phase),
    isImplementationIntention: true,
  });

  nonWeak.forEach((section, i) => {
    const choice = topicChoices[section];
    tasks.push({
      id: `${section.toLowerCase()}-set`,
      section,
      topic: choice.topic,
      label: `${section} — ${choice.topic}: practice set`,
      estMinutes: Math.round(totalMinutes * otherShare),
      reason: sectionReason(section, choice.topic, choice.reasons, i === 0 ? 'second' : 'third'),
    });
  });

  // Phase-specific closing task, in do-order (last).
  if (phase === 'intensive') {
    // Mock timing genuinely differs by archetype, not just the label on one
    // shared task: a repeater already has mocks on file, so reviewing one is
    // real signal-extraction work regardless of how little time today has —
    // it gets the daily slot every day. A working professional's weekday
    // capacity is too tight for a fresh timed sectional/full mock, so on
    // weekdays they get lighter targeted practice instead and the actual
    // mock waits for the weekend, when hours are realistically available.
    if (profile.isRepeater) {
      tasks.push({
        id: 'mock-or-review',
        section: 'General',
        topic: null,
        label: 'Mock analysis — review your last attempt',
        estMinutes: Math.max(20, Math.round(totalMinutes * 0.15)),
        reason: 'Intensive phase — mocks are the #1 signal now',
      });
    } else if (profile.isWorkingProfessional && !weekend) {
      tasks.push({
        id: 'weekday-sectional',
        section: weak,
        topic: null,
        label: `${weak} — timed sectional practice`,
        estMinutes: Math.max(20, Math.round(totalMinutes * 0.15)),
        reason: 'Weekday capacity is tight — full mocks wait for the weekend',
      });
    } else {
      tasks.push({
        id: 'mock-or-review',
        section: 'General',
        topic: null,
        label: 'Sectional mock',
        estMinutes: Math.max(20, Math.round(totalMinutes * 0.15)),
        reason: 'Intensive phase — mocks are the #1 signal now',
      });
    }
  } else if (phase === 'revision') {
    tasks.push({
      id: 'revision-block',
      section: strong ?? weak,
      topic: null,
      label: `Revise ${strong ?? weak} — keep it sharp, don't drift`,
      estMinutes: Math.max(15, Math.round(totalMinutes * 0.15)),
      reason: 'Revision phase — protect your strengths, don\'t just chase weaknesses',
    });
  } else if (profile.isRepeater) {
    tasks.push({
      id: 'repeater-review',
      section: weak,
      topic: null,
      label: `Review yesterday's ${weak} mistakes`,
      estMinutes: Math.max(15, Math.round(totalMinutes * 0.15)),
      reason: 'Repeaters improve fastest by closing yesterday\'s gaps, not opening new ground',
    });
  }

  const estMinutes = tasks.reduce((s, t) => s + t.estMinutes, 0);
  const whySummary = personalizationSummary(profile, weekend, hours, weakChoice.topic);
  return { phase, tasks, estMinutes, whySummary };
}

// The single highest-priority task — what Emergency Mode collapses to.
export function emergencyTask(routine: GeneratedRoutine): RoutineTask {
  return routine.tasks[0];
}
