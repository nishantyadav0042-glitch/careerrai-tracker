'use client';

import { useEffect, useState } from 'react';
import { track } from '@/lib/journey';

// ── The proof, shown before the ask ─────────────────────────────────────────
//
// Founder, 14 Aug: "show a snapshot of how you timetable, so they feel ki yaar
// kuch tagda dekhne ko milne wala hai — and they don't skip app install."
//
// He is right, and the reason is structural: the install screen used to ask
// for a download on the strength of a PROMISE ("we remind you what to study").
// A promise is what every app on the student's phone already made. By this
// point in onboarding we have their hours, their exam date, their weak
// section — the plan genuinely exists. Showing it converts the ask from
// "trust us" to "look what is already yours", which is a different question.
//
// EVERY NUMBER AND EVERY TOPIC HERE IS THIS STUDENT'S OWN. This calls the same
// /api/routine/today the app itself calls, and renders what comes back. There
// is no sample day, no illustrative timetable, no blurred teaser. If the call
// fails or the plan is empty the component renders NOTHING and the screen
// falls back to its own copy — a fabricated preview would be the invented-data
// failure TRUST-OS rule 1 forbids, and it would be found out on the very next
// screen, which is the worst place to be caught.
//
// Nothing is blurred or locked either. A lock would say "we built something
// good and we are holding it hostage until you install", and a student who
// cannot unlock it just leaves — they do not install. The plan is theirs
// whether they install or not; the app is how it reaches them every morning,
// and that is the honest reason to tap.

interface Task {
  id: string;
  section: string;
  topic: string | null;
  label: string;
  target: string | null;
  estMinutes: number;
}

interface Snapshot {
  tasks: Task[];
  estMinutes: number;
  phase: string;
  weeksRemaining: number | null;
}

// Same four identities the Daily Pick uses — one section palette across the
// product, so a colour a student learns here still means QA on day 40.
const TONE: Record<string, string> = {
  QA: 'bg-indigo-100 text-indigo-700',
  DILR: 'bg-emerald-100 text-emerald-700',
  VARC: 'bg-rose-100 text-rose-700',
  General: 'bg-stone-100 text-stone-600',
};

/** "3h 20m", "45m" — never "3.33 hours". */
export function readableMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** How many task rows the card shows before it collapses into "+N more". */
export const PREVIEW_ROWS = 3;

export function PlanSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/routine/today');
        if (!res.ok) throw new Error('plan unavailable');
        const json = await res.json();
        const tasks = (json?.routine?.tasks ?? []) as Task[];
        if (!alive) return;
        if (tasks.length === 0) { setFailed(true); return; }
        setSnap({
          tasks,
          estMinutes: Number(json?.routine?.estMinutes ?? 0),
          phase: String(json?.routine?.phase ?? ''),
          weeksRemaining: json?.roadmap?.weeksRemaining ?? null,
        });
        track('plan_snapshot_shown', { tasks: tasks.length });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one fetch, on mount
  }, []);

  // The plan could not be shown. Say nothing rather than something invented —
  // the screen around this still works on its own.
  if (failed) return null;

  // The wait is not dead time: this request is the one that actually BUILDS
  // the day, so "Building your timetable…" is a literal description of what
  // the server is doing, and it sets up the reveal instead of flashing it in.
  if (!snap) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4 text-left">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
          Building your timetable…
        </p>
        <div className="mt-3 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="h-4 w-11 shrink-0 animate-pulse rounded-full bg-stone-100" />
              <div className="h-3 flex-1 animate-pulse rounded bg-stone-100" style={{ animationDelay: `${i * 120}ms` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const shown = snap.tasks.slice(0, PREVIEW_ROWS);
  const more = snap.tasks.length - shown.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm">
      <div className="flex items-baseline justify-between border-b border-stone-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Your timetable</p>
          {/* The phase and the countdown are the two facts that say "this was
              built for a date", not assembled from a generic syllabus. */}
          <p className="text-[15px] font-bold text-stone-900">
            Today
            {snap.phase && <span className="ml-1.5 text-[12px] font-semibold text-stone-400">{snap.phase}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-extrabold text-stone-900">{readableMinutes(snap.estMinutes)}</p>
          {snap.weeksRemaining != null && (
            <p className="text-[10.5px] font-semibold text-orange-600">{snap.weeksRemaining} weeks to CAT</p>
          )}
        </div>
      </div>

      <ul className="divide-y divide-stone-100">
        {shown.map((t) => (
          <li key={t.id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${TONE[t.section] ?? TONE.General}`}>
              {t.section}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-stone-900">
                {t.topic ?? t.label}
              </p>
              {/* The target is what makes it a timetable rather than a
                  syllabus: a thing that can be finished, not a subject to
                  stare at. It is the single most convincing line here. */}
              {t.target && <p className="mt-0.5 truncate text-[11.5px] text-stone-500">{t.target}</p>}
            </div>
            <span className="mt-0.5 shrink-0 text-[11px] font-bold text-stone-400">{t.estMinutes}m</span>
          </li>
        ))}
      </ul>

      {more > 0 && (
        <p className="border-t border-stone-100 px-4 py-2 text-[11.5px] font-semibold text-stone-400">
          + {more} more {more === 1 ? 'block' : 'blocks'} today
        </p>
      )}
    </div>
  );
}
