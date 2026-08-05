'use client';

import { useState } from 'react';
import { ThumbsUp, Target, Check } from 'lucide-react';

// What your buddy said after the last call, and what to do about it.
//
// Founder, 5 Aug: one strength, one weakness, and the 3–4 things to do. The
// point is that a session stops evaporating the moment the call ends — a
// student who came away thinking "that was nice" now has two sentences and a
// checklist they can act on before next time.
//
// Deliberately shows the STRENGTH first. These are 18-year-olds being told
// what they got wrong by an IIM student; leading with the fix makes the whole
// card feel like a report card, and report cards get avoided.

export interface DebriefTask {
  id: string;
  task: string;
  completedAt: string | null;
}

export function SessionDebrief({
  buddyFirstName, strength, weakness, tasks,
}: {
  buddyFirstName: string;
  strength: string | null;
  weakness: string | null;
  tasks: DebriefTask[];
}) {
  const [items, setItems] = useState(tasks);
  const [busy, setBusy] = useState<string | null>(null);

  if (!strength && !weakness && items.length === 0) return null;

  async function toggle(id: string, nextDone: boolean) {
    setBusy(id);
    // Optimistic: ticking a box must feel instant. Reverted if the save fails,
    // so the checklist can never quietly disagree with what was stored.
    const before = items;
    setItems(items.map((t) => (t.id === id ? { ...t, completedAt: nextDone ? new Date().toISOString() : null } : t)));
    try {
      const res = await fetch('/api/student/assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: id, done: nextDone }),
      });
      if (!res.ok) setItems(before);
    } catch {
      setItems(before);
    }
    setBusy(null);
  }

  const doneCount = items.filter((t) => t.completedAt).length;

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-600">
          From your last call with {buddyFirstName}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {strength && (
          <div className="flex gap-2.5">
            <ThumbsUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Went well</p>
              <p className="text-[13.5px] leading-relaxed text-stone-800">{strength}</p>
            </div>
          </div>
        )}

        {weakness && (
          <div className="flex gap-2.5">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700">Work on this</p>
              <p className="text-[13.5px] leading-relaxed text-stone-800">{weakness}</p>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="border-t border-stone-100 pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Before next time</p>
              <p className="text-[11px] font-semibold tabular-nums text-stone-400">{doneCount}/{items.length}</p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {items.map((t) => {
                const done = !!t.completedAt;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id, !done)}
                      disabled={busy === t.id}
                      aria-pressed={done}
                      className="flex w-full items-start gap-2.5 rounded-xl px-1 py-1.5 text-left active:bg-stone-50 disabled:opacity-60"
                    >
                      <span
                        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-2 transition-colors ${
                          done ? 'border-teal-600 bg-teal-600' : 'border-stone-300'
                        }`}
                      >
                        {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className={`text-[13.5px] leading-snug ${done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                        {t.task}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
