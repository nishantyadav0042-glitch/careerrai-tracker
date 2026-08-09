// ── The 7-day forward plan ──────────────────────────────────────────────────
// Turns the same per-topic hours model the pace ring uses into a real
// look-ahead schedule: the highest-priority remaining topics, bin-packed into
// the next N days at the student's daily capacity. A big topic (RC = 30h)
// naturally spans several days; a small one shares a day with others. This is
// what makes the plan feel like a road ahead, not just "today".

import { TOPIC_METADATA } from './topics-constants';
import { REMAINING_FRACTION, type CoverageStatus } from './study-pace';
import { baseCoverageScore } from './topic-selector';

export type StudyMode = 'learn' | 'practice' | 'revise';

export interface DayPlanItem { topic: string; section: string; hours: number; mode: StudyMode }
export interface DayPlan { iso: string; label: string; items: DayPlanItem[]; totalHours: number }

// Topic ordering now comes from the ONE shared scorer (topic-selector
// baseCoverageScore) — "finish what you started" (learning > not_started),
// weightage-primary. The old COVERAGE_PRIORITY table here ranked the OPPOSITE
// way (not_started first) and is gone: the daily card and the whole plan can no
// longer disagree about which topic is next.

function modeFor(status: CoverageStatus): StudyMode {
  if (status === 'not_started' || status === 'learning') return 'learn';
  if (status === 'practicing') return 'practice';
  return 'revise';
}

function dayLabel(date: Date, offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

const half = (h: number) => Math.round(h * 2) / 2;

export function buildWeekPlan(
  rows: { topic: string; status: string | null }[],
  committedDaily: number | null,
  today: Date,
  /**
   * Per-student effort scaling (study-pace.studentEffortMultiplier). Required,
   * and placed ahead of the optional arguments so it cannot be forgotten:
   * this lays REAL hours into REAL days, so a repeater whose syllabus is
   * priced at 258h everywhere else must not be handed 397h of week.
   */
  effort: number,
  days = 7,
  /**
   * Hours per day the student ACTUALLY needs to finish on time (the pace
   * ring's requiredPerDay). Optional so existing callers keep working.
   */
  requiredDaily?: number | null,
): DayPlan[] {
  const statusByTopic = new Map<string, string>();
  for (const r of rows) if (r.status) statusByTopic.set(r.topic, r.status);

  // Remaining topics with hours-left + a scheduling score. Prerequisite still
  // unstarted → deprioritised (never scheduled ahead of its own foundation).
  const queue = Object.entries(TOPIC_METADATA)
    .map(([topic, meta]) => {
      const status = (statusByTopic.get(topic) as CoverageStatus) ?? 'not_started';
      const remaining = meta.estimatedHours * (REMAINING_FRACTION[status] ?? 1) * effort;
      const prereqUnmet = !!meta.prerequisites?.length && meta.prerequisites.some((p) => {
        const s = statusByTopic.get(p);
        return !s || s === 'not_started';
      });
      // The ONE shared scorer — same coverage + weightage + sequence + prereq
      // philosophy the daily card uses. (Per-day signals like revision-due and
      // the student's own taps are the daily card's job, not the whole plan's.)
      const score = baseCoverageScore({ status, weightage: meta.weightage, sequenceRank: meta.sequenceRank, prereqUnmet });
      return { topic, section: meta.section, status, remaining, score };
    })
    .filter((t) => t.remaining > 0.5 && t.status !== 'exam_ready')
    .sort((a, b) => b.score - a.score);

  // Capacity for a day's schedule.
  //
  // This used to be committedDaily alone, which meant a student who said they
  // could manage 12h/day got 12h of topics scheduled every day — even when the
  // pace ring, on the same screen, said 4.5h/day would finish the syllabus on
  // time. Two numbers for "per day", 2.7x apart, both presented as the plan.
  //
  // Schedule what's NEEDED, never more than they have available:
  //   required < committed  -> required   (don't invent 7 extra hours of work)
  //   required > committed  -> committed  (can't schedule time they don't have;
  //                                        the ring already tells them they're
  //                                        behind, the plan shouldn't lie about it)
  const committed = committedDaily && committedDaily > 0 ? committedDaily : 4;
  const need = requiredDaily != null && requiredDaily > 0 ? requiredDaily : null;
  // A floor of 1h: a nearly-finished student should still get a real block
  // rather than a 15-minute stub.
  const cap = need != null ? Math.max(1, Math.min(committed, need)) : committed;
  const plan: DayPlan[] = [];
  let idx = 0;
  let leftOnCurrent = queue.length ? queue[0].remaining : 0;

  for (let d = 0; d < days && idx < queue.length; d++) {
    const date = new Date(today.getTime() + d * 86_400_000);
    const items: DayPlanItem[] = [];
    let capacity = cap;
    while (capacity > 0.25 && idx < queue.length) {
      const t = queue[idx];
      const alloc = Math.min(leftOnCurrent, capacity);
      if (alloc >= 0.5) items.push({ topic: t.topic, section: t.section, hours: half(alloc), mode: modeFor(t.status) });
      leftOnCurrent -= alloc;
      capacity -= alloc;
      if (leftOnCurrent <= 0.25) { idx++; leftOnCurrent = idx < queue.length ? queue[idx].remaining : 0; }
    }
    plan.push({ iso: date.toISOString().split('T')[0], label: dayLabel(date, d), items, totalHours: half(items.reduce((s, i) => s + i.hours, 0)) });
  }
  return plan;
}
