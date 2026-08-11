// ── The 7-day forward strip (Blueprint) ─────────────────────────────────────
//
// A WINDOW ONTO THE ONE PLANNER, nothing more. This file used to hold a second
// scheduler: it sorted every remaining topic once by baseCoverageScore and
// bin-packed that queue into days. The whole plan called it too. So on 11 Aug
// the same Tuesday rendered three ways — Home's chooseSectionDay, the Blueprint
// strip, and the Whole Plan — and the founder saw two of them side by side and
// disagreeing about which topics the day held.
//
// It now delegates to plan-projection.projectPlan, which is the same authority
// Home runs (chooseSectionDay for the choice, dayShape for the split), walked
// forward. The only thing this file still decides is CAPACITY: how many hours a
// day of this strip is allowed to hold.

import type { CoverageStatus } from './study-pace';
import { projectPlan, type StudyMode } from './plan-projection';
import type { Section } from './prep-model';

export type { StudyMode };

export interface DayPlanItem { topic: string; section: string; hours: number; mode: StudyMode }
export interface DayPlan { iso: string; label: string; items: DayPlanItem[]; totalHours: number }

function dayLabel(date: Date, offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

const half = (h: number) => Math.round(h * 2) / 2;
const DAY_MS = 86_400_000;

export interface WeekPlanOptions {
  /** The same weakest section Home leans on, so the mix tilts the same way. */
  weakestSection?: Section | null;
  /** Days to the student's chosen syllabus-finish date; null = not set. */
  daysToSyllabusTarget?: number | null;
  isWorkingProfessional?: boolean;
  isRepeater?: boolean;
  /** Topics the student starred in the Preparation Map. */
  priorityTopics?: string[];
}

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
  options?: WeekPlanOptions,
): DayPlan[] {
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

  const dates = Array.from({ length: days }, (_, d) => new Date(today.getTime() + d * DAY_MS));

  const projected = projectPlan({
    days: dates.map((date) => ({
      date: date.toISOString().split('T')[0],
      capacityHours: cap,
      weekend: date.getDay() === 0 || date.getDay() === 6,
    })),
    coverage: rows,
    effort,
    weakestSection: options?.weakestSection ?? null,
    daysToSyllabusTarget: options?.daysToSyllabusTarget ?? null,
    isWorkingProfessional: options?.isWorkingProfessional,
    isRepeater: options?.isRepeater,
    priorityTopics: options?.priorityTopics,
  });

  return projected.map((p, d) => ({
    iso: p.date,
    label: dayLabel(dates[d], d),
    items: p.items.map((i) => ({ topic: i.topic, section: i.section, hours: i.hours, mode: i.mode })),
    totalHours: half(p.items.reduce((s, i) => s + i.hours, 0)),
  }));
}

/** Re-exported so callers that only need the status→verb map keep one import. */
export type { CoverageStatus };
