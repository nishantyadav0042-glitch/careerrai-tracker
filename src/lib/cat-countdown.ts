import { resolveCatExamDate } from '@/lib/routine-engine';

// Urgency copy for the paywall, computed from the real CAT date instead of a
// hardcoded string. "Only 4 months to CAT" was literal text in two components —
// still true in July, quietly false by October, and a claim we'd be making to
// every student on the sales screen.
export function catUrgencyLabel(now: Date = new Date(), attemptYear?: number | null): string {
  const exam = resolveCatExamDate(now, attemptYear);
  const days = Math.ceil((exam.getTime() - now.getTime()) / 86_400_000);

  if (days <= 0) return 'CAT is here';
  if (days === 1) return 'Only 1 day to CAT';
  if (days <= 30) return `Only ${days} days to CAT`;

  const months = Math.round(days / 30);
  if (months <= 1) return 'Under a month to CAT';
  return `Only ${months} months to CAT`;
}
