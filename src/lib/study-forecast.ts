// ── The 7-day forward plan ──────────────────────────────────────────────────
// Turns the same per-topic hours model the pace ring uses into a real
// look-ahead schedule: the highest-priority remaining topics, bin-packed into
// the next N days at the student's daily capacity. A big topic (RC = 30h)
// naturally spans several days; a small one shares a day with others. This is
// what makes the plan feel like a road ahead, not just "today".

import { TOPIC_METADATA } from './topics-constants';
import { REMAINING_FRACTION, type CoverageStatus } from './study-pace';

export type StudyMode = 'learn' | 'practice' | 'revise';

export interface DayPlanItem { topic: string; section: string; hours: number; mode: StudyMode }
export interface DayPlan { iso: string; label: string; items: DayPlanItem[]; totalHours: number }

// How much a topic at each status "wants" to be scheduled next. Mirrors the
// Topic Selector's ordering: untouched/foundational first, revision last.
const COVERAGE_PRIORITY: Record<CoverageStatus, number> = {
  not_started: 30, learning: 22, practicing: 12, revising: 8, exam_ready: 0,
};

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
  days = 7,
): DayPlan[] {
  const statusByTopic = new Map<string, string>();
  for (const r of rows) if (r.status) statusByTopic.set(r.topic, r.status);

  // Remaining topics with hours-left + a scheduling score. Prerequisite still
  // unstarted → deprioritised (never scheduled ahead of its own foundation).
  const queue = Object.entries(TOPIC_METADATA)
    .map(([topic, meta]) => {
      const status = (statusByTopic.get(topic) as CoverageStatus) ?? 'not_started';
      const remaining = meta.estimatedHours * (REMAINING_FRACTION[status] ?? 1);
      let prereqPenalty = 0;
      if (meta.prerequisites?.length) {
        const unmet = meta.prerequisites.some((p) => {
          const s = statusByTopic.get(p);
          return !s || s === 'not_started';
        });
        if (unmet) prereqPenalty = 15;
      }
      const score = (COVERAGE_PRIORITY[status] ?? 0) + meta.weightage * 3 - prereqPenalty - meta.sequenceRank * 0.1;
      return { topic, section: meta.section, status, remaining, score };
    })
    .filter((t) => t.remaining > 0.5 && t.status !== 'exam_ready')
    .sort((a, b) => b.score - a.score);

  const cap = committedDaily && committedDaily > 0 ? committedDaily : 4;
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
