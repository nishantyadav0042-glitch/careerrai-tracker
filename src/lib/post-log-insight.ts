// ── What just happened, said back to the student ────────────────────────────
//
// Founder, 19 Aug: after filling a log he wanted to be told something about
// THAT log -- "I ticked a Quant topic, tell me I moved" -- and instead got
// silence.
//
// The silence was structural, not a bug in the copy. computePrescriptiveLine
// (log-daily) opens with `if (recent.length < 3) return null`, so a student's
// SECOND log is guaranteed to produce nothing at all. Production says the
// average logging student has 2.3 logs and 105 of 151 never log twice: the one
// moment where most students decide whether this app does anything for them is
// the exact moment it is guaranteed to say nothing.
//
// Its remaining rules are also all CORRECTIVE -- skipping a section, weak
// consistency, no mock, repeating one section. Every one of them tells the
// student what is wrong. None reflects the work they just did. That is the
// wrong register for the instant immediately after effort.
//
// So this module answers a different question from that engine. It does not
// replace it and does not recompute any of its rules:
//
//   computePrescriptiveLine : "what pattern should you know about?"  (14 days)
//   postLogInsight          : "what did the thing you just did mean?" (today)
//
// EVERY LINE IS EARNED FROM A ROW THE STUDENT CREATED. No estimates, no
// encouragement that isn't backed by a fact, and null when there is nothing
// true to say -- the founder's own non-negotiable, and the rule this codebase
// has spent a week enforcing everywhere else.
//
// One case deserves its own note, because it looks like a violation and is not.
// On the second log there is genuinely no pattern yet. Saying "two days logged,
// one more and a pattern becomes readable" is not a claim about the student's
// preparation -- it is an honest statement about what the SYSTEM can and
// cannot yet see, in the same family as a `not_collected` provenance stamp.
// Inventing a pattern there would be the violation; describing the absence is
// the opposite of one.

import { STATUS_LABEL, type CoverageStatus } from './coverage-status';

export type PostLogKind =
  | 'coverage_advance'   // a tick moved a topic up the ladder
  | 'section_return'     // came back to a section after a gap
  | 'plan_finished'      // finished everything planned today
  | 'pattern_forming';   // honest: not enough history yet

export interface PostLogInsight {
  kind: PostLogKind;
  text: string;
  /**
   * Human intervention, when a rule has EARNED the right to offer it.
   *
   * Deliberately typed and deliberately never set by any rule in this file.
   *
   * Founder, 19 Aug: "Don't make every insight a Buddy CTA... if every insight
   * eventually says Talk to an IIM Buddy, students will learn Rai is trying to
   * sell me. You've destroyed the whole premise." The ratio he wants is most
   * insights pure value, human help an exception with a deterministic trigger.
   *
   * The structure exists BEFORE the first intervention rule does, so that
   * adding one is a deliberate act at a reviewed seam rather than a copy tweak
   * inside a rule. cta-budget.guard.test.ts holds the line: a rule in this file
   * may not set it, and an ordinary progress insight may never carry one.
   */
  intervention?: never;
}

export interface PostLogEvidence {
  /**
   * Topics whose coverage row was WRITTEN TODAY, with the rung it now sits on.
   *
   * Deliberately a STATE, not a claimed transition. The honest reason: a tick
   * from the log sheet fans out to complete-task AFTER log-daily has already
   * answered, so at the moment this runs the previous rung is not knowable for
   * that path. Rather than guess a "from", the line states where the topic now
   * IS -- true regardless of what it was -- and the rule below only speaks
   * about rungs a student cannot land on by accident.
   */
  advancedToday: { topic: string; status: CoverageStatus }[];
  /** Core sections logged today. */
  sectionsToday: string[];
  /** For each core section, days since it was last logged before today. */
  daysSinceSection: Record<string, number | null>;
  /** Today's plan: how many tasks, and how much of it is finished (weighted). */
  plannedToday: number;
  weightedDoneToday: number;
  /** How many days this student has logged IN TOTAL, including today. */
  logCount: number;
}

/** A gap this long makes "you came back to it" a fact worth naming. */
export const RETURN_GAP_DAYS = 3;

export function postLogInsight(e: PostLogEvidence): PostLogInsight | null {
  // 1 · A TOPIC SITS HIGHER THAN "just started". The strongest thing we can
  //     say, because the student caused it and the rung is their own declared
  //     position -- not a percentage we derived.
  //
  //     `not_started` and `learning` are excluded on purpose: `learning` is
  //     where a first touch lands, so announcing it would be announcing that
  //     the student tapped something. The rungs above it are reached only by
  //     repeated, deliberate work, which is what makes them worth naming.
  const up = e.advancedToday.filter((a) => a.status !== 'not_started' && a.status !== 'learning');
  if (up.length === 1) {
    const a = up[0];
    return {
      kind: 'coverage_advance',
      text: `${a.topic} is now ${STATUS_LABEL[a.status] ?? a.status}. Your own ticks put it there.`,
    };
  }
  if (up.length > 1) {
    return {
      kind: 'coverage_advance',
      text: `${up.length} topics moved forward today — ${up.map((a) => a.topic).slice(0, 2).join(', ')}${up.length > 2 ? ' and more' : ''}.`,
    };
  }

  // 2 · CAME BACK TO SOMETHING AVOIDED. A return is the behaviour worth
  //     reinforcing, and it is the mirror image of the avoidance rule the
  //     other engine uses to scold. Same fact, opposite moment.
  const returned = e.sectionsToday
    .map((s) => ({ section: s, gap: e.daysSinceSection[s] }))
    .filter((x): x is { section: string; gap: number } => typeof x.gap === 'number' && x.gap >= RETURN_GAP_DAYS)
    .sort((a, b) => b.gap - a.gap)[0];
  if (returned) {
    return {
      kind: 'section_return',
      text: `You came back to ${returned.section} after ${returned.gap} days. That's the gap closing.`,
    };
  }

  // 3 · FINISHED THE PLAN. Uses the weighted count, so a day of half-ticks is
  //     honestly not a finished plan (completion-portion is the authority).
  if (e.plannedToday > 0 && e.weightedDoneToday >= e.plannedToday) {
    return {
      kind: 'plan_finished',
      text: `Every one of today's ${e.plannedToday} planned tasks is done.`,
    };
  }

  // 4 · NOT ENOUGH HISTORY YET -- said plainly. See the header: this describes
  //     what the system can see, it does not claim anything about the student.
  //     Fires only on log 2 and 3, which is exactly where the silence was.
  if (e.logCount === 2) {
    return { kind: 'pattern_forming', text: 'Two days logged. One more and CareerRai can start reading your pattern.' };
  }
  if (e.logCount === 3) {
    return { kind: 'pattern_forming', text: 'Three days in. From here CareerRai can start telling you what is changing.' };
  }

  // Nothing true to say. The other engine gets its turn; if it also has
  // nothing, the student sees no insight, which is correct.
  return null;
}
