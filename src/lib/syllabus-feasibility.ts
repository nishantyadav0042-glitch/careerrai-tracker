import { TOPIC_METADATA } from '@/lib/topics-constants';
import { remainingMockHours } from '@/lib/study-pace';

// Onboarding capacity reality-check (founder, 22 July): a student must never be
// handed a plan that silently demands more hours than they said they have. When
// the finish date they picked and the daily hours they can give CONTRADICT, we
// stop and say so — boldly — so they choose an honest date instead of a
// fascinating one. Pranav is the proof: 30-Aug at his real hours forced ~9h/day
// and 72 questions per topic. Better a true date they hit than a dream they abandon.

export interface Feasibility {
  totalHours: number;           // full syllabus + mock hours from zero
  daysToDate: number;
  requiredHoursPerDay: number;  // what THEIR date actually demands
  hoursPerDay: number;          // what they said they can give
  feasible: boolean;
  realisticDateIso: string;     // the date their stated hours can actually hit
  realisticDateLabel: string;
  afterExam: boolean;           // even the realistic date lands after CAT
}

function fullSyllabusHours(): number {
  return Object.values(TOPIC_METADATA).reduce((sum, m) => sum + m.estimatedHours, 0);
}

// Approx CAT date — last Sunday of November — for the "even a realistic pace
// overshoots the exam" warning.
function catApprox(now: Date): Date {
  const year = now.getMonth() > 10 ? now.getFullYear() + 1 : now.getFullYear();
  const nov30 = new Date(year, 10, 30);
  return new Date(year, 10, 30 - nov30.getDay());
}

export function computeFeasibility(ambitionDateIso: string | null | undefined, hoursPerDay: number | null | undefined, now: Date = new Date()): Feasibility | null {
  if (!ambitionDateIso || !hoursPerDay || hoursPerDay <= 0) return null;
  const syllabus = fullSyllabusHours();
  const totalHours = Math.round(syllabus + remainingMockHours(syllabus));

  const target = new Date(ambitionDateIso + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  const daysToDate = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 86_400_000));
  const requiredHoursPerDay = Math.round((totalHours / daysToDate) * 10) / 10;

  // A 5% cushion so "6.2 vs 6" doesn't nag; a real contradiction is clear air.
  const feasible = requiredHoursPerDay <= hoursPerDay * 1.05;

  const daysNeeded = Math.ceil(totalHours / hoursPerDay);
  const realistic = new Date(now.getTime() + daysNeeded * 86_400_000);
  return {
    totalHours,
    daysToDate,
    requiredHoursPerDay,
    hoursPerDay,
    feasible,
    realisticDateIso: realistic.toISOString().slice(0, 10),
    realisticDateLabel: realistic.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
    afterExam: realistic > catApprox(now),
  };
}
