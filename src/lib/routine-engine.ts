// Deterministic, rules-based daily routine generator. No LLM call anywhere in
// here on purpose — the free tier stays instant, predictable, and free; the
// paid Buddy is where adaptive human judgment lives. Every rule is plain
// TypeScript so it can be read, argued with, and changed like content, not
// like a black box.

import type { TopicChoice } from './topic-selector';

// One Section union for the whole app — prep-model owns it.
import type { Section } from '@/lib/prep-model';
import type { CoverageStatus } from '@/lib/topic-selector';
import { catExamDate, calendarClaim, MOCK_SIT_HOURS, MOCK_ANALYSIS_HOURS } from './exam-calendar';
export type { Section };
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
  // The executable target — "Solve 15 questions", "Log 3 mistakes" — never
  // just "study X". A goal the student can finish and tick, not a subject
  // to stare at. Derived from the time budget (~3 min/question), stated as
  // an instruction, never as a claim about anything.
  target: string | null;
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

// CAT's date lives in lib/exam-calendar with the rest of the exam calendar;
// re-exported here because every phase consumer historically imports it from
// this module, and the convention must stay ONE implementation.
export { catExamDate };

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

/**
 * No single topic block runs longer than this. Four and a half hours on
 * Percentages is not a study plan, it is a way to lose a day (Abhishek, 11 Aug).
 */
export const MAX_TOPIC_MINUTES = 120;
/** Even an all-day session gets a sane number of topics per section. */
export const MAX_TOPIC_BLOCKS_PER_SECTION = 3;

// The ONE explicit if-then implementation intention per day — see the
// isImplementationIntention doc comment above for why only the priority task
// gets this treatment. "If you open the app today" is the honest trigger a
// deterministic engine can offer — it doesn't know time-of-day or context, so
// the cue is tied to the one moment it DOES know: this session. The specific
// clause now comes from the Topic Selector's own reasoning (coverage status,
// revision-due, prerequisites) instead of a flat per-section day-count, so
// the cue is topic-specific, not just section-specific.
export function implementationIntention(section: Section, topic: string, topicReasons: string[], phase: Phase): string {
  // Keywords only — the "Start Here" chip carries the priority framing.
  if (topicReasons.length > 0) return topicReasons[0];
  return phase === 'foundation' ? 'First pass' : 'Highest-leverage today';
}

// Plain, non-conditional reason for the secondary tasks — deliberately NOT
// if-then framed. The evidence supports one vivid, personal trigger, not
// diluting the pattern across a whole checklist.
export function sectionReason(section: Section, topic: string, topicReasons: string[], ordinal: 'second' | 'third'): string {
  if (topicReasons.length > 0) return topicReasons[0];
  return ordinal === 'second' ? 'Daily balance' : 'Closes the day';
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

// ── Learning Engine (LIS Layer 4): pace × phase × unit ───────────────────────
// Volume is NOT a flat 3 min/question. The old rule was a SOLVING speed applied
// to LEARNING — which is how a foundation-phase student got "72 questions."
// Learning is slow (concept → attempt → solution → retry); practice is faster;
// revision is retrieval. And CAT topics live in different UNITS — QA in
// questions, DILR in sets, RC in passages — so we prescribe the natural unit,
// capped so a day is always completable (motivation > math). Priors:
// docs/research/LEARNING-CAPACITY-ENGINE.md §2b.
type StudyUnit = 'question' | 'set' | 'passage';

function unitFor(section: Section, topic: string): StudyUnit {
  if (section === 'DILR') return 'set';
  if (section === 'VARC' && /reading comprehension/i.test(topic)) return 'passage';
  return 'question';
}

// Minutes per unit, by phase (foundation=learning, intensive=practice, revision).
function minutesPerUnit(unit: StudyUnit, section: Section, phase: Phase): number {
  if (unit === 'set' || unit === 'passage') return phase === 'foundation' ? 30 : phase === 'revision' ? 10 : 15;
  const verbal = section === 'VARC';
  if (phase === 'foundation') return verbal ? 6 : 10; // learning
  if (phase === 'revision') return verbal ? 1.5 : 2;  // retrieval
  return verbal ? 3.5 : 4;                            // practice (intensive)
}

// Motivation cap — a single task is never crushing, however many hours the day
// holds. Completing 12 achievable questions beats abandoning 72.
function unitCap(unit: StudyUnit, phase: Phase): number {
  if (unit === 'set' || unit === 'passage') return phase === 'foundation' ? 3 : phase === 'revision' ? 6 : 5;
  if (phase === 'foundation') return 12;
  if (phase === 'revision') return 30;
  return 22;
}

// Volume is a pure function of the minutes in the slot and the topic's own
// pricing. It used to take a `volumeFactor` from the Adaptation Engine that
// scaled this by ±30% based on recent behaviour — so two students with the same
// hours got different amounts of work, and the SAME student got different
// amounts on different days without asking for it. Founder, 6 Aug: "remove
// volumeFactor... they should be on fixed hours throughout the preparation."
// The same hours now always price the same day.
function taskVolume(section: Section, topic: string, minutes: number, phase: Phase): { count: number; unit: StudyUnit } {
  const unit = unitFor(section, topic);
  // Foundation reserves a third of the slot for the concept before practice.
  const practiceMin = phase === 'foundation' ? Math.round(minutes * 0.67) : minutes;
  const raw = Math.round(practiceMin / minutesPerUnit(unit, section, phase));
  const floor = unit === 'question' ? 3 : 1;
  return { count: Math.max(floor, Math.min(unitCap(unit, phase), raw)), unit };
}

/**
 * The phase for ONE topic, from that topic's own coverage status.
 *
 * getPhase() above answers "where is this student in the CAT calendar" — a
 * single value for the whole day. That is the right input for how much volume
 * to price, but the WRONG input for the verb on a specific task: in August the
 * calendar says 'foundation', so every task was labelled "Learn X" even for
 * topics the student had already marked practising. A real student caught it
 * (5 Aug): "jo already completed hai wahi aa rha phir se krne ko kyu?" — and
 * the card contradicted itself, printing "Learn Editorial Reading" directly
 * above the reason "Finish what you started."
 *
 * A topic's own status is specific evidence and beats the calendar guess —
 * the same evidence-over-aspiration rule the replan engine follows. The
 * calendar phase remains the fallback when a topic has no coverage row.
 */
export function phaseForTopic(status: CoverageStatus | null | undefined, calendarPhase: Phase): Phase {
  switch (status) {
    case 'not_started':
    case 'learning':    return 'foundation'; // genuinely new — "Learn X" is right
    case 'practicing':  return 'intensive';  // past learning — practise, don't re-teach
    case 'revising':
    case 'exam_ready':  return 'revision';   // retrieval, not first contact
    default:            return calendarPhase;
  }
}

// The instruction, in the topic's natural unit and the phase's verb.
// EXPORTED as the one task-instruction builder: swap-topic and the tracker
// card used to hand-roll a flat minutes/3 "questions" formula here, telling
// students to "Solve 15 Reading Comprehension questions" where this engine
// says "3 RC passages, timed".
export function targetPhrase(section: Section, topic: string, minutes: number, phase: Phase): string {
  const { count: n, unit } = taskVolume(section, topic, minutes, phase);
  const s = n === 1 ? '' : 's';
  if (unit === 'passage') return phase === 'foundation' ? `Read + solve ${n} RC passage${s}` : `${n} RC passage${s}, timed`;
  if (unit === 'set') return phase === 'foundation' ? `Learn ${topic}, then ${n} set${s}` : `Solve ${n} ${topic} set${s}`;
  return phase === 'foundation' ? `Learn ${topic}, solve ${n} questions` : `Solve ${n} ${topic} questions`;
}

export interface HistoryInput {
  // Days since this section last appeared in a completed task, per section.
  // null = never practiced. Still used by the Mission Engine's per-section
  // signal — a separate, coarser consumer than the Topic Selector below.
  daysSinceLastPracticed: Record<Section, number | null>;
}

// ── The day's SHAPE — one authority, used by today and by the whole plan ────
//
// Founder, 11 Aug: "There is exactly one planning authority in CareerRai. Home,
// today's API, and Whole Plan are different views/materializations of that
// authority — not different planners."
//
// Topic CHOICE was unified first (topic-selector.chooseSectionDay). This is the
// other half: how a day's hours become sections and blocks. It used to live
// inline in generateRoutine for Home, and separately in plan-mix's weights for
// the whole plan — so on 11 Aug the same Tuesday rendered as three tasks on
// Home (Editorial Reading 264m · Arrangements 198m · Percentages 198m) and five
// on Whole Plan (RC 4h · Percentages 1h · Inequalities 2.5h · Arrangements 2h ·
// Caselets 1.5h). Two shapes, one day, both labelled "your plan".
//
// Extracted verbatim from generateRoutine — same arithmetic, one caller more.
export interface DayShapeInput {
  /** The day's study hours, as the student gave them. */
  hours: number;
  weakestSection: Section | null;
  isWorkingProfessional: boolean;
  isRepeater: boolean;
  weekend: boolean;
  phase: Phase;
  /**
   * Days since epoch, used ONLY to alternate which section takes the single
   * non-weak slot on a lean weekday. Deterministic (same date = same shape),
   * so the plan never changes under a student mid-day.
   */
  dayIndex?: number;
}

export interface DayShapeSection {
  section: Section;
  minutes: number;
  /** Distinct topics this slice holds — never more than MAX_TOPIC_BLOCKS_PER_SECTION. */
  blocks: number;
  /** True for the weakest section, which leads the day and absorbs rounding. */
  isPriority: boolean;
}

/**
 * Above this many hours a day, the syllabus is a PROMISE, not a preference.
 *
 * Founder, 14 Aug, choosing option (a): "those students who have more than six
 * hours should complete all the topics — otherwise topics as per weightage and
 * coverage matrix." Below the line we prioritise honestly; at or above it every
 * one of the 46 topics has to be delivered before the student's finish date,
 * and no archetype rule may quietly opt them out of that.
 */
export const FULL_SYLLABUS_MIN_HOURS = 6;

export interface DayShape {
  totalMinutes: number;
  /** Minutes reserved for the phase-closing task. Already out of the budget. */
  closerMinutes: number;
  hasCloser: boolean;
  smallDay: boolean;
  /** Weakest section first, then the others, in do-order. */
  sections: DayShapeSection[];
}

/**
 * A section's slice is divided into blocks of at most MAX_TOPIC_MINUTES, and
 * the selector returns that many DISTINCT topics for it.
 *
 * Abhishek studies eleven hours a day and was handed three topics — 264
 * minutes, four and a half hours, on Percentages alone. Nobody solves one
 * chapter for four hours; and at three topics a day, 46 topics cannot be
 * covered before his date however well the ranking works.
 */
export function blocksForMinutes(minutes: number): number {
  // CEIL, not round. Round re-broke the very rule this function exists to
  // enforce: a 144-minute slice is round(1.2) = ONE block, i.e. 144 minutes
  // on a single chapter — over the 120 cap, the Abhishek failure in
  // miniature. Audit 13 Aug measured it across the budget matrix: every
  // student at 4h+ was getting single blocks of 122–168 minutes. Ceil makes
  // the slice/blocks split honour the cap by construction.
  //
  // The section cap still binds above 3 × MAX_TOPIC_MINUTES (a >6-hour slice
  // in ONE section). That is deliberate — three distinct topics a day in one
  // section is already the most a student can hold — so the invariant is
  // "at most MAX_TOPIC_MINUTES unless the block cap binds", and
  // routine-hours.guard.test.ts asserts exactly that.
  return Math.max(1, Math.min(MAX_TOPIC_BLOCKS_PER_SECTION, Math.ceil(minutes / MAX_TOPIC_MINUTES)));
}

export function dayShape(input: DayShapeInput): DayShape {
  const totalMinutes = Math.max(30, Math.round(input.hours * 60));
  const weak = input.weakestSection ?? 'DILR';
  const allSections: Section[] = ['VARC', 'DILR', 'QA'];
  const nonWeak = allSections.filter((s) => s !== weak);

  // Small days get few tasks (Stage A). Three tasks in 30 minutes is three
  // ways to feel behind; one finishable task is a won day. ≤45 min = the
  // weak-section task alone; ≤75 min = weak + one other; above that, the
  // full day. Closing tasks (mock/review) only exist on full days.
  const smallDay = totalMinutes <= 75;
  const maxOthers = totalMinutes <= 45 ? 0 : smallDay ? 1 : 2;

  // Identity fork (LIS L1→Planning): a working professional's weekday time is
  // scarce, so we don't spread it thin across all three sections — the plan
  // focuses on the weak area + ONE other, and the weekend gets the full spread
  // + a real mock. This is what makes the persona *feel* like a different
  // coach, not a coefficient.
  //
  // BUT IT MAY NOT COST THEM THE SYLLABUS (founder, 14 Aug, option (a)). This
  // fork assumed "working professional" implies scarce time. It does not: a
  // WP who declares eight hours has the same time as anyone else, and the
  // reachability gate caught what the assumption did to them — with DILR
  // weakest, nonWeak is ['VARC','QA'] and the slice always took VARC, so QA
  // ran on WEEKENDS ONLY. Twenty-four QA blocks in fifty-five days instead of
  // ninety-two, and nine QA topics never opened at all. Silent, and invisible
  // to every row-level check because each individual day looked reasonable.
  //
  // So the lean fork now applies only BELOW the full-syllabus line. At or
  // above it, all three sections run every day, for every archetype.
  const leanWeekday = input.isWorkingProfessional
    && !input.weekend
    && input.phase !== 'revision'
    && input.hours < FULL_SYLLABUS_MIN_HOURS;

  // And when it does apply, the slot ALTERNATES. A fixed slice starves one
  // section permanently, which is the same failure in a smaller budget — the
  // student simply never sees it rather than never finishing it.
  const rotated = leanWeekday && (input.dayIndex ?? 0) % 2 === 1
    ? [...nonWeak].reverse()
    : nonWeak;
  const activeNonWeak = rotated.slice(0, Math.min(leanWeekday ? 1 : 2, maxOthers));

  // Will a phase-closing task be added at the end? Decide NOW, because its
  // minutes come OUT of the day's budget, not on top of it. Until 8 Aug the
  // closer was appended after the topic tasks had already consumed 100% —
  // every repeater and every intensive-phase student got 15% more than the
  // hours they chose, daily (audit finding A-5).
  const hasCloser = !smallDay
    && (input.phase === 'intensive' || input.phase === 'revision'
      || (input.phase === 'foundation' && input.isRepeater));
  const closerMinutes = hasCloser
    ? Math.max(input.phase === 'revision' ? 15 : 20, Math.round(totalMinutes * 0.15))
    : 0;
  const topicBudget = totalMinutes - closerMinutes;

  // Weakest section leads (bigger share when the day is lean), then the
  // other(s). Others are rounded; the priority task absorbs the rounding so
  // the day's total is EXACTLY the budget — planned always equals committed.
  const weakShare = activeNonWeak.length === 0 ? 1 : leanWeekday || smallDay ? 0.55 : 0.40;
  const otherMinutes = activeNonWeak.map(() =>
    Math.round((topicBudget * (1 - weakShare)) / Math.max(1, activeNonWeak.length)));
  const priorityMinutes = topicBudget - otherMinutes.reduce((s, m) => s + m, 0);

  const sections: DayShapeSection[] = [
    { section: weak, minutes: priorityMinutes, blocks: blocksForMinutes(priorityMinutes), isPriority: true },
    ...activeNonWeak.map((section, i) => ({
      section,
      minutes: otherMinutes[i],
      blocks: blocksForMinutes(otherMinutes[i]),
      isPriority: false,
    })),
  ];

  return { totalMinutes, closerMinutes, hasCloser, smallDay, sections };
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
  topicChoices: Record<Section, TopicChoice>,
  /**
   * Additional distinct topics per section, best-first, for days long enough to
   * hold more than one block. Optional: every existing caller that passes only
   * `topicChoices` keeps exactly its old one-topic-per-section behaviour.
   */
  extraChoices?: Partial<Record<Section, TopicChoice[]>>
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
  // The plan is the student's own hours, and nothing else sizes it. The
  // bad-day floor briefly did, which produced a thirty-minute plan for a
  // student who said six hours; it is gone. A heavy day is answered when it
  // happens (api/routine/busy-day), not predicted at signup.
  // The day's shape — sections, minutes, blocks — from the ONE authority both
  // Home and the whole plan read (dayShape above). Nothing about the split is
  // decided here any more; this function turns that shape into tasks.
  // ── The exam calendar's claim comes FIRST — the PR #88 gap, closed ────────
  //
  // The Whole Plan reserved a mock day's two hours (and the next day's two of
  // analysis) before laying any topic; Home shaped the FULL committed hours
  // and the two surfaces described two different Sundays. Now Home subtracts
  // the same claim (lib/exam-calendar.calendarClaim — the exact function
  // full-plan reserves with) and carries the mock as a real task, so day 0 of
  // the projection equals Home on mock days by construction.
  const exam = catExamDate(profile.attemptYear ?? now.getFullYear());
  const claim = calendarClaim(now, exam);

  const weak = profile.weakestSection ?? 'DILR';
  const strong = profile.strongestSection;
  const weakChoice = topicChoices[weak];

  const tasks: RoutineTask[] = [];

  // Calendar blocks lead the day with the Whole Plan's own labels and hours —
  // but a block lands only on a day BIG ENOUGH to hold it. The small-day law
  // (≤75 min = one finishable task, a won day) outranks the calendar: a
  // 30-minute student cannot sit a 2-hour mock, and shrinking the mock to fit
  // would schedule a lie. Days of 2h+ — every real mock-taking student —
  // match the Whole Plan exactly.
  let budgetMinutes = Math.round(hours * 60);
  if (claim.mockToday && budgetMinutes >= MOCK_SIT_HOURS * 60) {
    tasks.push({
      id: 'exam-mock',
      section: 'General',
      topic: null,
      label: 'Full mock',
      target: 'Full paper, exam conditions — 2 hours',
      estMinutes: MOCK_SIT_HOURS * 60,
      reason: 'Mock day — one complete mock every week',
    });
    budgetMinutes -= MOCK_SIT_HOURS * 60;
  }
  if (claim.analysisToday && budgetMinutes >= MOCK_ANALYSIS_HOURS * 60) {
    tasks.push({
      id: 'exam-mock-analysis',
      section: 'General',
      topic: null,
      label: "Analyse yesterday's mock",
      target: 'Every error: why it happened, and the fix',
      estMinutes: MOCK_ANALYSIS_HOURS * 60,
      reason: 'The analysis is where the marks are',
    });
    budgetMinutes -= MOCK_ANALYSIS_HOURS * 60;
  }
  const topicHours = budgetMinutes / 60;
  // Below half an hour of topic room the day belongs to the calendar alone —
  // dayShape floors its budget back up to 30 minutes, which would invent time
  // the mock already took.
  const hasTopicRoom = topicHours >= 0.5;

  const shape = hasTopicRoom ? dayShape({
    hours: topicHours,
    weakestSection: profile.weakestSection ?? null,
    isWorkingProfessional: !!profile.isWorkingProfessional,
    isRepeater: !!profile.isRepeater,
    weekend,
    phase,
    dayIndex: Math.floor(now.getTime() / 86_400_000),
  }) : null;

  if (shape) {
  const { closerMinutes, hasCloser } = shape;

  const prioritySlice = shape.sections[0];
  const otherSlices = shape.sections.slice(1);
  const activeNonWeak = otherSlices.map((s) => s.section);
  const otherMinutes = otherSlices.map((s) => s.minutes);
  const priorityMinutes = prioritySlice.minutes;

  const weakPicks = extraChoices?.[weak]?.slice(0, prioritySlice.blocks) ?? [weakChoice];
  const weakEach = Math.round(priorityMinutes / weakPicks.length);

  weakPicks.forEach((choice, i) => {
    // The first block absorbs the rounding so the day totals EXACTLY the budget.
    const minutes = i === 0 ? priorityMinutes - weakEach * (weakPicks.length - 1) : weakEach;
    tasks.push({
      id: i === 0 ? `${weak.toLowerCase()}-priority` : `${weak.toLowerCase()}-priority-${i + 1}`,
      section: weak,
      topic: choice.topic,
      label: `${weak} — ${choice.topic}`,
      // Verb from the TOPIC's status; volume still priced by the day's phase.
      target: targetPhrase(weak, choice.topic, minutes, phaseForTopic(choice.coverageStatus, phase)),
      estMinutes: minutes,
      reason: i === 0
        ? implementationIntention(weak, choice.topic, choice.reasons, phase)
        : sectionReason(weak, choice.topic, choice.reasons, 'second'),
      isImplementationIntention: i === 0,
    });
  });

  activeNonWeak.forEach((section, i) => {
    const sectionMinutes = otherMinutes[i];
    const picks = extraChoices?.[section]?.slice(0, otherSlices[i].blocks) ?? [topicChoices[section]];
    const each = Math.round(sectionMinutes / picks.length);
    picks.forEach((choice, j) => {
      const minutes = j === 0 ? sectionMinutes - each * (picks.length - 1) : each;
      tasks.push({
        id: j === 0 ? `${section.toLowerCase()}-set` : `${section.toLowerCase()}-set-${j + 1}`,
        section,
        topic: choice.topic,
        label: `${section} — ${choice.topic}`,
        target: targetPhrase(section, choice.topic, minutes, phaseForTopic(choice.coverageStatus, phase)),
        estMinutes: minutes,
        reason: sectionReason(section, choice.topic, choice.reasons, i === 0 ? 'second' : 'third'),
      });
    });
  });

  // Phase-specific closing task, in do-order (last). Sized from closerMinutes
  // above — already carved out of the budget, never added on top. Small days
  // never get one: hasCloser is false there by construction.
  if (hasCloser && phase === 'intensive') {
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
        label: 'Mock analysis',
        target: 'Re-open your last mock, note 3 mistakes',
        estMinutes: closerMinutes,
        reason: 'Mistakes > new topics',
      });
    } else if (profile.isWorkingProfessional && !weekend) {
      tasks.push({
        id: 'weekday-sectional',
        section: weak,
        topic: null,
        label: `${weak} — timed sectional`,
        target: 'One timed set — accuracy over volume',
        estMinutes: closerMinutes,
        reason: 'Full mock waits for weekend',
      });
    } else {
      tasks.push({
        id: 'mock-or-review',
        section: 'General',
        topic: null,
        label: 'Sectional mock',
        target: 'One timed sectional, exam conditions',
        estMinutes: closerMinutes,
        reason: 'Mocks = #1 signal now',
      });
    }
  } else if (hasCloser && phase === 'revision') {
    tasks.push({
      id: 'revision-block',
      section: strong ?? weak,
      topic: null,
      label: `${strong ?? weak} rapid recall`,
      target: '15-minute recall — formulas and set-ups from memory',
      estMinutes: closerMinutes,
      reason: 'Protect your strengths',
    });
  } else if (hasCloser && profile.isRepeater) {
    tasks.push({
      id: 'repeater-review',
      section: weak,
      topic: null,
      label: `Yesterday's ${weak} mistakes`,
      target: 'Rework each one until it cracks',
      estMinutes: closerMinutes,
      reason: "Close yesterday's gaps first",
    });
  }

  }

  const estMinutes = tasks.reduce((s, t) => s + t.estMinutes, 0);
  // The size we SAY must be the size we BUILT — calendar blocks included.
  // estMinutes equals the day's whole budget by construction: the priority
  // slice absorbs topic rounding and the mock/analysis blocks are fixed.
  const shownHours = Math.round((estMinutes / 60) * 10) / 10;
  const whySummary = personalizationSummary(profile, weekend, shownHours, weakChoice.topic);
  return { phase, tasks, estMinutes, whySummary };
}
