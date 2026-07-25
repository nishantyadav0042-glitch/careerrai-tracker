import type { CoachingTarget, TimetableSection } from '@/lib/timetable';

// The Coaching Progress Mirror.
//
// "Rodha expects you to be here. You are actually here." That is the whole
// feature, and the only thing that makes it worth anything is that the numbers
// are true. So every function here refuses to answer when the inputs can't
// support an answer:
//
//   * no deadline        -> no pace, no verdict. We show done/total and stop.
//   * no count           -> a completable target, not a countable one. No maths.
//   * deadline passed    -> report it as over, never a negative daily rate.
//
// A planner that confidently tells a student "you're on track" when it cannot
// know is worse than one that says nothing.

export type TargetStatus = 'ahead' | 'on_track' | 'behind' | 'done' | 'overdue' | 'unknown';

export interface TargetProgress {
  key: string;
  label: string;
  count: number | null;
  done: number;
  section: TimetableSection | null;
  deadline: string | null;
  /** null when there is no deadline or no count — we cannot honestly say. */
  daysLeft: number | null;
  /** How many they should have finished by now, if we can know. */
  expectedByNow: number | null;
  /** What it takes per day from here to still finish on time. */
  requiredPerDay: number | null;
  status: TargetStatus;
  pctDone: number | null;
}

/**
 * Stable across re-uploads. Keyed on kind+section, never the label, because
 * coaching rewords the same target constantly and a label key would reset
 * progress every time.
 */
export function targetKey(t: Pick<CoachingTarget, 'kind' | 'section'>): string {
  return `${t.kind}:${t.section ?? 'any'}`;
}

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from `now` to `iso`, floored at day granularity. */
function daysBetween(iso: string, now: Date): number {
  const target = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(target)) return NaN;
  return Math.round((target - startOfDayUtc(now)) / 86_400_000);
}

export function computeTargetProgress(
  target: CoachingTarget,
  done: number,
  startedAt: string | null,
  now: Date = new Date(),
): TargetProgress {
  const key = targetKey(target);
  const count = target.count;
  const safeDone = Math.max(0, Math.floor(done));

  const base: TargetProgress = {
    key, label: target.label, count, done: safeDone,
    section: target.section, deadline: target.deadline,
    daysLeft: null, expectedByNow: null, requiredPerDay: null,
    status: 'unknown', pctDone: null,
  };

  // No number to hit — "complete Arithmetic revision" is a yes/no, not a rate.
  if (count == null || count <= 0) return base;

  const pctDone = Math.min(100, Math.round((safeDone / count) * 100));
  base.pctDone = pctDone;

  if (safeDone >= count) return { ...base, status: 'done', daysLeft: null };

  // Without a deadline we can show how far along they are, but any claim about
  // pace would be invented.
  if (!target.deadline) return base;

  const daysLeft = daysBetween(target.deadline, now);
  if (Number.isNaN(daysLeft)) return base;
  base.daysLeft = daysLeft;

  if (daysLeft <= 0) return { ...base, status: 'overdue' };

  const remaining = count - safeDone;
  base.requiredPerDay = Math.ceil(remaining / daysLeft);

  // Expected-by-now needs a start point. Without one we still give the required
  // rate (that only needs the deadline), but we won't grade them ahead/behind.
  if (!startedAt) return base;

  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(`${target.deadline}T00:00:00Z`);
  if (Number.isNaN(startMs) || endMs <= startMs) return base;

  const elapsed = now.getTime() - startMs;
  const total = endMs - startMs;
  const fraction = Math.min(1, Math.max(0, elapsed / total));
  const expected = Math.round(count * fraction);
  base.expectedByNow = expected;

  // Tolerance is measured against what they SHOULD have done by now, not
  // against the total. A band of 10%-of-total means 20 sets out of 200, which
  // would call a student sitting on 37 when 54 was due "on track" — 31% short,
  // reported as fine. That is the exact lie this feature exists to not tell.
  // 15% of `expected` keeps day-to-day lumpiness from flipping the verdict
  // while still catching a real shortfall.
  const band = Math.max(1, Math.round(expected * 0.15));
  if (safeDone >= expected + band) base.status = 'ahead';
  else if (safeDone <= expected - band) base.status = 'behind';
  else base.status = 'on_track';

  return base;
}

export function statusLabel(s: TargetStatus): string {
  switch (s) {
    case 'ahead': return 'Ahead';
    case 'on_track': return 'On track';
    case 'behind': return 'Behind';
    case 'done': return 'Done';
    case 'overdue': return 'Date passed';
    default: return '';
  }
}

/** One honest headline for the whole set, or null when we can't say. */
export function overallHeadline(rows: TargetProgress[]): string | null {
  const graded = rows.filter((r) => r.status === 'ahead' || r.status === 'on_track' || r.status === 'behind');
  if (graded.length === 0) return null;
  const behind = graded.filter((r) => r.status === 'behind');
  if (behind.length === 0) return `On track on all ${graded.length}.`;
  const worst = behind.sort((a, b) => (b.expectedByNow! - b.done) - (a.expectedByNow! - a.done))[0];
  const gap = worst.expectedByNow! - worst.done;
  return `Behind on ${behind.length} of ${graded.length} — ${worst.label} is ${gap} short.`;
}
