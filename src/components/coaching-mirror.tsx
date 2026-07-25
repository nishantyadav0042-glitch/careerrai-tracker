'use client';

import { useCallback, useEffect, useState } from 'react';
import { Target, Plus, Upload } from 'lucide-react';
import { TimetableUpload } from '@/components/timetable-upload';
import { track } from '@/lib/journey';
import { statusLabel, type TargetProgress, type NextAction } from '@/lib/coaching-progress';

// "Your coaching expects you here. You are actually here."
//
// The one thing a coaching student cannot get anywhere else: their coaching
// hands out a quota (200 LRDI sets, 100 topic tests) and then never tells them
// whether they are keeping up. This answers that, every day, in the coaching's
// own units — and stays quiet whenever the data can't support a verdict.
const TONE: Record<string, string> = {
  ahead:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_track: 'bg-stone-100 text-stone-600 border-stone-200',
  behind:   'bg-rose-50 text-rose-700 border-rose-200',
  done:     'bg-emerald-600 text-white border-emerald-600',
  overdue:  'bg-amber-50 text-amber-700 border-amber-200',
};

export function CoachingMirror() {
  const [rows, setRows] = useState<TargetProgress[] | null>(null);
  const [action, setAction] = useState<NextAction | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timetable/progress');
      const json = await res.json();
      setRows((json.targets as TargetProgress[]) ?? []);
      setAction((json.action as NextAction | null) ?? null);
      // Is there a saved plan at all? Drives the upload entry point below.
      const tt = await fetch('/api/timetable').then((r) => r.json()).catch(() => null);
      setHasPlan(!!tt?.timetable);
    } catch {
      setRows([]);
    }
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch;
     there is no server-rendered value to seed this from */
  useEffect(() => { void load(); }, [load]);

  async function bump(key: string, delta: number) {
    setBusy(key);
    try {
      const res = await fetch('/api/timetable/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, delta }),
      });
      if (res.ok) {
        track('coaching_progress_logged', { key, delta });
        await load();
      }
    } catch { /* leave the number as it was */ }
    setBusy(null);
  }

  // No plan uploaded yet — THIS is the entry point. The scanner previously
  // lived only in Profile > Settings and behind a first-2-days popup, which
  // meant that for most students it was reachable from nowhere at all. It
  // reuses this card's slot rather than adding a fourth thing to the home
  // screen, which is already crowded with surfaces telling students what to do.
  if (hasPlan === false) {
    return (
      <>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
              <Upload className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-900">Have a study plan or timetable?</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
                Upload a photo or PDF — coaching schedule, targets, or your own plan.
              </p>
            </div>
          </div>
          <button
            type="button" onClick={() => setUpload(true)}
            className="mt-3 w-full rounded-xl bg-stone-900 py-2.5 text-[13px] font-semibold text-white"
          >
            Upload my plan
          </button>
        </div>
        {upload && (
          <TimetableUpload onClose={(r) => { setUpload(false); if (r === 'saved') void load(); }} />
        )}
      </>
    );
  }

  // Nothing countable in the plan — render nothing rather than an empty shell.
  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-stone-900">
          <Target className="h-4 w-4 text-white" />
        </span>
        <h2 className="text-sm font-bold text-stone-900">Tonight, on your coaching plan</h2>
        {/* Coaching sends a new sheet every week. Hiding the uploader after the
            first success meant the second week had nowhere to go. */}
        <button
          type="button" onClick={() => setUpload(true)}
          className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-semibold text-orange-600 hover:underline"
        >
          <Upload className="h-3 w-3" /> New plan
        </button>
      </div>

      {/* The action, never the deficit. "Behind by 17" grows every day and
          reads as a countdown to quitting; "3 a day and you finish on time"
          is the same fact framed as something they can actually do. */}
      {action && (
        <p className={`mt-2 text-[13px] font-semibold ${action.needsReplan ? 'text-amber-700' : 'text-stone-800'}`}>
          {action.headline}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-800">{r.label}</p>
              {r.status !== 'unknown' && (
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE[r.status] ?? ''}`}>
                  {statusLabel(r.status)}
                </span>
              )}
            </div>

            {r.count != null ? (
              <>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-stone-100">
                  {/* No red. A progress bar that turns hostile when a student
                      slips is how a tracker becomes something they avoid. */}
                  <div className="h-full bg-stone-800" style={{ width: `${r.pctDone ?? 0}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-stone-500">
                  <span className="tabular-nums">
                    {r.done} of {r.count}
                    {/* The daily ask, not the shortfall. We deliberately do NOT
                        show "expected by now" — a running deficit is the number
                        that makes students stop opening the app. */}
                    {r.requiredPerDay != null && r.status !== 'done' && (
                      <> · {r.requiredPerDay}/day left</>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {[1, 5].map((n) => (
                      <button
                        key={n} type="button" disabled={busy === r.key}
                        onClick={() => bump(r.key, n)}
                        className="flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 font-bold text-stone-700 disabled:opacity-50"
                      >
                        <Plus className="h-2.5 w-2.5" />{n}
                      </button>
                    ))}
                  </span>
                </div>
              </>
            ) : (
              // No number attached — "finish Arithmetic revision". Showing a
              // bar here would fake a precision the target never had.
              <p className="mt-1 text-[11px] text-stone-400">No count given by your coaching</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
