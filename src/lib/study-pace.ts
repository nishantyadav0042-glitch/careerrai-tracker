// ── The study-pace engine ──────────────────────────────────────────────────
// A precise, per-topic model of "how many hours of study are still ahead of
// this student, and therefore how many hours a day they must put in to hit
// their own finish date." This replaces the old flat 5h/3h/1.5h-per-unit
// bucket (which treated Reading Comprehension and Odd-One-Out as identical
// work) with the CURATED per-topic estimatedHours already in TOPIC_METADATA
// (RC = 30h, Para Jumbles = 12h, …), scaled by how far the student already is
// on each topic.
//
// Catch-up AND roll-over fall out of ONE recomputation, no ledger required:
//   requiredPerDay = remainingHours / daysLeft
// recomputed every day from the student's ACTUAL coverage. Miss a few days and
// remainingHours hasn't dropped while daysLeft has → requiredPerDay rises (the
// "+1.5h catch-up"). Study extra and remainingHours drops faster than the
// calendar → requiredPerDay falls below the committed pace (the roll-over
// buffer). Same formula, both directions, always honest.

import { TOPIC_METADATA } from './topics-constants';
import type { CoverageStatus } from './coverage-status';

// The ladder itself lives in coverage-status.ts — one declaration for the
// whole app. Re-exported here because half the codebase already imports the
// type from this module.
export type { CoverageStatus };

// Fraction of a topic's total estimatedHours that is STILL AHEAD at each
// declared status. not_started = all of it; exam_ready = light maintenance
// only. These are the professional-planner assumptions, stated once here so
// there's a single place to tune them.
export const REMAINING_FRACTION: Record<CoverageStatus, number> = {
  not_started: 1.0,
  learning: 0.65,   // concepts opened, the bulk of practice still ahead
  practicing: 0.35, // learned; needs volume + first revision
  revising: 0.15,   // in the revision cycle, mostly retention now
  exam_ready: 0.05, // earned; occasional upkeep
};

export interface TopicStatusRow { topic: string; status: string | null }

// The single source of truth for "hours of syllabus left". Iterates ALL exam
// topics in TOPIC_METADATA (not just those with a coverage row), defaulting an
// unmapped/absent topic to not_started so nothing is silently treated as done.
export function remainingSyllabusHours(rows: TopicStatusRow[]): number {
  const statusByTopic = new Map<string, string>();
  for (const r of rows) if (r.status) statusByTopic.set(r.topic, r.status);

  let hours = 0;
  for (const [topic, meta] of Object.entries(TOPIC_METADATA)) {
    const status = (statusByTopic.get(topic) as CoverageStatus) ?? 'not_started';
    const frac = REMAINING_FRACTION[status] ?? 1.0;
    hours += meta.estimatedHours * frac;
  }
  return Math.round(hours);
}

// Total syllabus hours if starting from zero — the denominator for a
// "% complete" arc that reflects real work, not raw topic counts.
export function totalSyllabusHours(): number {
  let hours = 0;
  for (const meta of Object.values(TOPIC_METADATA)) hours += meta.estimatedHours;
  return Math.round(hours);
}

// ── The mock budget ─────────────────────────────────────────────────────────
// A full CAT mock is NOT 2 hours: 2h exam + ~1.5–2h honest analysis ≈ 4h.
// Students underestimate this massively; the engine must not. The count
// scales with how much journey is left (~1 full mock per ~33 syllabus hours ≈
// one every 1.5–2 weeks at typical pace), floored at 4 (even a nearly-done
// student needs a final mock block) and capped at 15. Deterministic, stated
// once here — every hours→date conversion adds THIS number identically.
export const MOCK_HOURS_EACH = 4;

export function recommendedMockCount(remainingSyllabus: number): number {
  return Math.min(15, Math.max(4, Math.round(remainingSyllabus / 33)));
}

export function remainingMockHours(remainingSyllabus: number): number {
  return recommendedMockCount(remainingSyllabus) * MOCK_HOURS_EACH;
}

export type PaceStatus = 'ahead' | 'on_pace' | 'behind' | 'unrealistic' | 'done';

export interface PaceResult {
  remainingHours: number;
  totalHours: number;
  completedPct: number;      // 0–100, by HOURS of work, not topic count
  daysLeft: number;
  requiredPerDay: number;    // the true number: remaining / daysLeft
  committedPerDay: number | null; // the pace the student chose
  catchUpPerDay: number;     // requiredPerDay − committed, if behind (the "+1.5")
  aheadPerDay: number;       // committed − requiredPerDay, if ahead (roll-over buffer)
  status: PaceStatus;
}

const HALF = (h: number) => Math.round(h * 2) / 2;

// The daily-hours requirement to finish the remaining syllabus by targetDate,
// decomposed into the committed base + any catch-up (or roll-over buffer).
// mockHours (optional) adds the mock budget to the daily requirement WITHOUT
// polluting the syllabus % — the % measures syllabus mastery, the pace
// measures total work including mocks.
export function computeRequiredPace(input: {
  remainingHours: number;
  today: Date;
  targetDate: Date;
  committedPerDay: number | null;
  mockHours?: number;
}): PaceResult {
  const { remainingHours, today, targetDate, committedPerDay } = input;
  const totalHours = totalSyllabusHours();
  const completedPct = totalHours > 0 ? Math.min(100, Math.round(((totalHours - remainingHours) / totalHours) * 100)) : 0;

  const msLeft = targetDate.getTime() - today.getTime();
  const daysLeft = Math.max(1, Math.ceil(msLeft / 86_400_000));

  if (remainingHours <= 0) {
    return { remainingHours: 0, totalHours, completedPct: 100, daysLeft, requiredPerDay: 0, committedPerDay, catchUpPerDay: 0, aheadPerDay: 0, status: 'done' };
  }

  const requiredPerDay = HALF((remainingHours + (input.mockHours ?? 0)) / daysLeft);
  const base = committedPerDay;
  let catchUpPerDay = 0;
  let aheadPerDay = 0;
  let status: PaceStatus;

  if (requiredPerDay > 12) {
    status = 'unrealistic';
    if (base != null) catchUpPerDay = Math.max(0, HALF(requiredPerDay - base));
  } else if (base == null) {
    status = 'on_pace';
  } else if (requiredPerDay > base + 0.25) {
    status = 'behind';
    catchUpPerDay = HALF(requiredPerDay - base);
  } else if (requiredPerDay < base - 0.25) {
    status = 'ahead';
    aheadPerDay = HALF(base - requiredPerDay);
  } else {
    status = 'on_pace';
  }

  return { remainingHours, totalHours, completedPct, daysLeft, requiredPerDay, committedPerDay, catchUpPerDay, aheadPerDay, status };
}
