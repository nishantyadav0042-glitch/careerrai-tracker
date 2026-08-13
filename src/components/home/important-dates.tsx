import { CheckCircle2, ClipboardList, Repeat2 } from 'lucide-react';

// The three anchors of the plan: syllabus (the student's target date), weekly
// mocks (August onwards — AIMCAT/SIMCAT season, alongside syllabus), and
// rolling revision (starts with the first studied topics, not a far-away
// date). One tight strip — no big cards. Daily hours live in the progress
// card above, not repeated here.
export function ImportantDates({ syllabus, mocks, revision }: {
  syllabus: string; mocks: string; revision: string;
}) {
  // Restyled 13 Aug to match the dark treatment on the rest of Home.
  const items = [
    { Icon: CheckCircle2, color: 'text-emerald-400', label: 'Syllabus', date: syllabus },
    { Icon: ClipboardList, color: 'text-indigo-400', label: 'Mocks', date: mocks },
    { Icon: Repeat2, color: 'text-orange-400', label: 'Revision', date: revision },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-stone-900 px-2 py-2.5">
      {items.map(({ Icon, color, label, date }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
          <div className="min-w-0 leading-none">
            <div className="text-[10px] font-medium text-stone-400">{label}</div>
            <div className="mt-0.5 text-[12.5px] font-bold text-white">{date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
