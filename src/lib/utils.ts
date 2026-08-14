import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
}

// getTodayIST and calcStreak were deleted in the 14 Aug dead-code sweep. Both
// had zero importers; ARCHITECTURE-REVIEW-2026-07 §10 already suspected it and
// asked for "one more dynamic-reference sweep" before deleting. That sweep has
// now been run — nine mechanisms, including dynamic imports, barrels and bare
// string references — and both were reachable from nothing.
//
// Deleted rather than reconciled, because both were WRONG as well as unused:
//
//   getTodayIST  returned the IST-MIDNIGHT date. The study day rolls at 05:30
//                IST (lib/study-day), so it named the wrong day for five and a
//                half hours out of every twenty-four. Use getLogDateString.
//   calcStreak   was a third streak rule: it recomputed from raw report_date[]
//                with no shield and no decay, so it disagreed with
//                momentumStreak for any student holding a shield. lib/streak-
//                utils owns this question — liveStreak, isStreakActive,
//                momentumStreak.
//
// A dead implementation of a rule we already got right is not harmless. It is
// the version the next person copies because it is short.
