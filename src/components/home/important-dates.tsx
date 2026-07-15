import { CheckCircle2, ClipboardList, Repeat2 } from 'lucide-react';

// The three dates that anchor the plan: syllabus done, mocks begin, revision
// begins. One tight strip — no big cards, no "next 7 days" (that lives in My
// CAT Plan now). Daily hours live in the progress card above, not repeated here.
export function ImportantDates({ syllabus, mocks, revision }: {
  syllabus: string; mocks: string; revision: string;
}) {
  const items = [
    { Icon: CheckCircle2, color: 'text-emerald-600', label: 'Syllabus', date: syllabus },
    { Icon: ClipboardList, color: 'text-indigo-600', label: 'Mocks', date: mocks },
    { Icon: Repeat2, color: 'text-orange-500', label: 'Revision', date: revision },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-stone-200/70 bg-white px-2 py-2 shadow-sm">
      {items.map(({ Icon, color, label, date }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
          <div className="min-w-0 leading-none">
            <div className="text-[10px] font-medium text-stone-400">{label}</div>
            <div className="mt-0.5 text-[12.5px] font-bold text-stone-900">{date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
