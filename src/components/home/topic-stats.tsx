import Link from 'next/link';
import { CheckCircle2, BookOpen, Target, Clock } from 'lucide-react';

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
    <div className="grid grid-cols-4 gap-2">
      {cards.map(({ val, label, Icon, iconColor, bg, href }) => (
        <Link key={label} href={href}
          className="group flex flex-col gap-1.5 rounded-2xl border border-stone-200/70 bg-white p-2.5 shadow-sm transition-colors hover:border-stone-300">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${bg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-lg font-extrabold leading-none text-stone-900 tabular-nums">{val}</div>
            <div className="mt-0.5 text-[10px] font-medium leading-tight text-stone-500">{label}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
