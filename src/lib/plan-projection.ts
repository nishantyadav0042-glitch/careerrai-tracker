// ── THE forward projection — one planner, every surface ─────────────────────
//
// Founder, 11 Aug, after seeing Home and Whole Plan disagree about the same
// Tuesday:
//
//   "THE DEFINITION OF DONE: There is exactly one planning authority in
//    CareerRai. Home, today's API, and Whole Plan are different views /
//    materializations of that authority — not different planners."
//
// Before this file there were three. Home and the notification cron ran
// chooseSectionDay (the two-clock authority that makes 46/46 structural).
// The Whole Plan ran study-forecast.buildWeekPlan — an entirely separate
// scorer that sorted every remaining topic once by baseCoverageScore and
// bin-packed the list into days. The Blueprint's 7-day strip ran that same
// second planner again. Same student, same date, two answers:
//
//   Home,       11 Aug: Editorial Reading 264m · Arrangements 198m · Percentages 198m
//   Whole Plan, 11 Aug: RC 4h · Percentages 1h · Inequalities 2.5h · Arrangements 2h · Caselets 1.5h
//
// A second scorer cannot be kept "roughly in sync". It drifts the day someone
// tunes one of them, and the student is the one who finds out.
//
// So this module projects the SAME authority forward instead of re-deriving it:
//
//   · WHICH topics  → topic-selector.chooseSectionDay (syllabus clock + memory
//                     clock), exactly as Home calls it.
//   · HOW the day splits → routine-engine.dayShape, exactly as Home calls it.
//   · Day 0 is therefore Home, by construction — not by resemblance.
//
// Everything after day 0 is a PROJECTION, and it is honest about that: it
// advances the same state the real engine would advance (coverage opens on
// first contact, the repeat cool-down ticks, remaining hours drain) and asks
// the authority again. It is pure and deterministic — same inputs, same plan,
// every time it is called — which is what lets a student scroll to 15 August
// today and see that same day arrive on 15 August.
//
// What this file does NOT own: the exam calendar (mocks, their analysis, the
// November no-new-topics rule). Those are full-plan's, and they reach this
// module only as the per-day capacity it is handed.

import { TOPIC_METADATA } from './topics-constants';
import { REMAINING_FRACTION, type CoverageStatus } from './study-pace';
import { chooseSectionDay, type TopicCandidateInput } from './topic-selector';
import { syllabusPace } from './syllabus-pace';
import { dayShape, type Phase } from './routine-engine';
import type { Section } from './prep-model';

export type StudyMode = 'learn' | 'practice' | 'revise';

/**
 * Smallest block worth putting on a screen.
 *
 * A fifteen-minute "revise your weakest area" is not revision; it is a line on
 * a screen that makes the day look fuller than it is.
 */
export const MIN_BLOCK_HOURS = 0.5;

const SECTIONS_ALL: Section[] = ['QA', 'DILR', 'VARC'];
const half = (h: number) => Math.round(h * 2) / 2;

function modeFor(status: CoverageStatus): StudyMode {
  if (status === 'not_started' || status === 'learning') return 'learn';
  if (status === 'practicing') return 'practice';
  return 'revise';
}

export interface ProjectionDay {
  /** YYYY-MM-DD. */
  date: string;
  /**
   * Hours this day has for TOPIC work, after the exam calendar has taken its
   * cut. Zero is legal (a mock day that fills up, or a November revision day).
   */
  capacityHours: number;
  /** Coaching students: the topics their institute teaches on this date. */
  classTopics?: string[];
  /** Weekend days shape differently (routine-engine.dayShape). */
  weekend?: boolean;
  /** The study phase on this date, for the closer reservation. */
  phase?: Phase;
  /**
   * TODAY IS A FACT, NOT A PROJECTION. When the 6am cron has already persisted
   * this day's plan (daily_routines), the caller passes its topic blocks here
   * and this walk USES them instead of asking the authority again — then
   * advances the pool exactly as if it had chosen them. Born 12 Aug, when the
   * Whole Plan re-rolled Abhishek's Wednesday against the Home plan he was
   * already holding: the API had fed the plan's own row back into its memory
   * as "planned 0 days ago", and day 0 punished its own topics away.
   */
  fixedTopics?: { topic: string; hours: number }[];
}

export interface ProjectedItem {
  topic: string;
  section: Section;
  hours: number;
  mode: StudyMode;
  /** The status the topic held WHEN this block was planned — drives the verb. */
  coverageStatus: CoverageStatus;
}

export interface ProjectedDayPlan {
  date: string;
  items: ProjectedItem[];
  /**
   * Hours dayShape held back for the day's closing task (mock analysis, rapid
   * recall). Reported rather than swallowed, so the caller's rendering of the
   * day totals exactly what Home totals — the reservation is real either way.
   */
  closerHours: number;
}

export interface ProjectionInput {
  days: ProjectionDay[];
  /** The student's live Coverage Matrix. Missing topic ⇒ not_started. */
  coverage: { topic: string; status: string | null }[];
  /** studentEffortMultiplier — required, never defaulted (see study-pace). */
  effort: number;
  weakestSection: Section | null;
  isWorkingProfessional?: boolean;
  isRepeater?: boolean;
  /**
   * Calendar days from day 0 to the student's chosen syllabus-finish date.
   * Null when they never set one — the authority then holds its one-block-a-day
   * floor rather than turning every block into first contact.
   */
  daysToSyllabusTarget?: number | null;
  revisionMultiplier?: number;
  revisionSeason?: boolean;
  /** Topics the student starred in the Preparation Map. */
  priorityTopics?: string[];
  /** Topics swapped out of yesterday's plan — a day-0 signal only. */
  postponedTopics?: string[];
  /** Days since each topic was last PUT ON A PLAN, at day 0. */
  daysSincePlannedByTopic?: Record<string, number | null>;
  /** Days since each topic was last PRACTISED, at day 0. */
  daysSinceLastPracticedByTopic?: Record<string, number | null>;
}

interface TopicState {
  topic: string;
  section: Section;
  status: CoverageStatus;
  /** Hours of work this topic still owes, at this student's effort. */
  remainingHours: number;
  daysSincePlanned: number | null;
  daysSinceLastPracticed: number | null;
  priorityBonus: boolean;
  postponedBonus: boolean;
}

const isUntouched = (t: { status: CoverageStatus }) =>
  t.status === 'not_started';

/**
 * Build the per-section pool from the student's real coverage.
 *
 * Priced with the SAME REMAINING_FRACTION × effort model that study-pace's
 * remainingSyllabusHours uses, so the plan's hours and the feasibility verdict
 * on the same screen can never be two different arithmetics again.
 */
function buildPool(input: ProjectionInput): Record<Section, TopicState[]> {
  const statusByTopic = new Map<string, string>();
  for (const r of input.coverage) if (r.status) statusByTopic.set(r.topic, r.status);

  const priority = new Set(input.priorityTopics ?? []);
  const postponed = new Set(input.postponedTopics ?? []);
  const pool: Record<Section, TopicState[]> = { QA: [], DILR: [], VARC: [] };

  for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
    const section = meta.section as Section;
    if (!SECTIONS_ALL.includes(section)) continue;
    const status = (statusByTopic.get(topic) as CoverageStatus) ?? 'not_started';
    // exam_ready is earned, not scheduled — it comes back through the revision
    // queue (full-plan), never through the syllabus march.
    if (status === 'exam_ready') continue;
    const remainingHours = meta.estimatedHours * (REMAINING_FRACTION[status] ?? 1) * input.effort;
    if (remainingHours <= MIN_BLOCK_HOURS) continue;
    pool[section].push({
      topic,
      section,
      status,
      remainingHours,
      daysSincePlanned: input.daysSincePlannedByTopic?.[topic] ?? null,
      daysSinceLastPracticed: input.daysSinceLastPracticedByTopic?.[topic] ?? null,
      priorityBonus: priority.has(topic),
      postponedBonus: postponed.has(topic),
    });
  }
  return pool;
}

function toCandidate(t: TopicState, classToday: Set<string>): TopicCandidateInput {
  return {
    topic: t.topic,
    coverageStatus: t.status,
    daysSinceLastPracticed: t.daysSinceLastPracticed,
    daysSincePlanned: t.daysSincePlanned,
    priorityBonus: t.priorityBonus,
    postponedBonus: t.postponedBonus,
    todayClassBonus: classToday.has(t.topic),
  };
}

/**
 * Walk the student's remaining days, asking the one authority for each of them.
 *
 * Returns one entry per input day, in order, each carrying only TOPIC blocks —
 * mocks, analysis and revision are the caller's calendar, not this walk.
 */
export function projectPlan(input: ProjectionInput): ProjectedDayPlan[] {
  const pool = buildPool(input);
  const byTopic = new Map<string, TopicState>();
  for (const s of SECTIONS_ALL) for (const t of pool[s]) byTopic.set(t.topic, t);

  // The weakest section is the caller's (the same value Home leans on) or,
  // failing that, the section with the most work left.
  const remainingIn = (s: Section) => pool[s].reduce((sum, t) => sum + t.remainingHours, 0);
  const weakest: Section = input.weakestSection
    ?? [...SECTIONS_ALL].sort((a, b) => remainingIn(b) - remainingIn(a))[0];

  const out: ProjectedDayPlan[] = [];

  for (let d = 0; d < input.days.length; d++) {
    const day = input.days[d];
    const classToday = new Set(day.classTopics ?? []);
    const items: ProjectedItem[] = [];

    // Which sections still have work at all. A section that has drained gives
    // its hours back to the ones that have not, rather than wasting the slot.
    const live = SECTIONS_ALL.filter((s) => pool[s].some((t) => t.remainingHours > 0));

    // A coaching class topic gets its date whatever else the day holds — being
    // on the RIGHT DATE is the promise the uploaded sheet makes; the hours flex
    // around it. So a class section is never dropped from the day, and a day
    // with no capacity left still finds it a minimum block.
    const classSections = new Set(
      [...classToday]
        .map((t) => byTopic.get(t)?.section)
        .filter((s): s is Section => !!s)
    );

    // The persisted plan wins outright — no selector, no shape, no re-roll.
    // The pool still advances through it, so tomorrow projects FROM the fact.
    if (day.fixedTopics && day.fixedTopics.length > 0) {
      const planned = new Set<string>();
      for (const f of day.fixedTopics) {
        const state = byTopic.get(f.topic);
        items.push({
          topic: f.topic,
          section: state?.section ?? ((TOPIC_METADATA[f.topic]?.section as Section) ?? 'QA'),
          hours: f.hours,
          mode: state ? modeFor(state.status) : 'learn',
          coverageStatus: state?.status ?? 'not_started',
        });
        if (state) state.remainingHours = half(Math.max(0, state.remainingHours - f.hours));
        planned.add(f.topic);
      }
      advanceDay(pool, planned);
      out.push({ date: day.date, items, closerHours: 0 });
      continue;
    }

    const capacity = Math.max(0, day.capacityHours);

    if (live.length === 0 || (capacity < MIN_BLOCK_HOURS && classSections.size === 0)) {
      out.push({ date: day.date, items, closerHours: 0 });
      advanceDay(pool, new Set());
      continue;
    }

    // ── THE SHAPE — the same function Home calls ─────────────────────────────
    //
    // Only when the day has real capacity. A day the exam calendar has fully
    // claimed (a mock plus its analysis) has no shape to speak of; what it can
    // still owe is a coaching class topic, at the minimum block.
    const shape = capacity >= MIN_BLOCK_HOURS
      ? dayShape({
          hours: capacity,
          weakestSection: weakest,
          isWorkingProfessional: !!input.isWorkingProfessional,
          isRepeater: !!input.isRepeater,
          weekend: day.weekend ?? false,
          phase: day.phase ?? 'foundation',
        })
      : null;

    const shaped = (shape?.sections ?? [])
      .map((s) => ({ section: s.section, hours: half(s.minutes / 60), blocks: s.blocks }));

    // Half-hour rounding must not invent time. dayShape splits in MINUTES and
    // its slices total the budget exactly; rounding each slice to the half hour
    // the plan renders in does not — at 6h/day, 144+108+108 minutes became
    // 2.5+2+2 = 6.5 hours, and every weekday quietly asked for thirty minutes
    // the student never agreed to. The priority slice absorbs the drift, which
    // is the same rule generateRoutine uses to make Home total exactly.
    const topicHours = half(Math.max(0, capacity - (shape?.closerMinutes ?? 0) / 60));
    let drift = half(topicHours - shaped.reduce((sum, s) => sum + s.hours, 0));
    for (let i = 0; i < shaped.length && drift !== 0; i++) {
      const next = Math.max(MIN_BLOCK_HOURS, half(shaped[i].hours + drift));
      drift = half(drift - (next - shaped[i].hours));
      shaped[i].hours = next;
    }
    // A section with nothing left hands its hours on (via `carry` below).
    const slices = shaped.filter((s) => live.includes(s.section) || classSections.has(s.section));

    // Hours a dropped section gives up flow to the next slice, so a day is
    // filled to the student's commitment whenever there is work for it.
    let carry = half(Math.max(0,
      shaped.reduce((sum, s) => sum + s.hours, 0) - slices.reduce((sum, s) => sum + s.hours, 0)));

    // Being on the RIGHT DATE is the promise an uploaded timetable makes, so a
    // class section is never absent from its own day, and always has room for
    // every topic that day's class teaches — the hours flex, never the date.
    //
    // Caught by test: a coaching day teaching Probability AND Logarithms (both
    // QA) got QA's one shaped block and silently dropped the second, on the very
    // screen a student holds their sheet next to.
    for (const s of classSections) {
      const need = [...classToday].filter((t) => byTopic.get(t)?.section === s).length;
      const existing = slices.find((x) => x.section === s);
      if (!existing) {
        slices.push({ section: s, hours: half(need * MIN_BLOCK_HOURS), blocks: need });
      } else if (existing.blocks < need) {
        const extra = half((need - existing.blocks) * MIN_BLOCK_HOURS);
        existing.blocks = need;
        existing.hours = half(existing.hours + Math.max(0, extra - carry));
        carry = half(Math.max(0, carry - extra));
      }
    }
    if (slices.length === 0) {
      out.push({ date: day.date, items, closerHours: 0 });
      advanceDay(pool, new Set());
      continue;
    }

    const plannedToday = new Set<string>();

    for (const slice of slices) {
      const available = pool[slice.section].filter((t) => t.remainingHours > 0);
      if (available.length === 0) { carry = half(carry + slice.hours); continue; }

      let hours = half(slice.hours + carry);
      carry = 0;
      if (hours < MIN_BLOCK_HOURS) continue;

      // Does this section finish in time? Measured per section against the
      // student's own date, exactly as buildTopicChoices does for Home.
      const untouched = available.filter(isUntouched).length;
      const daysLeft = input.daysToSyllabusTarget == null
        ? null
        : input.daysToSyllabusTarget - d;
      const pace = daysLeft == null
        ? { pressure: 0 }
        : syllabusPace({ untouchedTopics: untouched, daysToTarget: daysLeft });

      const picks = chooseSectionDay(
        available.map((t) => toCandidate(t, classToday)),
        slice.blocks,
        {
          untouchedCount: untouched,
          daysToTarget: daysLeft,
          revisionMultiplier: input.revisionMultiplier,
          revisionSeason: input.revisionSeason,
          newTopicPressure: pace.pressure,
        },
      );

      for (let i = 0; i < picks.length && hours >= MIN_BLOCK_HOURS; i++) {
        const state = byTopic.get(picks[i].topic);
        if (!state || state.remainingHours <= 0) continue;
        const share = Math.max(MIN_BLOCK_HOURS, half(hours / (picks.length - i)));
        const take = half(Math.min(share, hours, state.remainingHours));
        if (take < MIN_BLOCK_HOURS) continue;
        items.push({
          topic: state.topic,
          section: slice.section,
          hours: take,
          mode: modeFor(state.status),
          coverageStatus: state.status,
        });
        state.remainingHours = half(Math.max(0, state.remainingHours - take));
        hours = half(hours - take);
        plannedToday.add(state.topic);
      }
      carry = half(carry + Math.max(0, hours));
    }

    advanceDay(pool, plannedToday);
    out.push({ date: day.date, items, closerHours: half((shape?.closerMinutes ?? 0) / 60) });
  }

  return out;
}

/**
 * Move the pool on by one night, exactly as the real engine's next-morning read
 * would find it: a topic shown today has had its first contact (so it is open,
 * and no longer counts against the syllabus clock) and reads as "planned one
 * day ago" tomorrow; everything else ages.
 *
 * The off-by-one matters. buildHistory records `daysSincePlanned` as the gap in
 * days between today and the routine that carried the topic, so a topic on
 * yesterday's plan arrives as 1, never 0. Advancing to 0 here would have made
 * the projection punish every topic a full day harder than the live plan does,
 * and the two would have disagreed from day 1.
 */
function advanceDay(pool: Record<Section, TopicState[]>, planned: Set<string>) {
  for (const s of SECTIONS_ALL) {
    for (const t of pool[s]) {
      if (planned.has(t.topic)) {
        if (t.status === 'not_started') t.status = 'learning';
        t.daysSincePlanned = 1;
        t.daysSinceLastPracticed = 1;
        continue;
      }
      if (t.daysSincePlanned != null) t.daysSincePlanned++;
      if (t.daysSinceLastPracticed != null) t.daysSinceLastPracticed++;
    }
  }
}
