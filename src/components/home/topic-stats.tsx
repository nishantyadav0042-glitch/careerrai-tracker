import Link from 'next/link';
import { CheckCircle2, BookOpen, Circle } from 'lucide-react';

// "Where you stand today" — three numbers a student actually acts on: topics
// covered, in progress, and still untouched. (Total topics and total study
// time were noise — removed per founder feedback.)
export function TopicStats({ covered, inProgress, untouched }: {
  covered: number; inProgress: number; untouched: number;
}) {
  const cards = [
    { val: covered, label: 'Studied', Icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { val: inProgress, label: 'In progress', Icon: BookOpen, color: 'text-orange-500', bg: 'bg-orange-50' },
    { val: untouched, label: 'Not started', Icon: Circle, color: 'text-stone-400', bg: 'bg-stone-100' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(({ val, label, Icon, color, bg }) => (
        <Link key={label} href="/student/blueprint"
          className="flex items-center gap-2 rounded-2xl border border-stone-200/70 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-stone-300">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 leading-none">
            <div className="text-lg font-extrabold text-stone-900 tabular-nums">{val}</div>
            <div className="mt-0.5 truncate text-[10.5px] font-medium text-stone-500">{label}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
