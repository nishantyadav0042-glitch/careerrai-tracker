import Link from 'next/link';
import { CalendarDays, ArrowRight } from 'lucide-react';

// The three milestone cards under Today's Plan (mockup): the next-7-days pace,
// when the Mock Intensive begins (weekly mocks — the CAT backbone), and when the
// Revision Sprint begins. Dates are computed from the student's own CAT
// timeline, not hardcoded.

interface Milestone {
  label: string;
  big: string;      // "7h" or "24"
  sub: string;      // "planned daily" or "Aug"
  cta: string;
  href: string;
  iconBg: string;
  iconColor: string;
}

export function HomeMilestones({ dailyHours, mockDay, mockMon, revDay, revMon }: {
  dailyHours: string;
  mockDay: string; mockMon: string;
  revDay: string;  revMon: string;
}) {
  const cards: Milestone[] = [
    { label: 'Your next 7 days', big: dailyHours, sub: 'planned daily', cta: 'View schedule', href: '/student/blueprint', iconBg: 'bg-stone-100', iconColor: 'text-stone-500' },
    { label: 'Mock intensive begins', big: mockDay, sub: mockMon, cta: 'See details', href: '/student/blueprint', iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { label: 'Revision sprint begins', big: revDay, sub: revMon, cta: 'See details', href: '/student/blueprint', iconBg: 'bg-orange-50', iconColor: 'text-orange-500' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div key={c.label} className="flex flex-col rounded-2xl border border-stone-200/70 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-stone-400">{c.label}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.iconBg}`}>
              <CalendarDays className={`h-4 w-4 ${c.iconColor}`} />
            </div>
            <div className="leading-none">
              <span className="text-xl font-extrabold text-stone-900">{c.big}</span>
              <span className="ml-0.5 text-[11px] font-medium text-stone-500">{c.sub}</span>
            </div>
          </div>
          <Link href={c.href} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-stone-700 hover:text-stone-900">
            {c.cta} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ))}
    </div>
  );
}
