import Link from 'next/link';
import { CheckCircle2, BookOpen, Target, Clock, ChevronRight } from 'lucide-react';

// The four at-a-glance study stats under the progress card (15 Jul mockup):
// completed / in-progress / total topics, and total study time. Each is a door
// to where that detail lives.

function fmtStudy(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface TopicStatsProps {
  completed: number;
  inProgress: number;
  total: number;
  studyHours: number;
}

export function TopicStats({ completed, inProgress, total, studyHours }: TopicStatsProps) {
  const cards = [
    { val: String(completed), label: 'Completed topics', Icon: CheckCircle2, iconColor: 'text-emerald-600', bg: 'bg-emerald-50', href: '/student/blueprint' },
    { val: String(inProgress), label: 'In progress topics', Icon: BookOpen, iconColor: 'text-orange-500', bg: 'bg-orange-50', href: '/student/blueprint' },
    { val: String(total), label: 'Total topics', Icon: Target, iconColor: 'text-indigo-600', bg: 'bg-indigo-50', href: '/student/blueprint' },
    { val: fmtStudy(studyHours), label: 'Total study time', Icon: Clock, iconColor: 'text-sky-600', bg: 'bg-sky-50', href: '/student/reports' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {cards.map(({ val, label, Icon, iconColor, bg, href }) => (
        <Link key={label} href={href}
          className="group flex flex-col gap-2 rounded-2xl border border-stone-200/70 bg-white p-3.5 shadow-sm transition-colors hover:border-stone-300">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${bg}`}>
            <Icon className={`h-[18px] w-[18px] ${iconColor}`} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-2xl font-extrabold leading-none text-stone-900 tabular-nums">{val}</div>
            <div className="mt-1 flex items-center gap-0.5 text-[11.5px] font-medium leading-tight text-stone-500">
              <span>{label}</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
