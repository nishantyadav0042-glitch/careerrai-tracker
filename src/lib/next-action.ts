import { isRevisionDue, isRevisableStatus } from './revision-due';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import type { TargetProgress } from '@/lib/coaching-progress';

// THE NEXT BEST ACTION ENGINE.
//
// Everything else we built looks backwards: what got parsed, what got done,
// how far behind you are. A student does not open an app at 9pm to find out
// what already happened. They open it to answer one question —
//
//     "What is the highest-value thing I can do with the time I have left?"
//
// This is that answer. It is deterministic, it is explainable, and every
// recommendation carries the real number that produced it, because a
// recommendation a student cannot interrogate is one they will stop trusting
// the first time it feels wrong.
//
// What it will NOT do: predict a percentile. We have no calibration data
// linking effort to CAT outcome, and "you'll get 96.4" is a fabricated number
// that reads as science. Direction and magnitude we can defend; a decimal
// percentile we cannot.

export type ActionKind = 'coaching_due' | 'weak_section' | 'high_weightage' | 'revision' | 'finish_started' | 'mock';

export interface StudyAction {
  kind: ActionKind;
  /** The instruction itself. Imperative, specific, doable tonight. */
  title: string;
  /** The evidence. Always a real number from this student's own data. */
  why: string;
  /** The same evidence in a glance — six words, one number. */
  whyShort: string;
  minutes: number;
  section: string | null;
  topic: string | null;
}

export interface ActionContext {
  /** Minutes the student says they have right now. */
  minutes: number;
  /** topic -> coverage status. */
  coverage: { topic: string; status: string; isPriority?: boolean }[];
  /** Latest mock section percentiles, when they've taken one. DISPLAY ONLY. */
  mock: { varc: number | null; dilr: number | null; qa: number | null } | null;
  /**
   * The student's weakest section, ALREADY RESOLVED by the caller through
   * lib/focus-sections — the same value the daily plan leads with.
   *
   * This module used to derive it here from `mock` with rules of its own: the
   * latest mock at ANY age (no recency window at all), two of three sections
   * counted as complete, and a gap of 10 percentile points to act on — against
   * the canonical 45 days, all three sections, and a gap of 3. So a two-year-old
   * partial mock could tell a student "VARC is your weakest section" on Home,
   * directly above a plan card leading DILR.
   */
  weakestSection: string | null;
  /** The archetype cadence multiplier, for the revision rule. */
  revisionMultiplier?: number;
  /** Days since each topic was last practised, when known. */
  daysSincePractice: Record<string, number | null>;
  /** Coaching targets with a real daily requirement. */
  targets: TargetProgress[];
  /** Whether the student chose to follow their coaching's order. */
  followingCoaching: boolean;
  /**
   * What this student has actually DONE with each kind of advice so far:
   * kind -> { shown, followed }. This is the learning loop — month 1 ranks by
   * fixed heuristics, month 6 knows this student never acts on revision
   * prompts and always acts on weak-section ones, and ranks accordingly.
   */
  history?: Record<string, { shown: number; followed: number }>;
}

const SECTION_OF: Record<string, string> = {};
for (const [topic, meta] of Object.entries(TOPIC_METADATA)) SECTION_OF[topic] = meta.section;

/** Roughly how long one unit of a coaching target takes. Honest averages. */
const MINUTES_PER_UNIT: Record<string, number> = {
  sets: 15, questions: 2, topic_test: 25, sectional: 40, mock: 120, classes: 60, revision: 20, other: 20,
};

function weightage(topic: string): number {
  return TOPIC_METADATA[topic]?.weightage ?? 3;
}

/**
 * Ranked actions for the time available. Highest value first.
 *
 * The ordering is a claim about study strategy, so it is stated plainly rather
 * than buried in a score:
 *   1. A coaching deliverable with a real deadline — a date is the only truly
 *      time-bound thing here, and missing it has consequences we don't control.
 *   2. The weakest section by actual mock percentile — the biggest lever on a
 *      score is the section dragging it down, not the one already working.
 *   3. High-weightage topics never started — where the marks physically are.
 *   4. Revision on something earned but fading — cheapest possible points.
 *   5. Finishing what's already open, because half-learnt topics score nothing.
 */
export function nextBestActions(ctx: ActionContext): StudyAction[] {
  const out: StudyAction[] = [];
  const statusOf = new Map(ctx.coverage.map((c) => [c.topic, c.status]));

  // 1 — Coaching, when there's a dated obligation and they opted to follow it.
  if (ctx.followingCoaching) {
    const due = ctx.targets
      .filter((t) => t.requiredPerDay != null && t.daysLeft != null && t.status !== 'done')
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))[0];
    if (due) {
      const per = MINUTES_PER_UNIT[due.key.split(':')[0]] ?? 20;
      const n = due.requiredPerDay!;
      out.push({
        kind: 'coaching_due',
        title: `${n} ${due.label.replace(/^\d+[-\d\s+]*/, '').trim() || 'from your coaching'} — today's share`,
        why: `Your coaching's date is ${due.daysLeft} days out. ${n}/day from here keeps it reachable.`,
        whyShort: `${due.daysLeft} days to your coaching date`,
        minutes: Math.min(ctx.minutes, Math.max(15, n * per)),
        section: due.section,
        topic: null,
      });
    }
  }

  // 2 — The section actually dragging the score down, from real mock data.
  if (ctx.weakestSection) {
    const weakSection = ctx.weakestSection;
    const candidates = Object.keys(TOPIC_METADATA)
      .filter((t) => SECTION_OF[t] === weakSection)
      .filter((t) => (statusOf.get(t) ?? 'not_started') !== 'exam_ready')
      .sort((a, b) => weightage(b) - weightage(a));
    const pick = candidates[0];
    if (pick) {
      // The percentiles are quoted only when the caller supplied them, and
      // only to EXPLAIN a section the shared resolver already chose. They no
      // longer decide it.
      const p = ctx.mock;
      const measured = p && typeof (p as Record<string, number | null>)[weakSection.toLowerCase()] === 'number'
        ? (p as unknown as Record<string, number>)[weakSection.toLowerCase()]
        : null;
      out.push({
        kind: 'weak_section',
        title: `${pick} — one focused block`,
        why: measured != null
          ? `${weakSection} sat at ${measured} percentile in your last mock. That gap is the biggest single lever you have.`
          : `${weakSection} is where your plan says the marks are leaking. That gap is the biggest single lever you have.`,
        whyShort: `${weakSection} is your weakest section`,
        minutes: Math.min(ctx.minutes, 45),
        section: weakSection,
        topic: pick,
      });
    }
  }

  // 3 — Highest-weightage topic never opened.
  const untouched = ctx.coverage
    .filter((c) => (c.status ?? 'not_started') === 'not_started')
    .map((c) => c.topic)
    .filter((t) => weightage(t) >= 4)
    .sort((a, b) => weightage(b) - weightage(a))[0];
  if (untouched) {
    out.push({
      kind: 'high_weightage',
      title: `Start ${untouched}`,
      why: `It's one of the heaviest scoring topics in ${SECTION_OF[untouched] ?? 'the paper'} and you haven't opened it yet.`,
      whyShort: 'High marks, not started',
      minutes: Math.min(ctx.minutes, 40),
      section: SECTION_OF[untouched] ?? null,
      topic: untouched,
    });
  }

  // 4 — Something earned and now fading. Cheapest marks on the board.
  // ONE revision rule (lib/revision-due) — per-topic cadence, archetype
  // adjusted. This was a flat 14 days for EVERY topic, so a weekly-cadence
  // topic looked fresh for a fortnight while the plan had it overdue.
  const fading = Object.entries(ctx.daysSincePractice)
    .filter(([topic, days]) =>
      isRevisableStatus(statusOf.get(topic))
      && isRevisionDue({ topic, daysSince: days, multiplier: ctx.revisionMultiplier ?? 1 }))
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  if (fading) {
    out.push({
      kind: 'revision',
      title: `Revise ${fading[0]}`,
      why: `You had this one working and haven't touched it in ${fading[1]} days. Re-earning it is far cheaper than learning it again.`,
      whyShort: `Untouched ${fading[1]} days`,
      minutes: Math.min(ctx.minutes, 25),
      section: SECTION_OF[fading[0]] ?? null,
      topic: fading[0],
    });
  }

  // 5 — Close out something already open.
  const started = ctx.coverage.find((c) => c.status === 'learning');
  if (started) {
    out.push({
      kind: 'finish_started',
      title: `Finish ${started.topic}`,
      why: `It's still half-open, and a half-learnt topic scores nothing on the day.`,
      whyShort: 'Half done',
      minutes: Math.min(ctx.minutes, 40),
      section: SECTION_OF[started.topic] ?? null,
      topic: started.topic,
    });
  }

  // ── The learning step ────────────────────────────────────────────────
  // Re-rank by what this student has actually acted on. A kind they have
  // ignored repeatedly gets pushed down; one they reliably act on rises. We
  // only trust the signal after enough shows to be more than noise, and we
  // never drop a kind entirely — a student's habits change, and an engine that
  // permanently silences an option can never discover that.
  const MIN_SHOWS = 4;
  const scored = out.map((a, i) => {
    const h = ctx.history?.[a.kind];
    let adjust = 0;
    if (h && h.shown >= MIN_SHOWS) {
      const rate = h.followed / h.shown;
      // Centred on 0.5 so an average kind is unmoved. Bounded to +/- 1.5
      // positions so evidence nudges the order, never overturns strategy.
      adjust = Math.max(-1.5, Math.min(1.5, (rate - 0.5) * 3));
    }
    return { a, rank: i - adjust };
  });
  scored.sort((x, y) => x.rank - y.rank);
  const out2 = scored.map((s2) => s2.a);

  // One topic, one slot. The weak-section rule and the high-weightage rule can
  // legitimately land on the same topic, and telling a student to "focus on
  // Reading Comprehension" and then "start Reading Comprehension" reads as a
  // system that isn't paying attention.
  const seen = new Set<string>();
  const deduped = out2.filter((a) => {
    if (!a.topic) return true;
    if (seen.has(a.topic)) return false;
    seen.add(a.topic);
    return true;
  });

  // Fit the time they actually have. Never hand back a plan that doesn't fit —
  // an unachievable list is the fastest way to be ignored.
  const fitted: StudyAction[] = [];
  let left = ctx.minutes;
  for (const a of deduped) {
    if (left < 10) break;
    fitted.push({ ...a, minutes: Math.min(a.minutes, left) });
    left -= Math.min(a.minutes, left);
  }
  return fitted.slice(0, 3);
}
