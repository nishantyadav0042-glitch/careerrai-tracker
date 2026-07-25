'use client';

import { useCallback, useEffect, useState } from 'react';
import { Zap, ChevronRight } from 'lucide-react';
import { track } from '@/lib/journey';
import type { StudyAction } from '@/lib/next-action';

// The first thing on the home screen, and the reason to open the app at all.
//
// Everything else we show is backward-looking — what got logged, what got
// parsed, how far along you are. This is the only surface that answers the
// question a student actually has at 9pm: what do I do with the hour I've got?
//
// The "why" line under each action is not decoration. A recommendation a
// student cannot interrogate is one they stop trusting the first time it feels
// wrong, so every line carries the real number that produced it.
const CHOICES = [30, 60, 120];

export function NextActionCard() {
  const [minutes, setMinutes] = useState(60);
  const [actions, setActions] = useState<StudyAction[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (mins: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/next-action?minutes=${mins}`);
      const json = await res.json();
      setActions((json.actions as StudyAction[]) ?? []);
    } catch {
      setActions([]);
    }
    setLoading(false);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(60); }, [load]);

  // Nothing worth saying yet (brand-new account with no coverage at all) —
  // render nothing rather than an empty promise.
  if (!loading && (!actions || actions.length === 0)) return null;

  return (
    <div className="rounded-2xl border border-stone-900 bg-stone-900 p-4 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500">
            <Zap className="h-4 w-4 text-white" />
          </span>
          <h2 className="text-sm font-bold">Tonight, best use of your time</h2>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5">
        {CHOICES.map((m) => (
          <button
            key={m} type="button"
            onClick={() => { setMinutes(m); track('next_action_time_changed', { minutes: m }); void load(m); }}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
              minutes === m ? 'bg-white text-stone-900' : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? 's' : ''}`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 text-[13px] text-white/50">Working out your best hour…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {actions!.map((a, i) => (
            <div key={`${a.kind}-${i}`} className="rounded-xl bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-[14px] font-bold leading-snug">{a.title}</p>
                <span className="shrink-0 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {a.minutes}m
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-white/60">{a.why}</p>
            </div>
          ))}
          <p className="flex items-center gap-1 pt-0.5 text-[11px] text-white/40">
            Ranked from your own coverage, mocks and coaching dates
            <ChevronRight className="h-3 w-3" />
          </p>
        </div>
      )}
    </div>
  );
}
