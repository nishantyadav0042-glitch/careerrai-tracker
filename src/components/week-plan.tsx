import type { DayPlan, StudyMode } from '@/lib/study-forecast';

// The forward look-ahead: the next several days laid out with the topics
// they'll actually work, sized to their daily hours. Makes the plan feel like
// a road ahead, not just today. Gentle section tints (founder: colourful but
// not loud); the in-app palette stays otherwise restrained.
const SECTION_TINT: Record<string, string> = {
  VARC: 'bg-violet-100 text-violet-700',
  DILR: 'bg-blue-100 text-blue-700',
  QA: 'bg-emerald-100 text-emerald-700',
};

const MODE_ICON: Record<StudyMode, string> = { learn: '📖', practice: '✍️', revise: '🔄' };
const MODE_WORD: Record<StudyMode, string> = { learn: 'Learn', practice: 'Practice', revise: 'Revise' };

export function WeekPlan({ plan }: { plan: DayPlan[] }) {
  const active = plan.filter((d) => d.items.length > 0);
  if (active.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Your next {active.length} days</h2>
        <span className="text-[10px] font-medium text-stone-400">at your current pace</span>
      </div>
      <div className="space-y-2.5">
        {active.map((day) => (
          <div key={day.iso} className="rounded-xl border border-stone-100 bg-stone-50/60 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-bold text-stone-900">{day.label}</p>
              <span className="text-[10px] font-semibold text-stone-400">{day.totalHours}h planned</span>
            </div>
            <div className="space-y-1">
              {day.items.map((it, i) => (
                <div key={`${it.topic}-${i}`} className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[8.5px] font-bold ${SECTION_TINT[it.section] ?? 'bg-stone-200 text-stone-600'}`}>{it.section}</span>
                  <span className="text-[11px]" aria-hidden>{MODE_ICON[it.mode]}</span>
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-stone-800">{it.topic}</p>
                  <span className="shrink-0 text-[10px] text-stone-400">{MODE_WORD[it.mode]} · {it.hours}h</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[10.5px] leading-relaxed text-stone-400">
        Rebuilds every day from what you&apos;ve actually covered — miss a day and it reshuffles, get ahead and it lightens.
      </p>
    </div>
  );
}
