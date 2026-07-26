'use client';

import { useEffect, useState } from 'react';
import { studyDayString } from '@/lib/study-day';
import { Lightbulb } from 'lucide-react';

// The daily insight as a passing cloud (founder, 25 Jul): it drifts in when
// Home opens, stays 7 seconds, and removes itself. No card taking permanent
// space, no ✕ to manage — the insight is a whisper, not a widget. Shown once
// per day per device; tapping it dismisses early.
const VISIBLE_MS = 7000;

function seenKey(): string {
  return `cr_insight_cloud_day_${studyDayString()}`;
}

export function InsightBubble({ title, text }: { title: string; text: string }) {
  const [phase, setPhase] = useState<'hidden' | 'in' | 'out'>('hidden');

  useEffect(() => {
    try { if (localStorage.getItem(seenKey())) return; } catch { return; }
    try { localStorage.setItem(seenKey(), '1'); } catch { /* storage blocked */ }

    const t1 = setTimeout(() => setPhase('in'), 700);
    const t2 = setTimeout(() => setPhase('out'), 700 + VISIBLE_MS);
    const t3 = setTimeout(() => setPhase('hidden'), 700 + VISIBLE_MS + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      role="status"
      onClick={() => setPhase('hidden')}
      className={`fixed bottom-20 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 cursor-pointer
        rounded-2xl border border-indigo-100 bg-white/95 p-3 shadow-lg backdrop-blur
        transition-all duration-500 ${phase === 'in' ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-50">
          <Lightbulb className="h-3.5 w-3.5 text-indigo-600" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-stone-900">{title}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-stone-600">{text}</p>
        </div>
      </div>
    </div>
  );
}
